import { nativeToScVal, xdr, type rpc } from "@stellar/stellar-sdk";
import type { ReasoningTrace } from "@/lib/api/traces";
import { listTraces } from "@/lib/api/traces";
import { reasoningRegistry, rpcServer } from "./clients";
import { isArchivedStateError } from "./archival";
import { CONTRACTS } from "./config";
import { contractDataKey } from "./ledger-keys";
import { bytesToHex, read, type RegistryClient } from "./typed-call";
import { cidDigestCheck, fetchAndVerifyTraceWith, normalizeHash, verifyTraceInWorker } from "./trace";
import type { CidCheck } from "./cid";
import type { BrowserOutcome } from "@/lib/admin/trace-audit-compare";
import type { TraceCheck } from "./trace-core";
import type { Trace } from "./generated/reasoning-registry";
import { ConcurrencyLimiter } from "@/lib/charts/trace-overlay-cache";
import { createGatewayGate } from "./gateway-gate";

export interface OnChainMarketTrace {
  index: number;
  onChainTraceId: string;
  agent: string;
  action: string;
  ipfsCid: string;
  publishedAt: number; // Unix timestamp ms
  traceHash: string; // 64-hex lowercase
}

export type AuditItemStatus = "verified" | "mismatch" | "unavailable" | "pending" | "running";

export interface AuditedTraceItem {
  onChainTraceId: string;
  index: number;
  agent: string;
  action: string;
  ipfsCid: string;
  publishedAt: number;
  onChainHash: string;
  computedHash: string | null;
  status: AuditItemStatus;
  reason?: string;
  content?: unknown;
  backendRecord?: ReasoningTrace | null;
  disagreements: string[];
  isCriticalDisagreement: boolean;
}

export interface MarketAuditSummary {
  onChainCount: number;
  backendCount: number;
  verifiedCount: number;
  mismatchCount: number;
  unavailableCount: number;
  pendingCount: number;
  agentsInvolved: string[];
  timeSpan: {
    start: number | null;
    end: number | null;
    formatted: string;
  };
  disagreementsCount: number;
  criticalDisagreementsCount: number;
  criticalDisagreements: Array<{
    onChainTraceId: string;
    description: string;
  }>;
}

export interface AuditProgress {
  phase: "idle" | "enumerating" | "verifying" | "completed" | "paused" | "error";
  total: number;
  verified: number;
  mismatches: number;
  unavailable: number;
  currentTraceId?: string;
  error?: string;
}

export const DEFAULT_AUDIT_CONCURRENCY = 3;
export const MAX_MARKET_TRACE_ENUMERATION = 200;

export type RegistryTraceRead =
  | OnChainMarketTrace
  | { error: "not-found" | "archived" | string; message?: string };

export interface VerifyItem {
  onChainTraceId: string;
  ipfsCid: string;
  traceHash: string;
  agent?: string;
}

export interface BrowserVerifyResult {
  traceId: string;
  outcome: BrowserOutcome;
  check: TraceCheck;
  cidCheck: CidCheck;
}

export interface VerifyManyOptions {
  concurrency?: number;
  perGatewayLimit?: number;
  perGatewayRate?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  registeredAgents?: ReadonlyMap<string, boolean>;
  onItem?: (result: BrowserVerifyResult) => void;
}

export const isRegistryTraceReadError = (
  value: RegistryTraceRead,
): value is Extract<RegistryTraceRead, { error: string }> => "error" in value;

const verificationCache = new Map<string, TraceCheck>();

function registryKeyType(): xdr.ScSpecTypeDef {
  return xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: "DataKey" }));
}

function registryTraceType(): xdr.ScSpecTypeDef {
  return xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: "Trace" }));
}

function registryTraceKey(spec: { nativeToScVal?: unknown }, id: bigint): xdr.ScVal {
  if (typeof spec.nativeToScVal === "function") {
    return (spec.nativeToScVal as (value: unknown, type: xdr.ScSpecTypeDef) => xdr.ScVal)(
      { tag: "Trace", values: [id] },
      registryKeyType(),
    );
  }
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Trace"), nativeToScVal(id, { type: "u64" })]);
}

function actionName(action: Trace["action"]): string {
  if (typeof action === "string") return action;
  if (action && typeof action === "object" && "tag" in action) return String(action.tag);
  return "Other";
}

function fromRegistryTrace(trace: Trace, id: bigint, index: number): OnChainMarketTrace {
  return {
    index,
    onChainTraceId: id.toString(),
    agent: trace.agent,
    action: actionName(trace.action),
    ipfsCid: trace.ipfs_cid,
    publishedAt: Number(trace.published_at) * 1000,
    traceHash: bytesToHex(trace.trace_hash),
  };
}

async function readTraceFallback(id: bigint, index: number, client: RegistryClient): Promise<RegistryTraceRead> {
  try {
    const tx = await client.get_trace({ trace_id: id });
    return fromRegistryTrace(read(tx, "reasoningRegistry") as Trace, id, index);
  } catch (error) {
    return {
      error: isArchivedStateError(error) ? "archived" : "not-found",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readTracesByIds(
  ids: readonly bigint[],
  client: RegistryClient = reasoningRegistry(),
  server: Pick<rpc.Server, "getLedgerEntries"> = rpcServer(),
): Promise<Map<string, RegistryTraceRead>> {
  const result = new Map<string, RegistryTraceRead>();
  const spec = client.spec;
  const unique = [...new Set(ids.map((id) => id.toString()))].map(BigInt);

  for (let offset = 0; offset < unique.length; offset += 200) {
    const chunk = unique.slice(offset, offset + 200);
    const requested = chunk.map((id, index) => ({
      id,
      index: offset + index,
      key: contractDataKey(CONTRACTS.reasoningRegistry, registryTraceKey(spec, id)),
    }));
    const response = await server.getLedgerEntries(...requested.map(({ key }) => key));
    const byKey = new Map(requested.map(({ id, index, key }) => [key.toXDR("base64"), { id, index }]));

    for (const entry of response.entries) {
      const match = byKey.get(entry.key.toXDR("base64"));
      if (!match) continue;
      try {
        const trace = spec.scValToNative<Trace>(entry.val.contractData().val(), registryTraceType());
        result.set(match.id.toString(), fromRegistryTrace(trace, match.id, match.index));
      } catch {
        result.set(match.id.toString(), await readTraceFallback(match.id, match.index, client));
      }
    }

    for (const { id, index } of requested) {
      if (!result.has(id.toString())) result.set(id.toString(), await readTraceFallback(id, index, client));
    }
  }

  return result;
}

function browserOutcome(check: TraceCheck, cidCheck: CidCheck, registered?: boolean): BrowserOutcome {
  if (check.status === "verified" && cidCheck === "mismatch") return "cid-mismatch";
  if (check.status === "verified" && registered === false) return "unregistered-agent";
  return check.status;
}

export async function verifyMany(
  items: readonly VerifyItem[],
  opts: VerifyManyOptions = {},
): Promise<Map<string, BrowserVerifyResult>> {
  const results = new Map<string, BrowserVerifyResult>();
  const limiter = new ConcurrencyLimiter(opts.concurrency ?? 4);
  const gate = createGatewayGate({ maxInFlight: opts.perGatewayLimit, ratePerSecond: opts.perGatewayRate });

  await Promise.all(
    items.map((item) =>
      limiter.run(async () => {
        if (opts.signal?.aborted) return;
        const cid = item.ipfsCid;
        const hash = normalizeHash(item.traceHash);
        const cacheKey = `${cid}|${hash}`;
        let check = verificationCache.get(cacheKey);
        if (!check) {
          check = opts.fetchImpl
            ? await fetchAndVerifyTraceWith(cid, hash, {
                signal: opts.signal,
                fetchImpl: opts.fetchImpl,
                acquire: gate.acquire,
              })
            : await verifyTraceInWorker(cid, hash, {
                signal: opts.signal,
                acquire: gate.acquire,
                perGatewayLimit: opts.perGatewayLimit,
                perGatewayRate: opts.perGatewayRate,
              });
          if (check.status === "verified") verificationCache.set(cacheKey, check);
        }
        const cidCheck = cidDigestCheck(cid, check.status === "unavailable" ? "" : check.computedHash);
        const registered = item.agent && opts.registeredAgents
          ? opts.registeredAgents.get(item.agent)
          : undefined;
        const result: BrowserVerifyResult = {
          traceId: item.onChainTraceId,
          outcome: browserOutcome(check, cidCheck, registered),
          check,
          cidCheck,
        };
        results.set(item.onChainTraceId, result);
        opts.onItem?.(result);
      }, opts.signal),
    ),
  );

  return results;
}

export interface EnumerateTracesOptions {
  concurrency?: number;
  /** Maximum traces to fetch (paginates newest-first when count exceeds limit). Defaults to 200. */
  limit?: number;
  /** Optional starting index (0-based). */
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Enumerates traces registered for a market directly from reasoning-registry contract
 * in publish order, independent of the backend.
 *
 * Uses bounded-concurrency parallel RPC reads via `ConcurrencyLimiter` and caps
 * enumeration to `limit` (default 200) so markets with hundreds of traces stay
 * fast and cancellable via `AbortSignal`.
 */
export async function enumerateOnChainMarketTraces(
  onChainMarketId: bigint | string | number,
  client = reasoningRegistry(),
  opts: EnumerateTracesOptions = {},
): Promise<OnChainMarketTrace[]> {
  if (opts.signal?.aborted) return [];
  const marketIdBigInt = BigInt(onChainMarketId);

  // 1. Get count from reasoning-registry
  const countTx = await client.market_trace_count({ market_id: marketIdBigInt });
  const countU64 = read(countTx, "reasoningRegistry");
  const count = Number(countU64);
  if (count <= 0) return [];

  const limit = opts.limit ?? MAX_MARKET_TRACE_ENUMERATION;
  const start = opts.offset !== undefined ? Math.max(0, opts.offset) : Math.max(0, count - limit);
  const end = Math.min(count, start + limit);

  const limiter = new ConcurrencyLimiter(opts.concurrency ?? DEFAULT_AUDIT_CONCURRENCY);
  const indices: number[] = [];
  for (let i = start; i < end; i++) indices.push(i);

  const results = await Promise.all(
    indices.map((index) =>
      limiter.run(async () => {
        const traceAtTx = await client.market_trace_at({
          market_id: marketIdBigInt,
          index: BigInt(index),
        });
        const traceId = read(traceAtTx, "reasoningRegistry");

        const getTraceTx = await client.get_trace({ trace_id: traceId });
        const trace = read(getTraceTx, "reasoningRegistry");

        return {
          index,
          onChainTraceId: traceId.toString(),
          agent: trace.agent,
          action: trace.action,
          ipfsCid: trace.ipfs_cid,
          publishedAt: Number(trace.published_at) * 1000,
          traceHash: bytesToHex(trace.trace_hash),
        } satisfies OnChainMarketTrace;
      }, opts.signal),
    ),
  );

  return results.sort((a, b) => a.index - b.index);
}

/**
 * Reconciles an audited on-chain trace with the backend's trace record.
 * Flags any disagreements, especially where backend calls verified: true
 * but the browser's own check failed.
 */
export function reconcileTraceWithBackend(
  onChain: OnChainMarketTrace,
  browserStatus: AuditItemStatus,
  computedHash: string | null,
  backendRecord?: ReasoningTrace | null,
): { disagreements: string[]; isCriticalDisagreement: boolean } {
  const disagreements: string[] = [];
  let isCriticalDisagreement = false;

  if (!backendRecord) {
    disagreements.push("Trace is registered on-chain but absent from backend database feed.");
    return { disagreements, isCriticalDisagreement };
  }

  // 1. Compare hash commitments
  if (backendRecord.traceHash) {
    const backendNorm = normalizeHash(backendRecord.traceHash);
    const onChainNorm = normalizeHash(onChain.traceHash);
    if (backendNorm !== onChainNorm) {
      disagreements.push(
        `Hash mismatch: backend stores ${backendNorm.slice(0, 10)}… but chain committed ${onChainNorm.slice(0, 10)}…`,
      );
      isCriticalDisagreement = true;
    }
  }

  // 2. Compare IPFS CID
  if (backendRecord.ipfsCid && backendRecord.ipfsCid.trim() !== onChain.ipfsCid.trim()) {
    disagreements.push(
      `CID mismatch: backend stores ${backendRecord.ipfsCid} but chain recorded ${onChain.ipfsCid}`,
    );
  }

  // 3. HONEST CHECK: The most important check on the page
  // If backend claims verified: true, but browser check failed
  if (backendRecord.verified && browserStatus === "mismatch") {
    disagreements.push(
      "CRITICAL: Backend claims verified: true, but browser cryptographic check failed! The content does not hash to on-chain trace_hash.",
    );
    isCriticalDisagreement = true;
  } else if (backendRecord.verified && browserStatus === "unavailable") {
    disagreements.push(
      "Backend claims verified: true, but browser could not reach IPFS gateways to confirm content.",
    );
  } else if (!backendRecord.verified && browserStatus === "verified") {
    disagreements.push("Backend left trace marked as unverified, but browser successfully verified on-chain content.");
  }

  return { disagreements, isCriticalDisagreement };
}

/**
 * Computes the aggregate integrity summary for a market audit.
 */
export function computeMarketAuditSummary(
  items: AuditedTraceItem[],
  onChainCount: number,
  backendCount: number,
): MarketAuditSummary {
  let verifiedCount = 0;
  let mismatchCount = 0;
  let unavailableCount = 0;
  let pendingCount = 0;
  let disagreementsCount = 0;
  let criticalDisagreementsCount = 0;

  const criticalDisagreements: Array<{ onChainTraceId: string; description: string }> = [];
  const agentsSet = new Set<string>();

  let minTime: number | null = null;
  let maxTime: number | null = null;

  for (const item of items) {
    if (item.agent) agentsSet.add(item.agent);

    if (item.publishedAt > 0) {
      if (minTime === null || item.publishedAt < minTime) minTime = item.publishedAt;
      if (maxTime === null || item.publishedAt > maxTime) maxTime = item.publishedAt;
    }

    if (item.status === "verified") verifiedCount++;
    else if (item.status === "mismatch") mismatchCount++;
    else if (item.status === "unavailable") unavailableCount++;
    else pendingCount++;

    if (item.disagreements.length > 0) {
      disagreementsCount += item.disagreements.length;
      if (item.isCriticalDisagreement) {
        criticalDisagreementsCount++;
        criticalDisagreements.push({
          onChainTraceId: item.onChainTraceId,
          description: item.disagreements.find((d) => d.startsWith("CRITICAL")) ?? item.disagreements[0],
        });
      }
    }
  }

  // Format time span
  let formattedTimeSpan = "No time span";
  if (minTime !== null && maxTime !== null) {
    const startDate = new Date(minTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endDate = new Date(maxTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const durationHours = Math.round((maxTime - minTime) / (1000 * 60 * 60));
    formattedTimeSpan = minTime === maxTime
      ? `${startDate}`
      : `${startDate} — ${endDate} (${durationHours}h span)`;
  }

  return {
    onChainCount,
    backendCount,
    verifiedCount,
    mismatchCount,
    unavailableCount,
    pendingCount,
    agentsInvolved: Array.from(agentsSet),
    timeSpan: {
      start: minTime,
      end: maxTime,
      formatted: formattedTimeSpan,
    },
    disagreementsCount,
    criticalDisagreementsCount,
    criticalDisagreements,
  };
}

export interface RunMarketAuditOptions {
  onChainMarketId: string | bigint | number;
  marketId?: string | null;
  concurrency?: number;
  signal?: AbortSignal;
  existingItems?: Map<string, AuditedTraceItem>;
  fetchImpl?: typeof fetch;
  client?: RegistryClient;
  backendTraces?: ReasoningTrace[];
  onProgress?: (progress: AuditProgress, currentItems: AuditedTraceItem[]) => void;
}

/**
 * Runs a bounded-concurrency market trace integrity audit:
 * 1. Enumerates all traces published on-chain for the market
 * 2. Fetches backend traces for cross-reconciliation
 * 3. Verifies each trace's content against IPFS gateways with bounded concurrency
 * 4. Is resumable (keeps existing verified items) and cancellable via AbortSignal
 */
export async function runMarketTraceAudit(opts: RunMarketAuditOptions): Promise<{
  items: AuditedTraceItem[];
  summary: MarketAuditSummary;
  cancelled: boolean;
}> {
  const concurrency = opts.concurrency ?? DEFAULT_AUDIT_CONCURRENCY;
  const itemsMap = new Map<string, AuditedTraceItem>(opts.existingItems);
  const signal = opts.signal;

  // 1. Enumerate on-chain traces
  opts.onProgress?.(
    { phase: "enumerating", total: 0, verified: 0, mismatches: 0, unavailable: 0 },
    Array.from(itemsMap.values()),
  );

  let onChainTraces: OnChainMarketTrace[] = [];
  try {
    onChainTraces = await enumerateOnChainMarketTraces(opts.onChainMarketId, opts.client);
  } catch (err) {
    if (signal?.aborted) {
      return {
        items: Array.from(itemsMap.values()),
        summary: computeMarketAuditSummary(Array.from(itemsMap.values()), 0, 0),
        cancelled: true,
      };
    }
    throw err;
  }

  // 2. Fetch backend trace records for reconciliation
  let backendTraces: ReasoningTrace[] = opts.backendTraces ?? [];
  if (!opts.backendTraces) {
    try {
      const res = await listTraces({ marketId: opts.marketId ?? undefined, limit: 100 });
      backendTraces = res.traces;
    } catch {
      // If backend is unreachable or dry-run, continue with on-chain traces only
    }
  }

  const backendByOnChainId = new Map<string, ReasoningTrace>();
  for (const t of backendTraces) {
    if (t.onChainTraceId) backendByOnChainId.set(t.onChainTraceId, t);
  }

  // Populate initial pending items
  for (const onChain of onChainTraces) {
    if (!itemsMap.has(onChain.onChainTraceId)) {
      const backendRecord = backendByOnChainId.get(onChain.onChainTraceId) ?? null;
      itemsMap.set(onChain.onChainTraceId, {
        onChainTraceId: onChain.onChainTraceId,
        index: onChain.index,
        agent: onChain.agent,
        action: onChain.action,
        ipfsCid: onChain.ipfsCid,
        publishedAt: onChain.publishedAt,
        onChainHash: onChain.traceHash,
        computedHash: null,
        status: "pending",
        backendRecord,
        disagreements: [],
        isCriticalDisagreement: false,
      });
    }
  }

  const total = onChainTraces.length;
  let verified = 0;
  let mismatches = 0;
  let unavailable = 0;

  // Count already verified / settled items from resume
  for (const item of itemsMap.values()) {
    if (item.status === "verified") verified++;
    else if (item.status === "mismatch") mismatches++;
    else if (item.status === "unavailable") unavailable++;
  }

  const updateProgress = (currentTraceId?: string) => {
    opts.onProgress?.(
      {
        phase: signal?.aborted ? "paused" : "verifying",
        total,
        verified,
        mismatches,
        unavailable,
        currentTraceId,
      },
      Array.from(itemsMap.values()),
    );
  };

  updateProgress();

  const pendingItems = Array.from(itemsMap.values()).filter(
    (item) => item.status === "pending" || item.status === "running",
  );
  const wasCancelled = Boolean(signal?.aborted);
  const verifyItems = pendingItems.map((item) => {
    const onChain = onChainTraces.find((trace) => trace.onChainTraceId === item.onChainTraceId);
    return {
      onChainTraceId: item.onChainTraceId,
      ipfsCid: item.ipfsCid,
      traceHash: onChain?.traceHash ?? item.onChainHash,
      agent: item.agent,
    };
  });

  await verifyMany(verifyItems, {
    concurrency,
    signal,
    fetchImpl: opts.fetchImpl,
    onItem: ({ traceId, outcome, check }) => {
      const item = itemsMap.get(traceId);
      if (!item) return;
      const onChain = onChainTraces.find((trace) => trace.onChainTraceId === traceId);

      if (check.status === "verified") {
        item.status = "verified";
        item.computedHash = check.computedHash;
        item.content = check.content;
        verified++;
      } else if (check.status === "mismatch") {
        item.status = "mismatch";
        item.computedHash = check.computedHash;
        mismatches++;
      } else {
        item.status = "unavailable";
        item.reason = check.reason;
        unavailable++;
      }

      const reconciliation = reconcileTraceWithBackend(
        onChain ?? {
          index: item.index,
          onChainTraceId: item.onChainTraceId,
          agent: item.agent,
          action: item.action,
          ipfsCid: item.ipfsCid,
          publishedAt: item.publishedAt,
          traceHash: item.onChainHash,
        },
        item.status,
        item.computedHash,
        item.backendRecord,
      );
      item.disagreements = reconciliation.disagreements;
      if (outcome === "cid-mismatch") item.disagreements.push("CID digest does not match the served bytes.");
      if (outcome === "unregistered-agent") item.disagreements.push("Agent is not registered on-chain.");
      item.isCriticalDisagreement = reconciliation.isCriticalDisagreement || outcome === "unregistered-agent";
      updateProgress(traceId);
    },
  });

  const finalItems = Array.from(itemsMap.values()).sort((a, b) => a.index - b.index);
  const summary = computeMarketAuditSummary(finalItems, onChainTraces.length, backendTraces.length);

  opts.onProgress?.(
    {
      phase: wasCancelled || signal?.aborted ? "paused" : "completed",
      total,
      verified,
      mismatches,
      unavailable,
    },
    finalItems,
  );

  return {
    items: finalItems,
    summary,
    cancelled: wasCancelled || Boolean(signal?.aborted),
  };
}
