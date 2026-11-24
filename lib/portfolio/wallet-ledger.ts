import type { rpc } from "@stellar/stellar-sdk";
import { withRpcPriority } from "@/lib/stellar/rpc-scheduler";
import { rpcServer } from "@/lib/stellar/clients";
import { CONTRACTS } from "@/lib/stellar/config";
import { decodeEvent, eventTopicFilter, type ChainEvent } from "@/lib/stellar/events";
import { loadPriceHistory, readWalletLedgerCache, writeWalletLedgerCache, type LoadedPriceHistory } from "@/lib/stellar/price-history";
import { fetchOnChainMarket } from "@/lib/hooks/useStellar";
import { toLedger, type LedgerEntry, type Resolution } from "./equity";
import { deserializeLedger, serializeLedger } from "./equity-serialize";

export const MAX_WALLET_LEDGER_EVENTS = 5_000;
export const MAX_MARKETS_FULL = 200;
const PAGE_LIMIT = 1_000;
const CONCURRENCY = 4;

export interface WalletLedgerCoverage {
  fromLedger: number;
  truncated: boolean;
}

export interface LoadedWalletLedger {
  entries: LedgerEntry[];
  streams: Record<string, LoadedPriceHistory>;
  feeBps: Record<string, bigint>;
  finals: Record<string, Resolution>;
  closeTimes: Record<string, bigint>;
  coverage: WalletLedgerCoverage;
  approximate: string[];
  fetchedAt: number;
}

const cacheKey = (wallet: string) => `${CONTRACTS.marketCore}|${wallet}`;

interface FilterSpec {
  name: string;
  topics: string[] | null;
  filter: (event: ChainEvent, wallet: string) => boolean;
}

function filtersFor(wallet: string): FilterSpec[] {
  const safe = (name: string, values: Record<string, unknown>): string[] | null => {
    try {
      return eventTopicFilter(name, values);
    } catch {
      return null;
    }
  };
  return [
    { name: "Trade", topics: safe("Trade", { trader: wallet }), filter: (event) => event.name === "Trade" },
    { name: "Redeemed", topics: safe("Redeemed", { holder: wallet }), filter: (event) => event.name === "Redeemed" },
    { name: "MarketCreated", topics: safe("MarketCreated", {}), filter: (event) => event.name === "MarketCreated" },
    { name: "PoolRemainderClaimed", topics: safe("PoolRemainderClaimed", { creator: wallet }), filter: (event) => event.name === "PoolRemainderClaimed" },
  ];
}

async function fetchFilter(
  server: Pick<rpc.Server, "getEvents">,
  spec: FilterSpec,
  wallet: string,
  cursor: string,
  startLedger: number,
): Promise<{ events: rpc.Api.EventResponse[]; cursor: string; truncated: boolean }> {
  if (!spec.topics) return { events: [], cursor, truncated: true };
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [CONTRACTS.marketCore], topics: [spec.topics] }];
  const events: rpc.Api.EventResponse[] = [];
  let next = cursor;
  let truncated = false;
  for (let page = 0; page < 20; page += 1) {
    const response = await withRpcPriority({ priority: "background", tag: "wallet-ledger" }, () =>
      next
        ? server.getEvents({ filters, cursor: next, limit: PAGE_LIMIT })
        : server.getEvents({ filters, startLedger, limit: PAGE_LIMIT }),
    );
    events.push(...response.events);
    if (events.length > MAX_WALLET_LEDGER_EVENTS) {
      events.splice(0, events.length - MAX_WALLET_LEDGER_EVENTS);
      truncated = true;
    }
    next = response.cursor ?? "";
    if (!next || response.events.length < PAGE_LIMIT) break;
  }
  return { events, cursor: next, truncated };
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadWalletLedger(wallet: string): Promise<LoadedWalletLedger> {
  const server = rpcServer();
  const health = await withRpcPriority({ priority: "background", tag: "wallet-ledger" }, () => server.getHealth());
  const cached = await readWalletLedgerCache<ReturnType<typeof serializeLedger>>(cacheKey(wallet));
  const startLedger = cached?.startLedger ?? health.oldestLedger;
  const specs = filtersFor(wallet);
  const decoded: ChainEvent[] = [];
  const cursors: Record<string, string> = {};
  let truncated = Boolean(cached?.truncated);

  const batches = await Promise.all(
    specs.map((spec) => fetchFilter(server, spec, wallet, cached?.cursors?.[spec.name] ?? "", startLedger)),
  );
  batches.forEach((batch, index) => {
    const spec = specs[index];
    cursors[spec.name] = batch.cursor;
    truncated = truncated || batch.truncated;
    for (const raw of batch.events) {
      const event = decodeEvent(raw);
      if (event && spec.filter(event, wallet)) decoded.push(event);
    }
  });

  const entries = toLedger(decoded, wallet);
  if (entries.length === 0 && cached?.entries?.length) entries.push(...deserializeLedger(cached.entries));
  const marketIds = [...new Set(entries.map((entry) => entry.marketId))].sort();
  const fullIds = marketIds.slice(0, MAX_MARKETS_FULL);
  const approximate = marketIds.slice(MAX_MARKETS_FULL);

  const histories = await mapWithConcurrency(fullIds, CONCURRENCY, (id) =>
    loadPriceHistory(BigInt(id)).catch(() => ({
      points: [],
      coverage: { fromLedger: startLedger, toLedger: health.latestLedger, complete: false, reason: "partial" as const },
      latestLedger: health.latestLedger,
    })),
  );
  const streams: Record<string, LoadedPriceHistory> = {};
  histories.forEach((history, index) => { streams[fullIds[index]] = history; });

  const views = await mapWithConcurrency(fullIds, CONCURRENCY, (id) => fetchOnChainMarket(id).catch(() => null));
  const feeBps: Record<string, bigint> = {};
  const finals: Record<string, Resolution> = {};
  const closeTimes: Record<string, bigint> = {};
  views.forEach((view, index) => {
    const id = fullIds[index];
    if (!view) return;
    feeBps[id] = BigInt(view.market.fee_bps);
    closeTimes[id] = BigInt(view.market.close_time);
    const status = view.market.status;
    if (status.tag === "Resolved") finals[id] = status.values[0].tag === "No" ? "No" : "Yes";
    else if (status.tag === "Void") finals[id] = "Void";
  });

  for (const [id, history] of Object.entries(streams)) {
    const resolved = history.points.find((point) => point.kind === "resolved");
    if (resolved && !finals[id]) finals[id] = history.points.some((point) => point.yesBps === 10_000n) ? "Yes" : "No";
  }

  await writeWalletLedgerCache(cacheKey(wallet), {
    v: 1,
    entries: serializeLedger(entries),
    cursors,
    startLedger,
    toLedger: health.latestLedger,
    truncated,
  });

  return {
    entries,
    streams,
    feeBps,
    finals,
    closeTimes,
    coverage: { fromLedger: startLedger, truncated },
    approximate,
    fetchedAt: Date.now(),
  };
}
