import { scValToNative } from "@stellar/stellar-sdk";
import { ApiError, isAuthError } from "@/lib/api/client";
import { CONTRACTS } from "@/lib/stellar/config";
import { decodeInvoke, type TxCheck } from "@/lib/stellar/tx-lifecycle";

export interface CopyBuyExpectation {
  trader: string; onChainMarketId: string; outcome: "Yes" | "No"; collateralInRaw: string;
}
export function verifyCopyBuy(check: TxCheck, expect: CopyBuyExpectation): "match" | "mismatch" | "pending" | "failed" {
  if (check.kind === "not-found") return "pending";
  if (check.kind === "failed") return "failed";
  const invoke = decodeInvoke(check.envelope);
  if (!invoke || invoke.contractId !== CONTRACTS.marketCore || invoke.fn !== "buy" || invoke.args.length !== 5) return "mismatch";
  try {
    const [trader, market, outcome, amount] = invoke.args.map((arg) => scValToNative(arg));
    return trader === expect.trader && BigInt(market) === BigInt(expect.onChainMarketId) &&
      Array.isArray(outcome) && outcome.length === 1 && outcome[0] === expect.outcome &&
      BigInt(amount) === BigInt(expect.collateralInRaw) ? "match" : "mismatch";
  } catch { return "mismatch"; }
}

export interface OutboxEntry {
  copyTradeId: string; traceId: string; marketId: string; onChainMarketId: string;
  outcome: "Yes" | "No"; collateralInRaw: string;
  state: "initiated" | "signed" | "confirming" | "confirmed" | "abandoned" | "mismatch";
  txHash: string | null; attempts: number; nextAttemptAt: number; lastError?: string; createdAt: number;
  /** Session id that paused auth. A new sign-in resumes it without a prompt loop. */
  pausedSessionId?: string | null;
  needsSession?: boolean;
  dismissed?: boolean;
}
export const RETENTION_MS = 26 * 60 * 60 * 1000;
export const MAX_OUTBOX_ENTRIES = 50;
export const retryDelay = (attempts: number) => Math.min(2 ** Math.min(attempts, 16) * 5_000, 600_000);
export const isTerminal = (entry: OutboxEntry) => ["confirmed", "abandoned", "mismatch"].includes(entry.state);

function validEntry(raw: unknown): raw is OutboxEntry {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as OutboxEntry;
  return [r.copyTradeId, r.traceId, r.marketId, r.onChainMarketId].every((v) => typeof v === "string" && v.length > 0) &&
    /^\d+$/.test(r.onChainMarketId) && typeof r.collateralInRaw === "string" && /^\d+$/.test(r.collateralInRaw) &&
    (r.outcome === "Yes" || r.outcome === "No") &&
    ["initiated", "signed", "confirming", "confirmed", "abandoned", "mismatch"].includes(r.state) &&
    (r.txHash === null || (typeof r.txHash === "string" && /^[a-f\d]{64}$/i.test(r.txHash))) &&
    Number.isFinite(r.createdAt) && Number.isFinite(r.nextAttemptAt) && Number.isInteger(r.attempts) && r.attempts >= 0;
}
const EMPTY: readonly OutboxEntry[] = [];
const memory = new Map<string, readonly OutboxEntry[]>();
const listeners = new Set<() => void>();
const key = (address: string) => `oracledesk_copy_outbox:${address}`;
const changed = () => listeners.forEach((fn) => fn());
export const subscribeOutbox = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emptyOutbox = () => EMPTY;

/** Returns a stable snapshot for useSyncExternalStore; storage is always optional. */
export function readOutbox(address: string | null): readonly OutboxEntry[] {
  if (!address || typeof window === "undefined") return EMPTY;
  const cached = memory.get(address); if (cached) return cached;
  let entries: OutboxEntry[] = [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(address)) ?? "[]");
    if (Array.isArray(parsed)) entries = parsed.filter(validEntry).slice(-MAX_OUTBOX_ENTRIES).map((entry) => ({ ...entry, txHash: entry.txHash?.toLowerCase() ?? null }));
  } catch { /* blocked, full or malformed storage falls back to this tab's memory */ }
  memory.set(address, entries);
  return entries;
}
export function writeOutbox(address: string, entries: readonly OutboxEntry[]): boolean {
  const next = [...entries];
  while (next.length > MAX_OUTBOX_ENTRIES) {
    const oldest = next.findIndex((entry) => isTerminal(entry) || entry.dismissed);
    if (oldest < 0) return false;
    next.splice(oldest, 1);
  }
  memory.set(address, next);
  let persisted = true;
  try { window.localStorage.setItem(key(address), JSON.stringify(next)); } catch { persisted = false; }
  changed();
  return persisted;
}
export function updateOutbox(address: string, id: string, patch: Partial<OutboxEntry>) {
  return writeOutbox(address, readOutbox(address).map((entry) => {
    if (entry.copyTradeId !== id) return entry;
    if (isTerminal(entry) && patch.state && patch.state !== entry.state) return entry;
    // A backend confirm overwrites the hash. Once chosen, never substitute a
    // different hash for this intent, even on a manual retry.
    if (entry.txHash && patch.txHash && entry.txHash.toLowerCase() !== patch.txHash.toLowerCase()) return entry;
    return { ...entry, ...patch, txHash: (patch.txHash ?? entry.txHash)?.toLowerCase() ?? null };
  }));
}
/** Refresh local snapshots when another tab writes; same-hash confirms are idempotent. */
export function refreshOutbox(address: string) { memory.delete(address); changed(); }

export interface ReconcileDeps {
  now: () => number;
  sessionId: string | null;
  check: (hash: string) => Promise<TxCheck>;
  confirm: (id: string, hash: string) => Promise<unknown>;
  assertCurrent: () => void;
}

/** One deterministic step. The provider owns scheduling and persistence. */
export async function reconcileEntry(entry: OutboxEntry, trader: string, deps: ReconcileDeps): Promise<OutboxEntry> {
  if (isTerminal(entry) || entry.dismissed) return entry;
  const now = deps.now();
  if (now - entry.createdAt >= RETENTION_MS) return { ...entry, state: "abandoned", lastError: "This trade can't be verified any more: the RPC retention window has passed." };
  if (entry.state === "initiated" || !entry.txHash || entry.nextAttemptAt > now) return entry;
  if (entry.needsSession && (!deps.sessionId || entry.pausedSessionId === deps.sessionId)) return entry;
  const next: OutboxEntry = { ...entry, needsSession: false, state: "confirming", attempts: entry.attempts + 1, nextAttemptAt: now + retryDelay(entry.attempts) };
  try {
    deps.assertCurrent();
    const checked = await deps.check(entry.txHash);
    deps.assertCurrent();
    const verdict = verifyCopyBuy(checked, { trader, ...entry });
    if (verdict === "pending") return { ...next, state: "signed", lastError: "Waiting for the transaction to appear on-chain." };
    if (verdict === "failed") return { ...next, state: "abandoned", lastError: `Transaction failed on-chain: ${checked.kind === "failed" ? checked.resultCode : "failed"}.` };
    if (verdict === "mismatch") return { ...next, state: "mismatch", lastError: "The transaction does not match this copy buy. It was not recorded." };
    if (!deps.sessionId) return { ...next, state: "signed", needsSession: true, pausedSessionId: null, lastError: "Sign in to finish recording this copy trade." };
    await deps.confirm(entry.copyTradeId, entry.txHash);
    deps.assertCurrent();
    return { ...next, state: "confirmed", lastError: undefined };
  } catch (error) {
    if (isAuthError(error)) return { ...next, state: "signed", needsSession: true, pausedSessionId: deps.sessionId, lastError: "Sign in to finish recording this copy trade." };
    if (error instanceof ApiError && error.code === "COPY_TRADE_NOT_FOUND") return { ...next, state: "abandoned", lastError: "The copy-trade record no longer exists for this wallet." };
    if ((error as { code?: string })?.code === "SCOPE_CHANGED") return entry;
    return { ...next, state: "signed", lastError: error instanceof Error ? error.message : "Recording failed; retrying automatically." };
  }
}
