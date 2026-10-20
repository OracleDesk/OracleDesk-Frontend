"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Position as BackendPosition } from "@/lib/api/portfolio";
import { marketCore } from "@/lib/stellar/clients";
import { CONTRACTS } from "@/lib/stellar/config";
import type { Market as OnChainMarket, Position as OnChainPosition } from "@/lib/stellar/generated/market-core";
import { settlementOf } from "@/lib/stellar/ledger-entries";
import { simulated } from "@/lib/stellar/typed-call";
import {
  fetchOnChainMarket,
  stellarKeys,
  useLedgerNow,
  useMarketConfig,
  type OnChainMarketView,
} from "@/lib/hooks/useStellar";
import {
  valueHolding,
  type Holding,
  type MarketState,
  type Valuation,
} from "./valuation";

export const VALUATION_BASIS_STORAGE_KEY = "oracledesk_valuation_basis";
export type ValuationMode = "exit" | "mid";

const CONCURRENCY_LIMIT = 4;

export function loadValuationMode(): ValuationMode {
  if (typeof window === "undefined") return "exit";
  try {
    const raw = window.localStorage.getItem(VALUATION_BASIS_STORAGE_KEY);
    return raw === "mid" ? "mid" : "exit";
  } catch {
    return "exit";
  }
}

export function saveValuationMode(mode: ValuationMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VALUATION_BASIS_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota or private-browsing errors.
  }
}

export function toMarketState(
  market: OnChainMarket,
  paused: boolean,
): MarketState {
  const settlement = settlementOf(market.status);
  const status: MarketState["status"] =
    settlement === "yes"
      ? "Yes"
      : settlement === "no"
        ? "No"
        : settlement === "void"
          ? "Void"
          : "Open";

  return {
    reserveYes: market.reserve_yes,
    reserveNo: market.reserve_no,
    feeBps: BigInt(market.fee_bps),
    status,
    closeTime: market.close_time,
    paused,
  };
}

export interface MarketValuationEntry {
  marketId: string;
  holding: Holding;
  marketState: MarketState;
  valuation: Valuation;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

export function useTreasuryValuation(positions: readonly BackendPosition[]) {
  const queryClient = useQueryClient();
  const configQuery = useMarketConfig();
  const ledgerNowQuery = useLedgerNow();
  const [mode, setModeState] = useState<ValuationMode>("exit");

  useEffect(() => {
    setModeState(loadValuationMode());
  }, []);

  const setMode = useCallback((next: ValuationMode) => {
    setModeState(next);
    saveValuationMode(next);
  }, []);

  const uniqueMarketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pos of positions) {
      const id = pos.market.onChainMarketId;
      if (id !== null && id !== undefined && /^\d+$/.test(id)) {
        ids.add(id);
      }
    }
    return [...ids].sort();
  }, [positions]);

  const paused = Boolean(configQuery.data?.paused);

  const chainReads = useQuery({
    queryKey: [
      "stellar",
      "treasuryValuation",
      CONTRACTS.treasury,
      uniqueMarketIds.join(","),
    ] as const,
    enabled: uniqueMarketIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await mapWithConcurrency(
        uniqueMarketIds,
        CONCURRENCY_LIMIT,
        async (id) => {
          try {
            const marketView = await queryClient.fetchQuery<OnChainMarketView>({
              queryKey: stellarKeys.market(id),
              queryFn: () => fetchOnChainMarket(id),
              staleTime: 30_000,
            });

            const posKey = stellarKeys.position(id, CONTRACTS.treasury);
            const cachedPos = queryClient.getQueryData<{ value?: OnChainPosition } | OnChainPosition>(posKey);
            let pos: OnChainPosition;
            if (cachedPos && "yes" in cachedPos && typeof cachedPos.yes === "bigint") {
              pos = cachedPos;
            } else if (
              cachedPos &&
              "value" in cachedPos &&
              cachedPos.value &&
              typeof cachedPos.value.yes === "bigint"
            ) {
              pos = cachedPos.value;
            } else {
              pos = simulated(
                await marketCore().get_position({
                  market_id: BigInt(id),
                  holder: CONTRACTS.treasury,
                }),
              );
            }

            return {
              marketId: id,
              market: marketView.market,
              holding: { yes: pos.yes, no: pos.no },
              updatedAtMs: Date.now(),
            };
          } catch {
            return null;
          }
        },
      );

      return entries.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null,
      );
    },
  });

  const nowSec = useMemo(() => {
    if (ledgerNowQuery.data !== undefined) return ledgerNowQuery.data;
    if (chainReads.dataUpdatedAt > 0) {
      return BigInt(Math.floor(chainReads.dataUpdatedAt / 1000));
    }
    return 0n;
  }, [ledgerNowQuery.data, chainReads.dataUpdatedAt]);

  const byMarketId = useMemo(() => {
    const map = new Map<string, MarketValuationEntry>();
    for (const item of chainReads.data ?? []) {
      const marketState = toMarketState(item.market, paused);
      const valuation = valueHolding(marketState, item.holding, nowSec);
      map.set(item.marketId, {
        marketId: item.marketId,
        holding: item.holding,
        marketState,
        valuation,
      });
    }
    return map;
  }, [chainReads.data, paused, nowSec]);

  const totals = useMemo(() => {
    let exitTotal = 0n;
    let midTotal = 0n;
    for (const entry of byMarketId.values()) {
      const { valuation } = entry;
      if (valuation.basis === "resolution") {
        const resVal = valuation.resolution ?? 0n;
        exitTotal += resVal;
        midTotal += resVal;
      } else if (valuation.basis === "liquidation") {
        exitTotal += valuation.liquidation.value;
        midTotal += valuation.mid;
      } else {
        // mid-only (closed awaiting resolution or paused): never value at a sell price
        midTotal += valuation.mid;
      }
    }
    return { exitTotal, midTotal };
  }, [byMarketId]);

  return {
    mode,
    setMode,
    byMarketId,
    exitTotalRaw: totals.exitTotal,
    midTotalRaw: totals.midTotal,
    activeTotalRaw: mode === "exit" ? totals.exitTotal : totals.midTotal,
    paused,
    isLoading:
      uniqueMarketIds.length > 0 &&
      (chainReads.isLoading || configQuery.isLoading),
  };
}
