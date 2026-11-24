import type { rpc } from "@stellar/stellar-sdk";
import { rpcServer } from "./clients";
import { withRpcPriority } from "./rpc-scheduler";
import { CONTRACTS, NETWORK_PASSPHRASE } from "./config";
import { MathError, priceYesBps, seedReserves } from "./generated/fpmm";
import { decodeMarketCoreEvent, marketTopicFilter, type DecodedEvent } from "./events";

/** One point of the contract's own YES price. bigint stays bigint until a
 * chart formats it; `time` is ledger close time, never Date.now(). */
export interface PricePoint {
  ledger: number;
  /** unix seconds (ledger close time) */
  time: number;
  yesBps: bigint;
  kind: "open" | "trade" | "resolved";
  txHash: string;
  eventId: string;
  reserveYes?: bigint;
  reserveNo?: bigint;
}

export interface Coverage {
  fromLedger: number;
  toLedger: number;
  complete: boolean;
  reason?: "retention" | "partial";
}

export interface CacheState {
  cursor?: string | null;
  toLedger?: number;
}

export interface PriceHistoryBatch {
  events: DecodedEvent[];
  cursor: string | null;
  coverage: Coverage;
  latestLedger: number;
}

export interface PriceHistorySource {
  load(marketId: bigint, since?: CacheState): Promise<PriceHistoryBatch>;
}

const byEventOrder = (a: PricePoint, b: PricePoint) =>
  a.ledger - b.ledger || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);

const pointTime = (closedAt: string, fallback: number) => {
  const parsed = Date.parse(closedAt);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : fallback;
};

/** Build a bigint price series from decoded chain events.
 * Sorted by (ledger, event id) and de-duplicated by event id. */
export function buildSeries(events: readonly DecodedEvent[], opts?: { initialYesBps?: number }): PricePoint[] {
  const unique = new Map<string, DecodedEvent>();
  for (const ev of events) if (!unique.has(ev.meta.id)) unique.set(ev.meta.id, ev);

  const points: PricePoint[] = [];
  for (const ev of [...unique.values()].sort((a, b) =>
    a.meta.ledger - b.meta.ledger || (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0))) {
    const time = pointTime(ev.meta.ledgerClosedAt, 0);
    const base = { ledger: ev.meta.ledger, time, txHash: ev.meta.txHash, eventId: ev.meta.id };
    if (ev.kind === "MarketCreated") {
      let yesBps: bigint;
      try {
        const seed = seedReserves(ev.seedAmount, BigInt(ev.initialYesBps));
        yesBps = priceYesBps(seed.reserveYes, seed.reserveNo);
      } catch (error) {
        if (!(error instanceof MathError)) throw error;
        yesBps = BigInt(opts?.initialYesBps ?? ev.initialYesBps);
      }
      points.push({ ...base, kind: "open", yesBps });
    } else if (ev.kind === "Trade") {
      let yesBps: bigint;
      try {
        yesBps = priceYesBps(ev.reserveYes, ev.reserveNo);
      } catch (error) {
        if (!(error instanceof MathError)) throw error;
        // Zero reserves after claim_pool_remainder: not a price, skip the point.
        console.warn(`price-history: skipping trade ${ev.meta.id} with zero reserves`);
        continue;
      }
      points.push({ ...base, kind: "trade", yesBps, reserveYes: ev.reserveYes, reserveNo: ev.reserveNo });
    } else if (ev.kind === "MarketResolved") {
      const yesBps = ev.outcome === "Yes" ? 10_000n : ev.outcome === "No" ? 0n : 5_000n;
      points.push({ ...base, kind: "resolved", yesBps });
    }
  }
  return points;
}

/** Merge newly decoded events into an existing series, keeping first-seen order
 * and returning the same array reference when nothing is new. */
export function appendEvents(points: readonly PricePoint[], events: readonly DecodedEvent[]): PricePoint[] {
  const fresh = buildSeries(events);
  if (!fresh.length) return points as PricePoint[];
  const byId = new Map(points.map(point => [point.eventId, point]));
  let changed = false;
  for (const point of fresh) {
    if (!byId.has(point.eventId)) { byId.set(point.eventId, point); changed = true; }
  }
  if (!changed) return points as PricePoint[];
  return [...byId.values()].sort(byEventOrder);
}

/** Coverage for a series: incomplete when the RPC retention window dropped the
 * older history or when the opening event was never seen (never extrapolated). */
export function coverageOf(points: readonly PricePoint[], opts: { fromLedger?: number; toLedger: number; retention?: boolean }): Coverage {
  const hasOpen = points.some(point => point.kind === "open");
  const fromLedger = opts.fromLedger ?? points[0]?.ledger ?? opts.toLedger;
  return {
    fromLedger,
    toLedger: opts.toLedger,
    complete: !opts.retention && hasOpen,
    ...(opts.retention ? { reason: "retention" as const } : hasOpen ? {} : { reason: "partial" as const }),
  };
}

export const PRICE_HISTORY_PAGE_LIMIT = 1000;
export const PRICE_HISTORY_MAX_PAGES = 20;
const PRICE_HISTORY_FILTERS = ["MarketCreated", "Trade", "MarketResolved"] as const;

type EventServer = Pick<rpc.Server, "getHealth" | "getEvents">;

export interface RpcSourceOptions {
  pageLimit?: number;
  maxPages?: number;
}

/** Pages getEvents for one market, starting from the RPC retention edge or a
 * cached cursor. Never asks for history the node no longer has. */
export function rpcPriceHistorySource(
  server: EventServer = rpcServer(),
  opts: RpcSourceOptions = {},
): PriceHistorySource {
  const pageLimit = opts.pageLimit ?? PRICE_HISTORY_PAGE_LIMIT;
  const maxPages = opts.maxPages ?? PRICE_HISTORY_MAX_PAGES;

  return {
    async load(marketId: bigint, since?: CacheState): Promise<PriceHistoryBatch> {
      const health = await withRpcPriority({ priority: "background", tag: "price-history" }, () => server.getHealth());
      const oldestLedger = health.oldestLedger;
      const latestLedger = health.latestLedger;
      const filters = marketTopicFilter(marketId, PRICE_HISTORY_FILTERS);
      const events: rpc.Api.EventResponse[] = [];

      // A cursor older than the retention edge is rejected by some providers;
      // restart at the edge and record the gap instead of failing.
      let retention = Boolean(since?.toLedger !== undefined && since.toLedger + 1 < oldestLedger);
      let cursor = retention ? "" : (since?.cursor ?? "");

      const readPage = async () => {
        const response = await withRpcPriority({ priority: "background", tag: "price-history" }, () =>
          cursor
            ? server.getEvents({ filters, cursor, limit: pageLimit })
            : server.getEvents({ filters, startLedger: Math.max(1, oldestLedger), endLedger: latestLedger + 1, limit: pageLimit }),
        );
        events.push(...response.events);
        const previous = cursor;
        cursor = response.cursor ?? "";
        return { count: response.events.length, stalled: !cursor || cursor === previous };
      };

      for (let page = 0; page < maxPages; page++) {
        const result = await readPage().catch(error => {
          if (cursor && /oldest|retention|cursor|history|start ledger|startLedger/i.test(String(error))) {
            // Fall back to a fresh window from the retention edge.
            retention = retention || Boolean(since?.cursor);
            cursor = "";
            return null;
          }
          throw error;
        });
        if (result === null) continue; // the restarted window is the next page
        if (result.stalled || result.count < pageLimit) break;
      }

      const decoded = events.flatMap(event => {
        const value = decodeMarketCoreEvent(event);
        return value && value.marketId === marketId ? [value] : [];
      });

      return {
        events: decoded,
        cursor,
        coverage: {
          fromLedger: decoded[0]?.meta.ledger ?? Math.max(1, oldestLedger),
          toLedger: latestLedger,
          complete: !retention,
          ...(retention ? { reason: "retention" as const } : {}),
        },
        latestLedger,
      };
    },
  };
}

// ── IndexedDB cache ─────────────────────────────────────────────────────────
// One entry per (network passphrase, contract id, market id): a redeploy or a
// network switch can never mix two histories.

const DB_NAME = "oracledesk-history";
export const DB_VERSION = 3;
const STORE = "series";
export const LIFECYCLE_STORE = "lifecycle";
export const WALLET_LEDGER_STORE = "wallet-ledger";

export interface SerializedPricePoint {
  ledger: number;
  time: number;
  yesBps: string;
  kind: PricePoint["kind"];
  txHash: string;
  eventId: string;
  reserveYes?: string;
  reserveNo?: string;
}

export interface CachedSeries {
  v: 1;
  points: SerializedPricePoint[];
  cursor: string | null;
  toLedger: number;
  coverage: Coverage;
}

export function seriesCacheKey(marketId: bigint | string): string {
  return `${NETWORK_PASSPHRASE}|${CONTRACTS.marketCore}|${marketId}`;
}

export function lifecycleCacheKey(marketId: bigint | string): string {
  return `${NETWORK_PASSPHRASE}|${CONTRACTS.marketCore}|${CONTRACTS.reasoningRegistry}|${CONTRACTS.resolver}|${marketId}`;
}

export function serializePoints(points: readonly PricePoint[]): SerializedPricePoint[] {
  return points.map(point => ({
    ledger: point.ledger,
    time: point.time,
    yesBps: point.yesBps.toString(),
    kind: point.kind,
    txHash: point.txHash,
    eventId: point.eventId,
    ...(point.reserveYes !== undefined ? { reserveYes: point.reserveYes.toString() } : {}),
    ...(point.reserveNo !== undefined ? { reserveNo: point.reserveNo.toString() } : {}),
  }));
}

export function deserializePoints(points: readonly SerializedPricePoint[]): PricePoint[] {
  return points.map(({ reserveYes, reserveNo, ...point }) => ({
    ...point,
    yesBps: BigInt(point.yesBps),
    ...(reserveYes !== undefined ? { reserveYes: BigInt(reserveYes) } : {}),
    ...(reserveNo !== undefined ? { reserveNo: BigInt(reserveNo) } : {}),
  }));
}

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/** Session-scoped fallback when IndexedDB is missing (SSR, Node tests, private
 * mode). Bounded so a long session cannot grow it without limit. */
const memoryCache = new Map<string, CachedSeries>();
const MEMORY_CACHE_MAX = 32;
function remember(key: string, value: CachedSeries) {
  memoryCache.delete(key);
  memoryCache.set(key, value);
  if (memoryCache.size > MEMORY_CACHE_MAX) memoryCache.delete(memoryCache.keys().next().value!);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(LIFECYCLE_STORE)) db.createObjectStore(LIFECYCLE_STORE);
      if (!db.objectStoreNames.contains(WALLET_LEDGER_STORE)) db.createObjectStore(WALLET_LEDGER_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    request.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

export interface CachedLifecycle {
  v: 1;
  events: unknown[];
  toLedger: number;
  cursors: Record<string, string | null>;
  coverage: Coverage;
}

const lifecycleMemoryCache = new Map<string, CachedLifecycle>();

export interface CachedWalletLedger<T = unknown> {
  v: 1;
  entries: T[];
  cursors: Record<string, string>;
  startLedger: number;
  toLedger: number;
  truncated: boolean;
}

const walletLedgerMemoryCache = new Map<string, CachedWalletLedger>();

export async function readWalletLedgerCache<T = unknown>(key: string): Promise<CachedWalletLedger<T> | null> {
  if (!idbAvailable()) return (walletLedgerMemoryCache.get(key) as CachedWalletLedger<T> | undefined) ?? null;
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(WALLET_LEDGER_STORE)) {
      db.close();
      return (walletLedgerMemoryCache.get(key) as CachedWalletLedger<T> | undefined) ?? null;
    }
    const value = await new Promise<CachedWalletLedger<T> | null>((resolve, reject) => {
      const request = db.transaction(WALLET_LEDGER_STORE, "readonly").objectStore(WALLET_LEDGER_STORE).get(key);
      request.onsuccess = () => resolve((request.result as CachedWalletLedger<T> | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
    });
    db.close();
    if (!value || value.v !== 1 || !Array.isArray(value.entries)) {
      return (walletLedgerMemoryCache.get(key) as CachedWalletLedger<T> | undefined) ?? null;
    }
    walletLedgerMemoryCache.set(key, value as CachedWalletLedger);
    return value;
  } catch {
    return (walletLedgerMemoryCache.get(key) as CachedWalletLedger<T> | undefined) ?? null;
  }
}

export async function writeWalletLedgerCache<T = unknown>(key: string, value: CachedWalletLedger<T>): Promise<boolean> {
  walletLedgerMemoryCache.set(key, value as CachedWalletLedger);
  if (walletLedgerMemoryCache.size > MEMORY_CACHE_MAX) {
    walletLedgerMemoryCache.delete(walletLedgerMemoryCache.keys().next().value!);
  }
  if (!idbAvailable()) return false;
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(WALLET_LEDGER_STORE)) {
      db.close();
      return false;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WALLET_LEDGER_STORE, "readwrite");
      tx.objectStore(WALLET_LEDGER_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function readLifecycleCache(key: string): Promise<CachedLifecycle | null> {
  if (!idbAvailable()) return lifecycleMemoryCache.get(key) ?? null;
  try {
    const db = await openDb();
    const value = await new Promise<CachedLifecycle | null>((resolve, reject) => {
      const request = db.transaction(LIFECYCLE_STORE, "readonly").objectStore(LIFECYCLE_STORE).get(key);
      request.onsuccess = () => resolve((request.result as CachedLifecycle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
    });
    db.close();
    if (!value || value.v !== 1 || !Array.isArray(value.events)) {
      return lifecycleMemoryCache.get(key) ?? null;
    }
    lifecycleMemoryCache.set(key, value);
    return value;
  } catch {
    return lifecycleMemoryCache.get(key) ?? null;
  }
}

export async function writeLifecycleCache(key: string, value: CachedLifecycle): Promise<boolean> {
  lifecycleMemoryCache.set(key, value);
  if (lifecycleMemoryCache.size > MEMORY_CACHE_MAX) {
    lifecycleMemoryCache.delete(lifecycleMemoryCache.keys().next().value!);
  }
  if (!idbAvailable()) return false;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIFECYCLE_STORE, "readwrite");
      tx.objectStore(LIFECYCLE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Read the cached series, falling back to the in-memory copy when IndexedDB
 * is unavailable (SSR, Node tests, private mode) or errors. Never throws. */
export async function readSeriesCache(key: string): Promise<CachedSeries | null> {
  if (!idbAvailable()) return memoryCache.get(key) ?? null;
  try {
    const db = await openDb();
    const value = await new Promise<CachedSeries | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as CachedSeries | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
    });
    db.close();
    if (!value || value.v !== 1 || !Array.isArray(value.points)) return memoryCache.get(key) ?? null;
    remember(key, value);
    return value;
  } catch {
    return memoryCache.get(key) ?? null;
  }
}

export async function writeSeriesCache(key: string, value: CachedSeries): Promise<boolean> {
  remember(key, value);
  if (!idbAvailable()) return false;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export interface LoadedPriceHistory {
  points: PricePoint[];
  coverage: Coverage;
  latestLedger: number;
}

/** Cache-then-incremental load. A second open of the same market replays the
 * cached cursor, which costs one getEvents request. */
export async function loadPriceHistory(
  marketId: bigint,
  opts: { source?: PriceHistorySource; cacheKey?: string; now?: number } = {},
): Promise<LoadedPriceHistory> {
  const source = opts.source ?? rpcPriceHistorySource();
  const key = opts.cacheKey ?? seriesCacheKey(marketId);
  const cached = await readSeriesCache(key);
  const batch = await source.load(marketId, cached ? { cursor: cached.cursor, toLedger: cached.toLedger } : undefined);

  const points = cached
    ? appendEvents(deserializePoints(cached.points), batch.events)
    : buildSeries(batch.events);

  const retention = batch.coverage.reason === "retention" || cached?.coverage.reason === "retention";
  const coverage = coverageOf(points, {
    fromLedger: cached?.coverage.fromLedger,
    toLedger: batch.latestLedger,
    retention,
  });

  await writeSeriesCache(key, {
    v: 1,
    points: serializePoints(points),
    cursor: batch.cursor,
    toLedger: batch.latestLedger,
    coverage,
  });

  return { points, coverage, latestLedger: batch.latestLedger };
}
