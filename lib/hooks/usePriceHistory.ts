"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { rpcServer } from "@/lib/stellar/clients";
import { CONTRACTS } from "@/lib/stellar/config";
import { decodeEvent, eventTopicFilter, type ChainEvent } from "@/lib/stellar/events";
import { priceYesBps } from "@/lib/stellar/generated/fpmm";
import { preTradeReserves, type TradeEventData } from "@/lib/stellar/trade-math";
import type { OnChainMarketView } from "@/lib/hooks/useStellar";
import { loadPriceHistory, type Coverage, type PricePoint } from "@/lib/stellar/price-history";

export interface Window24h {
  points: { time: number; yesBps: bigint }[];
  startBps: bigint | null;
  endBps: bigint;
  changeBps: bigint | null;
  trades: number;
  truncated: boolean;
  reason?: "too-young" | "unavailable" | "no-trades";
}

const DAY_IN_SECONDS = 86_400;
const DAY_IN_LEDGERS = 17_280;
const LEDGER_PAD = 60;
export const PRICE_WINDOW_LIMIT = 1000;

function parseTrade(data: Record<string, unknown>): TradeEventData | null {
  const outcome = (data.outcome as { tag?: unknown } | undefined)?.tag;
  if ((outcome !== "Yes" && outcome !== "No") || typeof data.is_buy !== "boolean") return null;
  const [collateral, shares, fee, reserveYes, reserveNo] = [data.collateral, data.shares, data.fee, data.reserve_yes, data.reserve_no];
  if (![collateral, shares, fee, reserveYes, reserveNo].every(value => typeof value === "bigint")) return null;
  return { outcome, isBuy: data.is_buy, collateral: collateral as bigint, shares: shares as bigint, fee: fee as bigint, reserveYes: reserveYes as bigint, reserveNo: reserveNo as bigint };
}

/** Builds the bounded 24h window: exact start price from the first trade, one point per trade, live end price. */
export function buildWindow(
  events: ChainEvent[],
  view: { yesBps: number; ledger: number | null },
  nowSec: number,
  truncated = events.length >= PRICE_WINDOW_LIMIT,
): Window24h {
  const endBps = BigInt(view.yesBps);
  const windowStart = nowSec - DAY_IN_SECONDS;
  const ordered = events
    .filter(event => Date.parse(event.closedAt) / 1000 >= windowStart)
    .sort((a, b) => a.ledger - b.ledger || a.id.localeCompare(b.id));

  const points: Window24h["points"] = [];
  let startBps: bigint | null = null;
  let startKnown = false;
  let young = false;
  let resolved = false;
  let trades = 0;

  for (const event of ordered) {
    const at = Date.parse(event.closedAt) / 1000;
    if (event.name === "MarketCreated") {
      const initial = event.data.initial_yes_bps;
      if (young || typeof initial !== "number") continue;
      young = true;
      startKnown = true;
      startBps = BigInt(initial);
      points.push({ time: at, yesBps: startBps });
      continue;
    }
    if (event.name === "MarketResolved") {
      resolved = true;
      break;
    }
    if (event.name !== "Trade") continue;
    const trade = parseTrade(event.data);
    if (!trade) continue;
    if (!startKnown) {
      startKnown = true;
      if (!young) {
        const pre = preTradeReserves(trade);
        if (pre) {
          startBps = priceYesBps(pre.reserveYes, pre.reserveNo);
          points.push({ time: windowStart, yesBps: startBps });
        }
      }
    }
    points.push({ time: at, yesBps: priceYesBps(trade.reserveYes, trade.reserveNo) });
    trades++;
  }

  if (!resolved) {
    if (points.length === 0) {
      startBps = endBps;
      points.push({ time: windowStart, yesBps: endBps }, { time: nowSec, yesBps: endBps });
    } else {
      points.push({ time: nowSec, yesBps: endBps });
    }
  }

  return {
    points,
    startBps,
    endBps,
    changeBps: startBps === null ? null : endBps - startBps,
    trades,
    truncated,
    reason: young ? "too-young" : trades === 0 ? "no-trades" : undefined,
  };
}

export function useRecentPriceWindow(onChainId: string | null, view: OnChainMarketView | undefined): UseQueryResult<Window24h> {
  return useQuery({
    queryKey: ["stellar", "priceWindow24h", CONTRACTS.marketCore, onChainId],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    enabled: Boolean(onChainId) && view?.ledger != null,
    queryFn: async (): Promise<Window24h> => {
      const current = view;
      const endBps = BigInt(current?.yesBps ?? 0);
      try {
        if (!onChainId || current?.ledger == null) throw new Error("ledger not known yet");
        const marketId = BigInt(onChainId);
        const page = await rpcServer().getEvents({
          startLedger: Math.max(1, current.ledger - DAY_IN_LEDGERS - LEDGER_PAD),
          filters: [{
            type: "contract",
            contractIds: [CONTRACTS.marketCore],
            topics: [
              eventTopicFilter("Trade", { market_id: marketId }),
              eventTopicFilter("MarketCreated", { market_id: marketId }),
              eventTopicFilter("MarketResolved", { market_id: marketId }),
            ],
          }],
          limit: PRICE_WINDOW_LIMIT,
        });
        const events = page.events.flatMap(raw => {
          const event = decodeEvent(raw);
          return event ? [event] : [];
        });
        return buildWindow(events, current, Date.now() / 1000, page.events.length >= PRICE_WINDOW_LIMIT);
      } catch {
        return { points: [], startBps: null, endBps, changeBps: null, trades: 0, truncated: false, reason: "unavailable" };
      }
    },
  });
}

export const priceHistoryKey = (id: string) => ["stellar", "priceHistory", id] as const;

const EMPTY_POINTS: PricePoint[] = [];

/**
 * Live price history for one market, keyed under the "stellar" prefix so
 * disconnect() drops it with the other chain queries. Revalidates every 15 s
 * while the tab is visible; each revalidation is one incremental getEvents
 * call from the cached cursor.
 */
export function usePriceHistory(id: string | bigint | null | undefined) {
  const key = id === null || id === undefined || id === "" ? "" : String(id);
  const query = useQuery({
    queryKey: priceHistoryKey(key),
    queryFn: () => loadPriceHistory(BigInt(key)),
    enabled: key !== "",
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const coverage: Coverage | undefined = query.data?.coverage;
  return {
    points: query.data?.points ?? EMPTY_POINTS,
    coverage,
    latestLedger: query.data?.latestLedger,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
