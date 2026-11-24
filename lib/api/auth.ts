import {
  API_URL,
  SESSION_MODE,
  apiClient,
  clearAuthSession,
  getStoredSessionWallet,
  getStoredSessionId,
  getStoredToken,
  setConfirmedSessionWallet,
  setCsrfToken,
  storeAuthSession,
  isAuthError,
  replaceToken,
  type ApiRequestOptions,
} from "./client";
import { validateSEP10Challenge, type SEP10ValidationError } from "@/lib/stellar/sep10-validator";
import { broadcastSessionChange } from "./cross-tab-sync";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { NetworkMismatchError } from "@/lib/stellar/network-check";
import { sha256Hex } from "@/lib/stellar/trace";
import { withOperation, type TraceCtx } from "@/lib/observability/tracing";
import { AuthChallengeSchema } from "./schemas";
import { solvePow } from "@/lib/auth/pow-runner";
import { baseAccountOf } from "@/lib/auth/pow";
import { UserFacingError } from "@/lib/stellar/errors";

export interface PowProgress {
  tried: number;
  estimatedProgress: number;
  bits: number;
}

export interface RequestChallengeOptions extends ApiRequestOptions {
  memo?: string;
  onPow?: (p: PowProgress) => void;
}

const DEFAULT_AUTH_POW_MAX_BITS = 24;
export const POW_MAX_BITS =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AUTH_POW_MAX_BITS
    ? parseInt(process.env.NEXT_PUBLIC_AUTH_POW_MAX_BITS, 10)
    : DEFAULT_AUTH_POW_MAX_BITS;

function parseXAuthPow(header: string | null | undefined): { bits?: number; salt?: string } {
  if (!header) return {};
  const bitsMatch = header.match(/bits=(\d+)/i);
  const saltMatch = header.match(/salt=([a-f0-9]+)/i);
  return {
    bits: bitsMatch ? parseInt(bitsMatch[1], 10) : undefined,
    salt: saltMatch ? saltMatch[1] : undefined,
  };
}

export interface AuthSession {
  token?: string;
  userId: string;
  walletAddress: string;
  csrfToken?: string;
  expiresAt?: string;
}

/** What `GET /auth/session` reports for the cookie. */
export interface ServerSession {
  walletAddress: string;
  userId: string;
  expiresAt?: string;
}

const LEGACY_TOKEN_KEY = "oracledesk_token";
const LEGACY_USER_KEY = "oracledesk_user_id";
const UPGRADE_FLAG = "oracledesk_cookie_upgraded";

/** A logout must finish before a new sign-in starts, or a late response clears the new cookie. */
let pendingLogout: Promise<void> = Promise.resolve();

export interface AuthChallenge {
  /** Base64 transaction envelope to sign with the wallet (never submitted). */
  transaction: string;
  networkPassphrase: string;
  expiresAt: string;
}

export async function requestChallenge(
  address: string,
  options?: RequestChallengeOptions,
): Promise<AuthChallenge> {
  const account = baseAccountOf(address);
  let attempts = 0;
  let currentPow: { nonce: string; salt: string } | undefined = undefined;

  while (attempts < 3) {
    attempts++;
    try {
      const payload: { address: string; memo?: string; pow?: { nonce: string; salt: string } } = {
        address,
        ...(options?.memo ? { memo: options.memo } : {}),
        ...(currentPow ? { pow: currentPow } : {}),
      };

      const { data } = await apiClient.post<AuthChallenge>(
        "/auth/challenge",
        payload,
        undefined,
        { ...options, schema: AuthChallengeSchema },
      );
      return data;
    } catch (err) {
      if (err instanceof ApiError && (err.code === "POW_REQUIRED" || err.code === "POW_INVALID")) {
        if (attempts >= 3) {
          throw new UserFacingError({
            kind: "unknown",
            message: "Sign-in proof-of-work failed. Please try again.",
          }, err);
        }

        let bits: number | undefined;
        let salt: string | undefined;

        if (err.code === "POW_REQUIRED") {
          const details = err.details as { bits?: number; salt?: string } | undefined;
          const headerPow = parseXAuthPow(err.headers?.get("x-auth-pow"));
          bits = details?.bits ?? headerPow.bits;
          salt = details?.salt ?? headerPow.salt;
        } else if (err.code === "POW_INVALID") {
          const powRes = await apiClient.get<{ bits: number; salt: string }>(
            "/auth/challenge/pow",
            undefined,
            { signal: options?.signal },
          );
          bits = powRes.data.bits;
          salt = powRes.data.salt;
        }

        if (bits === undefined || !salt) {
          throw err;
        }

        if (bits > POW_MAX_BITS) {
          throw new UserFacingError({
            kind: "unknown",
            message: "Sign-in is under heavy load. Try again in a minute.",
          }, err);
        }

        if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, err.retryAfterSeconds! * 1000));
        }

        const nonce = await solvePow({
          account,
          salt,
          bits,
          signal: options?.signal,
          onProgress: options?.onPow,
        });

        currentPow = { nonce, salt };
        continue;
      }

      throw err;
    }
  }

  throw new UserFacingError({
    kind: "unknown",
    message: "Sign-in proof-of-work failed. Please try again.",
  });
}

export async function verifyChallenge(
  address: string,
  signed: string,
  isCurrent: () => boolean = () => true,
  trace?: TraceCtx,
  extraHeaders?: Record<string, string>,
) {
  const { data } = await apiClient.post<AuthSession>(
    "/auth/verify",
    { address, signed },
    {
      ...(SESSION_MODE === "cookie" ? { "X-Session-Mode": "cookie" } : {}),
      ...extraHeaders,
    },
    { trace },
  );
  if (!isCurrent() || data.walletAddress !== address) throw new Error("Your account changed; sign in again.");
  storeAuthSession(data);
  setConfirmedSessionWallet(data.walletAddress);
  broadcastSessionChange(data.token ?? null, data.walletAddress);
  return data;
}

/**
 * Reads the server-confirmed session from the cookie (cookie mode) or from the
 * stored bearer token (bearer mode). Returns null for 401, so callers can show
 * "signed out" without treating it as an error.
 */
export async function getSession(): Promise<ServerSession | null> {
  if (SESSION_MODE === "bearer") {
    const wallet = getStoredSessionWallet();
    const token = getStoredToken();
    return token && wallet ? { walletAddress: wallet, userId: "" } : null;
  }
  try {
    const { data } = await apiClient.get<ServerSession>("/auth/session");
    setConfirmedSessionWallet(data.walletAddress);
    return data;
  } catch (error) {
    if (isAuthError(error)) {
      clearAuthSession();
      return null;
    }
    throw error;
  }
}

/** Clears the cookie session. Fire-and-forget callers may ignore the rejection. */
export function logout(): Promise<void> {
  if (SESSION_MODE === "bearer") {
    clearAuthSession();
    return Promise.resolve();
  }
  const run = pendingLogout
    .catch(() => undefined)
    .then(async () => {
      try {
        await apiClient.post("/auth/logout");
      } finally {
        clearAuthSession();
        broadcastSessionChange(null, null);
      }
    });
  pendingLogout = run.catch(() => undefined);
  return run;
}

/**
 * One-shot, silent migration of a legacy localStorage token to the cookie.
 * Deletes the legacy keys on success and on 401 (the token was dead); keeps
 * them on a network failure so a later load can retry.
 */
export async function migrateLegacySession(): Promise<void> {
  if (SESSION_MODE !== "cookie" || typeof window === "undefined") return;
  const storage = window.localStorage;
  const token = storage.getItem(LEGACY_TOKEN_KEY);
  if (!token) return;
  if (storage.getItem(UPGRADE_FLAG)) {
    storage.removeItem(LEGACY_TOKEN_KEY);
    storage.removeItem(LEGACY_USER_KEY);
    return;
  }
  try {
    const response = await fetch(`${API_URL.replace(/\/$/, "")}/auth/upgrade`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { data?: { walletAddress?: string; csrfToken?: string } }
        | null;
      const wallet = body?.data?.walletAddress;
      if (body?.data?.csrfToken) setCsrfToken(body.data.csrfToken);
      if (wallet) setConfirmedSessionWallet(wallet);
      storage.setItem(UPGRADE_FLAG, "1");
      storage.removeItem(LEGACY_TOKEN_KEY);
      storage.removeItem(LEGACY_USER_KEY);
      return;
    }
    if (response.status === 401 || response.status === 404) {
      storage.setItem(UPGRADE_FLAG, "1");
      storage.removeItem(LEGACY_TOKEN_KEY);
      storage.removeItem(LEGACY_USER_KEY);
    }
  } catch {
    // Offline: keep the legacy token so the next load can try again.
  }
}

/**
 * Validate SEP-10 challenge before signing.
 * Throws if the challenge is invalid or expired.
 */
export function validateChallenge(challenge: AuthChallenge): SEP10ValidationError | null {
  return validateSEP10Challenge(challenge, NETWORK_PASSPHRASE);
}

/** SHA-256 of the challenge XDR envelope (base64 decoded), sent as `X-Challenge-Hash`. */
async function challengeHash(transaction: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    const binary = atob(transaction);
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    bytes = new TextEncoder().encode(transaction); // not base64: hash it as-is
  }
  return sha256Hex(bytes);
}

/**
 * SEP-10 style login: the backend issues a challenge transaction, the wallet
 * signs it (signTransaction works in every Stellar wallet), the backend
 * verifies the signature and returns a JWT.
 *
 * Validates the challenge before signing to prevent signing malformed transactions.
 *
 * Runs as one traced operation (issue #124): both requests share one
 * `traceparent`, and the verify request carries `X-Challenge-Hash` so the
 * backend can prove the signature it verifies is over the challenge it issued.
 */
export async function signInWithWallet(
  address: string | LoginIdentity,
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>,
  isCurrent: () => boolean = () => true,
  opts: {
    signal?: AbortSignal;
    onPow?: (p: PowProgress) => void;
    onStep?: (step: "challenge" | "pow" | "sign" | "verify") => void;
  } = {},
): Promise<AuthSession> {
  // Serialize logout → sign-in so a late logout response cannot clear the new cookie.
  await pendingLogout.catch(() => undefined);
  return withOperation("sign-in", async (trace) => {
    const challenge = await requestChallenge(address, { trace });

    if (challenge.networkPassphrase !== NETWORK_PASSPHRASE) {
      throw new NetworkMismatchError(NETWORK_PASSPHRASE, challenge.networkPassphrase);
    }
    // XDR does not itself encode a passphrase; parsing here ensures the envelope
    // is valid, and the exact advertised passphrase check above binds the hash.
    TransactionBuilder.fromXDR(challenge.transaction, NETWORK_PASSPHRASE);

    // Validate challenge before signing
    const validationError = validateChallenge(challenge);
    if (validationError) {
      throw new Error(`Invalid SEP-10 challenge: ${validationError.message}`);
    }

    if (!isCurrent()) throw new Error("Your account changed; sign in again.");
    opts.onStep?.("sign");
    const signed = await signTransaction(challenge.transaction, challenge.networkPassphrase);
    if (!isCurrent()) throw new Error("Your account changed; sign in again.");
    opts.onStep?.("verify");
    return verifyChallenge(address, signed, isCurrent, trace, {
      "X-Challenge-Hash": await challengeHash(challenge.transaction),
    });
  });
}

/**
 * Refresh a still-valid bearer token via `POST /auth/refresh` (issue #269).
 * The new token is adopted only if the same wallet and session are still
 * current, so a refresh never resets the user scope.
 */
export async function refreshSession(
  expected: { wallet: string; sessionId: string; token: string },
): Promise<"refreshed" | "stale" | "rejected"> {
  if (getStoredToken() !== expected.token || getStoredSessionWallet() !== expected.wallet) return "stale";
  try {
    const { data } = await apiClient.post<{ token: string; userId: string; walletAddress: string }>("/auth/refresh");
    return replaceToken(data, expected.sessionId) ? "refreshed" : "stale";
  } catch (error) {
    if (isAuthError(error)) return "rejected";
    throw error;
  }
}

export { clearAuthSession, getStoredSessionWallet, getStoredToken, isAuthError };

/**
 * Obtain a fresh SEP-10 proof for the same wallet without rotating the user
 * scope. `verifyChallenge` keeps the existing session id; the bearer token is
 * swapped with `replaceToken`, which refuses a changed wallet or session.
 */
export async function stepUpWithWallet(
  expected: { wallet: string; sessionId: string },
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<void> {
  if (getStoredSessionId() !== expected.sessionId) {
    throw new Error("Your session changed while confirming your identity. Try again.");
  }
  if (getStoredSessionWallet() !== expected.wallet) {
    throw new Error("Step-up must use the wallet that started this action.");
  }

  const session = await signInWithWallet(
    expected.wallet,
    signTransaction,
    () => !signal?.aborted && getStoredSessionId() === expected.sessionId && getStoredSessionWallet() === expected.wallet,
    { signal },
  );

  if (session.walletAddress !== expected.wallet) {
    throw new Error("Step-up must use the wallet that started this action.");
  }
  if (getStoredSessionId() !== expected.sessionId) {
    throw new Error("Your session changed while confirming your identity. Try again.");
  }
  if (SESSION_MODE === "bearer" && session.token) {
    const replaced = replaceToken(
      { token: session.token, userId: session.userId, walletAddress: session.walletAddress },
      expected.sessionId,
    );
    if (!replaced) throw new Error("Your session changed while confirming your identity. Try again.");
  }
}
