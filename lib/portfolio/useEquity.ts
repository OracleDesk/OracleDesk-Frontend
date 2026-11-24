"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/contexts/WalletContext";
import { downsample } from "./downsample";
import { kpis, type EquityPoint, type LedgerEntry, type Resolution } from "./equity";
import { computeExactEquity } from "./compute-exact-equity";
import { loadWalletLedger } from "./wallet-ledger";

export type { Resolution } from "./equity";
export interface EquityCoverage { fromLedger: number; truncated: boolean }
export type EquityStatus = "pending" | "ok" | "empty" | "error";

interface ExactEquityData {
  entries: LedgerEntry[];
  series: EquityPoint[];
  resolved: Map<string, Resolution>;
  coverage: EquityCoverage;
  approximateMarkets: string[];
  fetchedAt: number;
}

const CHART_POINTS = 400;

export function useEquity(rangeS: number) {
  const { address } = useWallet();
  const query = useQuery<ExactEquityData>({
    queryKey: ["stellar", "equity", "exact-v2", address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: async () => {
      const wallet = await loadWalletLedger(address as string);
      const marketIds = [...new Set(wallet.entries.map((entry) => entry.marketId))];
      const streams = Object.fromEntries(
        Object.entries(wallet.streams).map(([id, history]) => [id, history.points]),
      );
      const coverage = Object.fromEntries(marketIds.map((id) => {
        const history = wallet.streams[id];
        return [id, {
          fromLedger: history?.coverage.fromLedger ?? wallet.coverage.fromLedger,
          complete: history?.coverage.complete ?? false,
          reason: history?.coverage.reason ?? "partial",
        }];
      }));
      const series = await computeExactEquity(wallet.entries, {
        streams,
        feeBps: wallet.feeBps,
        finals: wallet.finals,
        closeTimes: wallet.closeTimes,
        coverage,
        basis: "mid",
        reconcileFinals: true,
      });
      return {
        entries: wallet.entries,
        series,
        resolved: new Map(Object.entries(wallet.finals)),
        coverage: { fromLedger: wallet.coverage.fromLedger, truncated: wallet.coverage.truncated },
        approximateMarkets: wallet.approximate,
        fetchedAt: wallet.fetchedAt,
      };
    },
  });

  return useMemo(() => {
    const data = query.data;
    const empty = kpis([], { time: 0, cashFlow: 0n, markValue: 0n, equity: 0n, partial: false }, new Map<string, Resolution>());
    const base = {
      entries: [] as LedgerEntry[],
      series: [] as EquityPoint[],
      kpis: empty,
      coverage: data?.coverage ?? { fromLedger: 0, truncated: false },
      approximateMarkets: data?.approximateMarkets ?? [] as string[],
      resolved: data?.resolved ?? new Map<string, Resolution>(),
      status: (query.isError ? "error" : query.isPending ? "pending" : "empty") as EquityStatus,
      isFetching: query.isFetching,
    };
    if (!data || data.series.length === 0) return base;

    const full = data.series;
    const last = full[full.length - 1];
    const firstTime = full[0].time;
    const now = Math.max(data.fetchedAt, last.time);
    const from = Number.isFinite(rangeS) ? Math.max(firstTime, now - rangeS * 1000) : firstTime;
    const visible = full.filter((point) => point.time >= from);
    return {
      ...base,
      status: "ok" as const,
      series: downsample(visible, { target: CHART_POINTS }),
      kpis: kpis(data.entries, last, data.resolved),
      entries: [...data.entries].reverse(),
      resolved: data.resolved,
    };
  }, [query.data, query.isPending, query.isError, query.isFetching, rangeS]);
}
