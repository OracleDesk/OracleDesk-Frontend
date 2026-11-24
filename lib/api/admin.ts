import { z } from "zod";
import { apiClient, apiPath, ApiError, type ApiRequestOptions } from "./client";
import type { PaginationMeta } from "./markets";
import {
  isDriftAction,
  isDriftClass,
  type DriftAction,
  type DriftClass,
  type DriftFinding,
} from "@/lib/admin/drift";
import type { BackendAdminAssignment } from "@/lib/admin/permissions-types";
import type { BackendTraceAuditRow } from "@/lib/admin/trace-audit-compare";

/* ------------------------------------------------------------------ *
 * Spec Compatibility types & API (Issue #290)
 * ------------------------------------------------------------------ */

export interface SpecDiff {
  contract: string;
  item: string; // e.g. "fn x", "struct Market", "event Trade", "wasm", "spec"
  change: string;
  severity: "breaking" | "compatible" | "info";
}

export interface ContractCompat {
  contract: string;
  contractId: string;
  kind: string;
  wasmHash: string;
  expectedWasmHash?: string | null;
  wasmHashMatch: boolean;
  verified?: boolean;
  reason?: string;
  diffs: SpecDiff[];
  fingerprint?: string;
  entries?: Array<{ kind: string; name: string; sha256: string }>;
}

export interface SpecCompatReport {
  checkedAt: number;
  mode: "enforce" | "warn" | "off";
  bindingsCommit: string;
  ok: boolean;
  breaking: SpecDiff[];
  contracts: ContractCompat[];
}

export interface SpecCompatResponse {
  mode: "enforce" | "warn" | "off";
  report: SpecCompatReport | null;
}

export async function getSpecCompat(options?: ApiRequestOptions): Promise<SpecCompatResponse> {
  try {
    const { data } = await apiClient.get<SpecCompatResponse>(
      "/admin/chain/spec-compat",
      undefined,
      options,
    );
    if (!data || typeof data !== "object") {
      return { mode: "off", report: null };
    }
    return {
      mode: data.mode ?? "off",
      report: data.report ?? null,
    };
  } catch {
    return { mode: "off", report: null };
  }
}

/* ------------------------------------------------------------------ *
 * Admin Reconciliation API
 * ------------------------------------------------------------------ */

export type ReconcileDriftClass = DriftClass | string;
export type ReconcileDriftAction = DriftAction | string;

export interface ReconcileRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  scanned: number;
  repaired: number;
  reported: number;
  deferred: number;
  rpcCalls: number;
  error: string | null;
}

export type MarketDriftReport = DriftFinding;

export interface ReconcileRunDetail {
  run: ReconcileRun;
  findings: MarketDriftReport[];
  meta?: PaginationMeta;
}

export interface TriggerReconcileParams {
  dryRun?: boolean;
  maxMarkets?: number;
}

export interface TriggerReconcileResult {
  runId: string;
  message: string;
}

function normalizeDriftClass(value: string): ReconcileDriftClass {
  if (isDriftClass(value)) return value;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`Unknown reconciliation driftClass from backend: ${value}`);
  }
  return value;
}

function normalizeDriftAction(value: string): ReconcileDriftAction {
  if (isDriftAction(value)) return value;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`Unknown reconciliation action from backend: ${value}`);
  }
  return value;
}

const driftClassSchema = z.string().transform(normalizeDriftClass);
const driftActionSchema = z.string().transform(normalizeDriftAction);

const nullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value ?? null);

const ReconcileRunSchema = z
  .object({
    id: z.string(),
    startedAt: z.string(),
    finishedAt: nullableString,
    scanned: z.number(),
    repaired: z.number(),
    reported: z.number(),
    deferred: z.number(),
    rpcCalls: z.number(),
    error: nullableString,
  })
  .passthrough();

const onChainIdSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value));

const MarketDriftReportSchema = z
  .object({
    id: z.string().optional(),
    runId: z.string(),
    marketId: z.string(),
    onChainMarketId: onChainIdSchema,
    driftClass: driftClassSchema,
    dbValue: z.unknown(),
    chainValue: z.unknown(),
    action: driftActionSchema,
    observedLedger: z.number(),
    createdAt: z.string().optional(),
  })
  .passthrough();

const ReconcileRunDetailSchema = z.object({
  run: ReconcileRunSchema,
  findings: z.array(MarketDriftReportSchema),
});

const TriggerReconcileSchema = z.object({
  dryRun: z.boolean().optional(),
  maxMarkets: z.number().int().min(1).max(5_000).optional(),
});

const TriggerResultSchema = z.object({
  runId: z.string(),
  message: z.string(),
});

export async function listReconcileRuns(
  limit = 20,
  options: ApiRequestOptions = {},
): Promise<ReconcileRun[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const { data } = await apiClient.get<ReconcileRun[]>(
    apiPath`/admin/reconciliation/runs`,
    { limit: safeLimit },
    { ...options, schema: z.array(ReconcileRunSchema) },
  );
  return data;
}

const AdminAssignmentSchema = z
  .object({
    walletAddress: z.string(),
    roleName: z.string(),
    assignedAt: z.string().optional(),
    assignedBy: z.string().optional(),
  })
  .passthrough();

export interface TraceAuditRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  cursorTraceId?: string | null;
  stats?: unknown;
}

export interface TraceAuditFinding extends BackendTraceAuditRow {
  id: string;
  runId?: string | null;
  checkedAt: string;
}

export interface TraceAuditSummary {
  counts: Record<string, number>;
  latestRun: TraceAuditRun | null;
  findings: TraceAuditFinding[];
  meta?: PaginationMeta;
}

export interface TraceAuditFilter {
  status?: string;
  agentId?: string;
  marketId?: string;
  fromTraceId?: string;
  toTraceId?: string;
  page?: number;
  limit?: number;
}

export interface TriggerTraceAuditResult {
  runId: string;
}

const TraceAuditRunSchema = z
  .object({
    id: z.string(),
    startedAt: z.string(),
    finishedAt: z.union([z.string(), z.null()]),
    cursorTraceId: z.union([z.string(), z.null()]).optional(),
    stats: z.unknown().optional(),
  })
  .passthrough();

const TraceAuditFindingSchema = z
  .object({
    id: z.string(),
    runId: z.union([z.string(), z.null()]).optional(),
    checkedAt: z.string(),
    status: z.string(),
    onChainTraceId: z.union([z.string(), z.null()]).optional(),
    traceId: z.union([z.string(), z.null()]).optional(),
    onChainMarketId: z.union([z.string(), z.null()]).optional(),
    agent: z.union([z.string(), z.null()]).optional(),
    action: z.union([z.string(), z.null()]).optional(),
    ipfsCid: z.union([z.string(), z.null()]).optional(),
    onChainHash: z.union([z.string(), z.null()]).optional(),
    computedHash: z.union([z.string(), z.null()]).optional(),
    detail: z.unknown().optional(),
  })
  .passthrough();

const TraceAuditSummarySchema = z
  .object({
    counts: z.record(z.string(), z.number()),
    latestRun: z.union([TraceAuditRunSchema, z.null()]),
    findings: z.array(TraceAuditFindingSchema),
  })
  .passthrough();

const TriggerTraceAuditSchema = z.object({ runId: z.string() }).passthrough();

const TRACE_AUDIT_STATUSES = new Set([
  "VERIFIED", "HASH_MISMATCH", "UNAVAILABLE", "UNKNOWN_TO_BACKEND", "WRONG_MARKET",
  "UNLINKED_IN_DB", "NOT_ON_CHAIN", "FOREIGN_AGENT", "ARCHIVED",
]);

export async function getTraceAudit(
  filter: TraceAuditFilter = {},
  options: ApiRequestOptions = {},
): Promise<TraceAuditSummary> {
  const page = Number.isFinite(filter.page) ? Math.max(1, Math.floor(filter.page as number)) : 1;
  const limit = Number.isFinite(filter.limit) ? Math.min(500, Math.max(1, Math.floor(filter.limit as number))) : 50;
  const status = filter.status && TRACE_AUDIT_STATUSES.has(filter.status) ? filter.status : undefined;
  const { data, meta } = await apiClient.get<TraceAuditSummary>(
    apiPath`/admin/trace-audit`,
    {
      page,
      limit,
      ...(status ? { status } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.marketId ? { marketId: filter.marketId } : {}),
      ...(filter.fromTraceId ? { fromTraceId: filter.fromTraceId } : {}),
      ...(filter.toTraceId ? { toTraceId: filter.toTraceId } : {}),
    },
    { ...options, schema: TraceAuditSummarySchema },
  );
  return { ...data, meta: meta as PaginationMeta | undefined };
}

export async function runTraceAudit(
  options: ApiRequestOptions = {},
): Promise<TriggerTraceAuditResult> {
  const { data } = await apiClient.post<TriggerTraceAuditResult>(
    apiPath`/admin/trace-audit/run`,
    undefined,
    undefined,
    { ...options, schema: TriggerTraceAuditSchema },
  );
  return data;
}

/** Lists administrators. Callers opt into step-up with `{ stepUp: { reason } }`. */
export async function getAdmins(
  options: ApiRequestOptions = {},
): Promise<BackendAdminAssignment[]> {
  const { data } = await apiClient.get<BackendAdminAssignment[]>(
    apiPath`/admin/admins`,
    undefined,
    { ...options, schema: z.array(AdminAssignmentSchema) },
  );
  return data;
}

export async function getReconcileRun(
  id: string,
  page = 1,
  limit = 200,
  options: ApiRequestOptions = {},
): Promise<ReconcileRunDetail> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const { data, meta } = await apiClient.get<{ run: ReconcileRun; findings: MarketDriftReport[] }>(
    apiPath`/admin/reconciliation/runs/${id}`,
    { page: safePage, limit: safeLimit },
    { ...options, schema: ReconcileRunDetailSchema },
  );
  return { ...data, meta: meta as PaginationMeta | undefined };
}

export async function triggerReconcileRun(
  params: TriggerReconcileParams,
  options: ApiRequestOptions = {},
): Promise<TriggerReconcileResult> {
  const parsed = TriggerReconcileSchema.safeParse(params);
  if (!parsed.success) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "Invalid reconciliation request" }, 400);
  }
  const { data } = await apiClient.post<TriggerReconcileResult>(
    apiPath`/admin/reconciliation/run`,
    parsed.data,
    undefined,
    { ...options, schema: TriggerResultSchema },
  );
  return data;
}
