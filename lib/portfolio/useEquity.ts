"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { rpc } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/contexts/WalletContext";
import { rpcServer } from "@/lib/stellar/clients";
import { CONTRACTS } from "@/lib/stellar/config";
import { decodeEvent, eventTopicFilter, type ChainEvent } from "@/lib/stellar/events";
import { priceYesBps } from "@/lib/stellar/generated/fpmm";
import { preTradeReserves } from "@/lib/stellar/trade-math";
import { fetchOnChainMarket } from "@/lib/hooks/useStellar";
import { equitySeries, kpis, toLedger, type EquityPoint, type LedgerEntry } from "./equity";

export type Resolution = "Yes" | "No" | "Void";
export interface EquityCoverage { fromLedger: number; truncated: boolean }
export type EquityStatus = "pending" | "ok" | "empty" | "error";

interface PricePoint { time: number; bps: bigint }

interface RawEquity {
  entries: LedgerEntry[];
  prices: Map<string, PricePoint[]>;
  current: Map<string, bigint>;
  resolved: Map<string, Resolution>;
  coverage: EquityCoverage;
  fetchedAt: number;
}

const EVENT_CAP = 5_000;
const PAGE_LIMIT = 1_000;
const SAMPLE_COUNT = 200;

/** One RPC pass over the wallet's market-core events, newest kept on overflow. */
async function loadEvents(address: string) {
  const server = rpcServer();
  const health = await server.getHealth();
  let startLedger = health.oldestLedger;
  const topics = [
    eventTopicFilter("Trade", { trader: address }),
    eventTopicFilter("Redeemed", { holder: address }),
    eventTopicFilter("MarketCreated", {}),
    eventTopicFilter("MarketResolved", {}),
  ];
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [CONTRACTS.marketCore], topics }];
  const events: rpc.Api.EventResponse[] = [];
  let truncated = false;
  for (let attempt = 0; ; attempt++) {
    try {
      events.length = 0;
      let cursor = "";
      while (true) {
        const page = cursor
          ? await server.getEvents({ filters, cursor, limit: PAGE_LIMIT })
          : await server.getEvents({ filters, startLedger, limit: PAGE_LIMIT });
        events.push(...page.events);
        // Cursor pages walk forward, so dropping from the front keeps the newest.
        if (events.length > EVENT_CAP) { events.splice(0, events.length - EVENT_CAP); truncated = true; }
        if (!page.cursor || page.cursor === cursor || page.events.length < PAGE_LIMIT) break;
        cursor = page.cursor;
      }
      break;
    } catch (error) {
      if (attempt > 0 || !/oldest|retention|startLedger|start ledger/i.test(String(error))) throw error;
      const fresh = await server.getHealth();
      if (fresh.oldestLedger <= startLedger) throw error;
      startLedger = fresh.oldestLedger;
      truncated = true;
    }
  }
  return { events, startLedger, truncated };
}

function pushPrice(prices: Map<string, PricePoint[]>, marketId: string, time: number, bps: bigint) {
  const list = prices.get(marketId);
  if (list) list.push({ time, bps });
  else prices.set(marketId, [{ time, bps }]);
}

async function loadRaw(address: string): Promise<RawEquity> {
  const { events, startLedger, truncated } = await loadEvents(address);
  const decoded: ChainEvent[] = [];
  for (const raw of events) {
    const event = decodeEvent(raw);
    if (event) decoded.push(event);
  }
  const entries = toLedger(decoded, address);
  const resolved = new Map<string, Resolution>();
  const prices = new Map<string, PricePoint[]>();
  const seenTrade = new Set<string>();
  for (const event of decoded) {
    const marketId = String(event.data.market_id);
    const time = Date.parse(event.closedAt);
    if (event.name === "MarketResolved") {
      const outcome = event.data.outcome as { tag?: unknown } | null | undefined;
      resolved.set(marketId, outcome?.tag === "Yes" ? "Yes" : outcome?.tag === "No" ? "No" : "Void");
    } else if (event.name === "MarketCreated") {
      const bps = event.data.initial_yes_bps;
      if (typeof bps === "number") pushPrice(prices, marketId, time, BigInt(bps));
    } else if (event.name === "Trade") {
      const d = event.data;
      const [reserveYes, reserveNo] = [d.reserve_yes, d.reserve_no];
      if (typeof reserveYes !== "bigint" || typeof reserveNo !== "bigint" || reserveYes + reserveNo <= 0n) continue;
      const outcome = (d.outcome as { tag?: unknown } | undefined)?.tag === "No" ? "No" : "Yes";
      if (!seenTrade.has(marketId)) {
        seenTrade.add(marketId);
        if (typeof d.is_buy === "boolean" && typeof d.collateral === "bigint" && typeof d.shares === "bigint" && typeof d.fee === "bigint") {
          const pre = preTradeReserves({ outcome, isBuy: d.is_buy, collateral: d.collateral, shares: d.shares, fee: d.fee, reserveYes, reserveNo });
          if (pre && pre.reserveYes + pre.reserveNo > 0n) pushPrice(prices, marketId, time - 1, priceYesBps(pre.reserveYes, pre.reserveNo));
        }
      }
      pushPrice(prices, marketId, time, priceYesBps(reserveYes, reserveNo));
    }
  }
  const marketIds = [...new Set(entries.map(entry => entry.marketId))];
  const views = await Promise.all(marketIds.map(id => fetchOnChainMarket(id).catch(() => null)));
  const current = new Map<string, bigint>();
  views.forEach((view, i) => {
    if (!view) return;
    const marketId = marketIds[i];
    current.set(marketId, BigInt(view.yesBps));
    const status = view.market.status;
    if (status.tag === "Resolved") resolved.set(marketId, status.values[0].tag);
    else if (status.tag === "Void") resolved.set(marketId, "Void");
  });
  return { entries, prices, current, resolved, coverage: { fromLedger: startLedger, truncated }, fetchedAt: Date.now() };
}

/** Step lookup: last observed price at or before `time`, current price after the last trade. */
function priceAt(raw: RawEquity, marketId: string, time: number): bigint | null {
  const points = raw.prices.get(marketId);
  if (!points?.length) return raw.current.get(marketId) ?? null;
  const last = points[points.length - 1];
  if (time > last.time) return raw.current.get(marketId) ?? last.bps;
  let found: bigint | null = null;
  for (const point of points) {
    if (point.time > time) break;
    found = point.bps;
  }
  return found ?? points[0].bps;
}

/**
 * Connected wallet's mark-to-mid equity. `rangeS` is the window in seconds
 * (86400 / 604800 / 2592000 / Infinity for ALL); refetches are keyed per address
 * and invalidated by tradeInvalidationKeys.
 */
export function useEquity(rangeS: number) {
  const { address } = useWallet();
  const query = useQuery({
    queryKey: ["stellar", "equity", address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: () => loadRaw(address as string),
  });

  return useMemo(() => {
    const raw = query.data;
    const base = {
      entries: [] as LedgerEntry[],
      series: [] as EquityPoint[],
      kpis: kpis([], { time: 0, cashFlow: 0n, markValue: 0n, equity: 0n, partial: false }, new Map<string, Resolution>()),
      coverage: raw?.coverage ?? { fromLedger: 0, truncated: false },
      resolved: raw?.resolved ?? new Map<string, Resolution>(),
      status: (query.isError ? "error" : query.isPending ? "pending" : "empty") as EquityStatus,
      isFetching: query.isFetching,
    };
    if (!raw || raw.entries.length === 0) return base;
    const now = raw.fetchedAt;
    const start = raw.entries[0].time;
    const from = Number.isFinite(rangeS) ? Math.max(start, now - rangeS * 1000) : start;
    const samples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) samples.push(from + ((now - from) * i) / (SAMPLE_COUNT - 1));
    const full = equitySeries(raw.entries, (id, time) => priceAt(raw, id, time), samples);
    return {
      ...base,
      status: "ok" as const,
      series: full.filter(point => point.time >= from),
      kpis: kpis(raw.entries, full[full.length - 1], raw.resolved),
      entries: [...raw.entries].reverse(),
      resolved: raw.resolved,
    };
  }, [query.data, query.isPending, query.isError, query.isFetching, rangeS]);
}
