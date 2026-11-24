import type { UserScope } from "@/lib/query/scope";
import { API_URL, NETWORK_LABEL, NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { API_ERROR_CODES, type ApiCode, type ApiErrorCode } from "@/lib/errors/codes";
import { messageFor } from "@/lib/errors/messages";
import { currentTrace, newTrace, toTraceparent, type TraceCtx } from "@/lib/observability/tracing";

export { API_URL };

export interface ApiRequestOptions {
  expectScope?: UserScope;
  signal?: AbortSignal;
  trace?: TraceCtx;
  headers?: HeadersInit;
  /** Per-user-action idempotency key (reused across retries of the same action). */
  idempotencyKey?: string;
  stepUp?: { reason: string } | false;
  /** Internal flag to prevent infinite loops when retrying after step-up auth. */
  _stepUpRetried?: boolean;
}
/** Structural match for a zod schema, so this module does not import zod itself. */
export interface ResponseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}
type SchemaOptions<T> = ApiRequestOptions & { schema?: ResponseSchema<T> };
const sessionListeners = new Set<() => void>();
const authInvalidListeners = new Set<() => void>();
export function onAuthSessionChanged(listener: () => void) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}
export function onAuthInvalid(listener: () => void) {
  authInvalidListeners.add(listener);
  return () => { authInvalidListeners.delete(listener); };
}

/**
 * Clears the current auth session and notifies `onAuthInvalid` listeners,
 * guarded so a stale failure (e.g. from an older socket connection) cannot
 * clear a newer session.
 */
export function notifyAuthInvalid(expectedSessionId?: string | null, expectedToken?: string | null): boolean {
  const currentSessionId = getStoredSessionId();
  const currentToken = getStoredToken();
  if (expectedSessionId !== undefined && expectedSessionId !== currentSessionId) return false;
  if (expectedToken !== undefined && SESSION_MODE !== "cookie" && expectedToken !== currentToken) return false;
  clearAuthSession();
  authInvalidListeners.forEach((listener) => listener());
  return true;
}

export type StepUpPromptHandler = (details: { maxAgeSeconds?: number; reauthenticate?: boolean }) => Promise<boolean>;
let stepUpHandler: StepUpPromptHandler | null = null;

export function registerStepUpHandler(handler: StepUpPromptHandler | null) {
  stepUpHandler = handler;
  return () => {
    if (stepUpHandler === handler) stepUpHandler = null;
  };
}

export interface StepUpRequest {
  wallet: string;
  sessionId: string;
  reason: string;
  maxAgeSeconds: number;
  network: string;
  networkPassphrase: string;
  signal: AbortSignal;
}

export type StepUpResult = "ok" | "cancelled";
export type StepUpHandler = (req: StepUpRequest) => Promise<StepUpResult>;

let scopedStepUpHandler: StepUpHandler | null = null;
const stepUpFlights = new Map<string, Promise<StepUpResult>>();
let lastMaxAgeSeconds = 300;
let lastStepUpOkAt = 0;

export function stepUpCompletedAt(): number {
  return lastStepUpOkAt;
}

/** Remember the server's window so the freshness hook can tick without a token claim. */
export function noteStepUpMaxAge(seconds: number | undefined): void {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) lastMaxAgeSeconds = seconds;
}

export function stepUpMaxAgeSeconds(): number {
  return lastMaxAgeSeconds;
}

export function registerScopedStepUpHandler(handler: StepUpHandler | null) {
  scopedStepUpHandler = handler;
  return () => {
    if (scopedStepUpHandler === handler) scopedStepUpHandler = null;
  };
}

/** One prompt per wallet/session, even when several requests get 403 together. */
export function runStepUp(req: StepUpRequest): Promise<StepUpResult> {
  const key = `${req.wallet}|${req.sessionId}`;
  const existing = stepUpFlights.get(key);
  if (existing) return existing;
  const flight = Promise.resolve()
    .then(async () => {
      const result: StepUpResult = scopedStepUpHandler ? await scopedStepUpHandler(req) : "cancelled";
      if (result === "ok") lastStepUpOkAt = Date.now();
      return result;
    })
    .finally(() => stepUpFlights.delete(key));
  stepUpFlights.set(key, flight);
  return flight;
}

export class StepUpRequiredError extends ApiError {
  readonly maxAgeSeconds: number;

  constructor(details: { maxAgeSeconds?: number; reauthenticate?: boolean } = {}) {
    super({ code: "STEP_UP_REQUIRED", message: messageFor("api.STEP_UP_REQUIRED"), details }, 403);
    this.name = "StepUpRequiredError";
    this.maxAgeSeconds = typeof details.maxAgeSeconds === "number" ? details.maxAgeSeconds : lastMaxAgeSeconds;
  }
}

export class StepUpCancelledError extends Error {
  readonly kind = "rejected";

  constructor() {
    super("Additional wallet authentication was cancelled.");
    this.name = "StepUpCancelledError";
  }
}

/** Routes whose server handlers accept and de-duplicate an Idempotency-Key. */
export const idempotentRoutes: readonly string[] = [
  "/trade/copy",
  "/trade/copy/",
  "/traces/verify",
  "/traces/access/allowance",
  "/markets/generate",
];

export function routeAllowsReplay(path: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return true;
  if (verb !== "PUT" && verb !== "PATCH") return false;
  return idempotentRoutes.some((route) => path === route || path.startsWith(route.endsWith("/") ? route : `${route}/`));
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /** Seconds from the response's `Retry-After` header (429 / 409), when the backend sent one. */
  readonly retryAfterSeconds?: number;
  readonly errorCode: ApiCode;
  readonly serverMessage: string;
  readonly headers?: Headers;

  constructor(
    errorOrStatus: ApiErrorPayload | number,
    statusOrCode?: number | string,
    retryAfterOrMessage?: number | string,
    detailsArg?: unknown,
    headersArg?: Headers,
  ) {
    let payloadCode: string;
    let payloadMessage: string;
    let payloadStatus: number;
    let payloadDetails: unknown;
    let retryAfterSeconds: number | undefined;

    if (typeof errorOrStatus === "number") {
      payloadStatus = errorOrStatus;
      payloadCode = String(statusOrCode);
      payloadMessage = String(retryAfterOrMessage ?? payloadCode);
      payloadDetails = detailsArg;
    } else {
      payloadCode = errorOrStatus.code;
      payloadMessage = errorOrStatus.message;
      payloadDetails = errorOrStatus.details;
      payloadStatus = Number(statusOrCode ?? 0);
      retryAfterSeconds = typeof retryAfterOrMessage === "number" ? retryAfterOrMessage : undefined;
    }

    const isKnown = (API_ERROR_CODES as readonly string[]).includes(payloadCode);
    const errorCode: ApiCode = isKnown ? `api.${payloadCode as ApiErrorCode}` : "api.HTTP_UNKNOWN";
    const params: Record<string, string | number> =
      typeof payloadDetails === "object" && payloadDetails
        ? { ...(payloadDetails as Record<string, string | number>) }
        : {};
    if (retryAfterSeconds !== undefined && params.seconds === undefined) {
      params.seconds = retryAfterSeconds;
    }
    const userMsg = messageFor(errorCode, params);
    super(userMsg);
    this.name = "ApiError";
    this.code = payloadCode;
    this.status = payloadStatus;
    this.details = payloadDetails;
    this.retryAfterSeconds = retryAfterSeconds;
    this.errorCode = errorCode;
    this.serverMessage = payloadMessage;
    this.headers = headersArg;
  }
}

/** `Retry-After` is either delay-seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error: ApiErrorPayload | null;
  meta?: unknown;
}

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface ApiResponse<T> {
  data: T;
  meta?: unknown;
}

/**
 * How the backend session is carried. `cookie` is the default: the backend
 * sets an HttpOnly cookie and this client sends `credentials: "include"` plus
 * a CSRF header. `bearer` keeps the legacy localStorage token and is kept for
 * cross-site deployments where third-party cookies are unavailable.
 */
export type SessionMode = "cookie" | "bearer";
const configuredSessionMode = process.env.NEXT_PUBLIC_SESSION_MODE;
export const SESSION_MODE: SessionMode =
  configuredSessionMode === "bearer" ? "bearer"
    : configuredSessionMode === "cookie" ? "cookie"
      : process.env.NODE_ENV === "test" ? "bearer"
        : "cookie";

const TOKEN_KEY = "oracledesk_token";
const USER_ID_KEY = "oracledesk_user_id";
const WALLET_KEY = "oracledesk_wallet";
const SESSION_KEY = "oracledesk_session_id";
const CSRF_COOKIE = "od_csrf";

/** CSRF token for cookie mode, kept in memory and re-read from the cookie on load. */
let csrfToken: string | null = null;
/** Wallet the backend confirmed the cookie belongs to. Never written from UI state alone. */
let confirmedSessionWallet: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(/;\s*/).find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(CSRF_COOKIE.length + 1));
  } catch {
    return null;
  }
}

export function getCsrfToken(): string | null {
  return csrfToken ?? readCsrfCookie();
}

/** Records the wallet a `GET /auth/session` (or a fresh verify) confirmed. */
export function setConfirmedSessionWallet(wallet: string | null): void {
  confirmedSessionWallet = wallet;
  sessionListeners.forEach((listener) => listener());
}

function getBrowserStorage() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

const INVALID_SEGMENT = /[\/\\\x00-\x1f]/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Builds an API path with encoded, validated segments (issue #120). A segment
 * that is empty, `.`/`..`, contains a slash (raw or encoded) or non-ASCII is
 * refused instead of being normalised into a different endpoint.
 */
export function apiPath(strings: TemplateStringsArray, ...segments: Array<string | number | bigint>): string {
  let path = strings[0] ?? "";
  segments.forEach((raw, index) => {
    const value = String(raw);
    const decoded = decodeSegment(value);
    if (
      value.length === 0 ||
      value.length > 256 ||
      decoded === "." ||
      decoded === ".." ||
      INVALID_SEGMENT.test(decoded) ||
      /[^\x20-\x7e]/.test(decoded)
    ) {
      throw new ApiError({ code: "INVALID_PATH", message: "The request path is invalid." }, 0);
    }
    path += encodeURIComponent(value) + (strings[index + 1] ?? "");
  });
  return path;
}

function buildUrl(path: string, params?: QueryParams) {
  const baseUrl = `${API_URL.replace(/\/$/, "")}/`;
  const url = new URL(path.replace(/^\//, ""), baseUrl);
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  if (url.origin !== base.origin || !(url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))) {
    throw new ApiError({ code: "INVALID_PATH", message: "The request path is invalid." }, 0);
  }

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

export function getStoredToken() {
  if (SESSION_MODE === "cookie") return null;
  return getBrowserStorage()?.getItem(TOKEN_KEY) ?? null;
}

export function getStoredSessionId() {
  if (SESSION_MODE === "bearer" && !getStoredToken()) return null;
  if (SESSION_MODE === "cookie" && !confirmedSessionWallet) return null;
  const storage = getBrowserStorage();
  // Upgrade sessions saved before scope ids existed without putting JWTs in keys.
  let id = storage?.getItem(SESSION_KEY) ?? null;
  if (!id && storage && typeof storage.setItem === "function") {
    try { id = crypto.randomUUID(); storage.setItem(SESSION_KEY, id); }
    catch { return null; }
  }
  return id;
}

export function storeAuthSession(session: {
  token?: string;
  userId: string;
  walletAddress: string;
  csrfToken?: string;
}) {
  const storage = getBrowserStorage();
  // The wallet address is a UI hint in cookie mode, never proof of a session.
  storage?.setItem(WALLET_KEY, session.walletAddress);
  if (!storage?.getItem(SESSION_KEY)) {
    try { storage?.setItem(SESSION_KEY, crypto.randomUUID()); } catch { /* private mode */ }
  }
  if (SESSION_MODE === "cookie") {
    confirmedSessionWallet = session.walletAddress;
    if (session.csrfToken) setCsrfToken(session.csrfToken);
  } else {
    storage?.setItem(TOKEN_KEY, session.token ?? "");
    storage?.setItem(USER_ID_KEY, session.userId);
  }
  sessionListeners.forEach((listener) => listener());
}

const tokenRotatedListeners = new Set<() => void>();
/** Fires when a refreshed token replaces the current one; the session id is unchanged. */
export function onTokenRotated(listener: () => void) {
  tokenRotatedListeners.add(listener);
  return () => { tokenRotatedListeners.delete(listener); };
}

/**
 * Swap in a refreshed bearer token (issue #269) without rotating the session id,
 * so user-scoped caches survive. Refuses if the wallet or session changed meanwhile.
 */
export function replaceToken(
  next: { token: string; userId: string; walletAddress: string },
  expectedSessionId: string,
): boolean {
  if (SESSION_MODE === "cookie") return false;
  const storage = getBrowserStorage();
  if (!storage?.getItem(TOKEN_KEY)) return false;
  if (storage.getItem(WALLET_KEY) !== next.walletAddress) return false;
  if (storage.getItem(SESSION_KEY) !== expectedSessionId) return false;
  storage.setItem(TOKEN_KEY, next.token);
  tokenRotatedListeners.forEach((listener) => listener());
  return true;
}

/** Wallet address the backend session belongs to, if any. */
export function getStoredSessionWallet() {
  if (SESSION_MODE === "cookie") return confirmedSessionWallet;
  const storage = getBrowserStorage();
  return storage?.getItem(TOKEN_KEY) ? storage.getItem(WALLET_KEY) : null;
}

export function getStoredIdentityKey() {
  const storage = getBrowserStorage();
  return storage?.getItem(TOKEN_KEY) ? storage.getItem(IDENTITY_KEY) ?? storage.getItem(WALLET_KEY) : null;
}

export function clearAuthSession() {
  const storage = getBrowserStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_ID_KEY);
  storage?.removeItem(WALLET_KEY);
  storage?.removeItem(SESSION_KEY);
  confirmedSessionWallet = null;
  csrfToken = null;
  sessionListeners.forEach((listener) => listener());
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  params?: QueryParams,
  options: SchemaOptions<T> = {},
): Promise<ApiResponse<T>> {
  const assertScope = () => {
    const expected = options.expectScope;
    if (expected && (expected.sessionId !== getStoredSessionId() ||
        (expected.sessionId !== null && expected.wallet !== getStoredSessionWallet()))) {
      throw new ApiError({ code: "SCOPE_CHANGED", message: "Your account changed; this result was not applied." }, 0);
    }
    options.signal?.throwIfAborted();
  };
  assertScope();
  const token = getStoredToken();
  const requestSessionId = getStoredSessionId();
  const requestSessionWallet = getStoredSessionWallet();
  const headers = new Headers(init.headers);
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  }

  // Issue #124: correlate this request with the active operation (or a fresh
  // trace) so backend logs and client reports share one reference id.
  const trace = options.trace ?? currentTrace() ?? newTrace();
  const requestId = trace.traceId.slice(0, 8);
  if (!headers.has("traceparent")) headers.set("traceparent", toTraceparent(trace));
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", requestId);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (options.idempotencyKey && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (SESSION_MODE === "cookie" && method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...init,
      credentials: SESSION_MODE === "cookie" ? "include" : "same-origin",
      signal: options.signal ?? init.signal,
      headers,
    });
  } catch (error) {
    // Standard browser error for network failures (including ECONNREFUSED)
    if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message.includes("NetworkError"))) {
      throw new ApiError(
        {
          code: "BACKEND_UNREACHABLE",
          message: "Could not connect to the API server.",
        },
        0,
        undefined,
        requestId,
      );
    }
    throw error;
  }

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  const apiError = envelope?.error;
  // An old response (including a 401) must never affect a newer session.
  assertScope();

  if (!response.ok || envelope?.ok === false) {
    const details = apiError?.details as { maxAgeSeconds?: number; reauthenticate?: boolean } | undefined;
    const isStepUp = response.status === 403 && (apiError?.code === "STEP_UP_REQUIRED" || details?.reauthenticate === true);
    if (isStepUp) {
      const stepUpDetails = details ?? { reauthenticate: true };
      noteStepUpMaxAge(stepUpDetails.maxAgeSeconds);
      if (options.stepUp === false || options._stepUpRetried) throw new StepUpRequiredError(stepUpDetails);

      const hasIdempotencyKey = headers.has("Idempotency-Key");
      const replayable = routeAllowsReplay(path, method) && hasIdempotencyKey;
      if (!replayable && scopedStepUpHandler) throw new StepUpRequiredError(stepUpDetails);

      if (stepUpHandler) {
        const confirmed = await stepUpHandler(stepUpDetails);
        if (confirmed) return request<T>(path, init, params, { ...options, _stepUpRetried: true });
        throw new StepUpCancelledError();
      }

      if (!scopedStepUpHandler) throw new StepUpRequiredError(stepUpDetails);
      assertScope();
      const reason = options.stepUp && options.stepUp !== false ? options.stepUp.reason : "complete this action";
      const result = await runStepUp({
        wallet: requestSessionWallet ?? "",
        sessionId: requestSessionId ?? "",
        reason,
        maxAgeSeconds: typeof stepUpDetails.maxAgeSeconds === "number" ? stepUpDetails.maxAgeSeconds : lastMaxAgeSeconds,
        network: NETWORK_LABEL,
        networkPassphrase: NETWORK_PASSPHRASE,
        signal: options.signal ?? new AbortController().signal,
      });
      if (result !== "ok") throw new StepUpCancelledError();
      assertScope();
      if (requestSessionId !== getStoredSessionId() || requestSessionWallet !== getStoredSessionWallet()) {
        throw new StepUpRequiredError(stepUpDetails);
      }
      return request<T>(path, init, params, { ...options, _stepUpRetried: true });
    }

    const authFailure = ["TOKEN_EXPIRED", "INVALID_TOKEN", "UNAUTHORIZED"].includes(apiError?.code ?? "") ||
      (response.status === 401 && !apiError);
    const sessionIsCurrent = requestSessionId === getStoredSessionId();
    const tokenIsCurrent = SESSION_MODE === "cookie" || (token && token === getStoredToken());
    if (authFailure && sessionIsCurrent && tokenIsCurrent) {
      clearAuthSession();
      authInvalidListeners.forEach((listener) => listener());
    }

    // Prefer the backend's own id when it echoes one (issue #124).
    const serverRequestId = response.headers.get("x-request-id") ?? undefined;

    throw new ApiError(
      apiError ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Request failed",
      },
      response.status,
      parseRetryAfter(response.headers.get("Retry-After")),
      serverRequestId ?? requestId,
      response.headers,
    );
  }

  const schema = options.schema;
  if (!schema) {
    return {
      data: envelope?.data as T,
      meta: envelope?.meta,
    };
  }
  if (!envelope || typeof envelope !== "object") {
    throw new ApiError({ code: "INVALID_RESPONSE", message: "The server returned a response that is not JSON." }, response.status);
  }
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    // Paths and messages only: response values can hold tokens or user data.
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
    throw new ApiError({ code: "INVALID_RESPONSE", message: "The server returned data in an unexpected shape.", details: issues }, response.status);
  }
  return { data: parsed.data, meta: envelope.meta };
}

/**
 * Enhanced error handling with JWT expiry detection.
 * Returns true if the error indicates an expired or invalid token that needs re-auth.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === "TOKEN_EXPIRED" || error.code === "INVALID_TOKEN" || error.code === "UNAUTHORIZED" || error.status === 401;
  }
  return false;
}

export const apiClient = {
  get<T>(path: string, params?: QueryParams, options?: SchemaOptions<T>) {
    return request<T>(path, { method: "GET" }, params, options);
  },

  post<T>(path: string, body?: unknown, headers?: HeadersInit, options?: SchemaOptions<T>) {
    return request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }, undefined, options);
  },

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return request<T>(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    }, undefined, options);
  },

  patch<T>(path: string, body?: unknown, headers?: HeadersInit, options?: SchemaOptions<T>) {
    return request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }, undefined, options);
  },
  delete<T>(path: string, options?: ApiRequestOptions) {
    return request<T>(path, { method: "DELETE" }, undefined, options);
  },
};
