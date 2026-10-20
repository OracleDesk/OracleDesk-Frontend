"use client";

import { useEffect, useState, type RefObject } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { listMarkets } from "@/lib/api/markets";
import { listTraces, type ReasoningTrace } from "@/lib/api/traces";
import { fetchOnChainMarket, stellarKeys } from "@/lib/hooks/useStellar";
import { selectForecasts, type Forecast, type ScoredTrace } from "./calibration";

export type Policy = "lastPreClose" | "all";

export interface CalibrationCounts {
  voided: number;
  open: number;
  notOnChain: number;
  rejected: number;
}

export interface CalibrationResult {
  forecasts: Forecast[];
  counts: CalibrationCounts;
  nMarkets: number;
}

export interface CalibrationData extends CalibrationResult {
  isLoading: boolean;
  error: Error | null;
}

const EMPTY_FORECASTS: Forecast[] = [];
const EMPTY_COUNTS: CalibrationCounts = { voided: 0, open: 0, notOnChain: 0, rejected: 0 };
const MAX_PAGES = 30;
const MARKET_READ_CONCURRENCY = 4;

interface PageMeta {
  totalPages?: unknown;
}

function readTotalPages(meta: unknown): number {
  const total = (meta as PageMeta | undefined)?.totalPages;
  return typeof total === "number" && Number.isFinite(total) && total >= 1 ? Math.floor(total) : 1;
}

/** Pages every trace (limit 100, following meta.totalPages with a 30-page cap). */
async function fetchAllTraces(): Promise<ReasoningTrace[]> {
  const traces: ReasoningTrace[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await listTraces({ page, limit: 100 });
    traces.push(...res.traces);
    if (page >= readTotalPages(res.meta)) break;
  }
  return traces;
}

/** Runs `run` over `items` with at most `limit` in flight. */
async function eachWithLimit(items: string[], limit: number, run: (id: string) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const id = items[next];
      next += 1;
      await run(id);
    }
  });
  await Promise.all(lanes);
}

/** Backend `initialYesProb` per on-chain id, the labelled "backend opening price". Optional. */
async function fetchBaselines(): Promise<Map<string, number>> {
  const baselines = new Map<string, number>();
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { markets, meta } = await listMarkets({ onChain: true, page, limit: 100 });
      for (const market of markets) {
        if (market.onChainMarketId && Number.isFinite(market.initialYesProb) && market.initialYesProb >= 0 && market.initialYesProb <= 1) {
          baselines.set(market.onChainMarketId, market.initialYesProb);
        }
      }
      if (page >= readTotalPages(meta)) break;
    }
  } catch {
    /* the baseline is optional; skill degrades to null */
  }
  return baselines;
}

async function loadCalibration(policy: Policy, queryClient: QueryClient): Promise<CalibrationResult> {
  const counts: CalibrationCounts = { voided: 0, open: 0, notOnChain: 0, rejected: 0 };
  const traces = await fetchAllTraces();

  const scored: ScoredTrace[] = [];
  const marketIds = new Set<string>();
  for (const trace of traces) {
    const marketId = trace.market.onChainMarketId;
    if (!marketId) {
      counts.notOnChain += 1;
      continue;
    }
    const p = trace.probabilityEstimate;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
      counts.rejected += 1;
      continue;
    }
    marketIds.add(marketId);
    scored.push({ p, agentType: trace.agentType, marketId, createdAt: Date.parse(trace.createdAt) });
  }

  // Outcomes and close times come only from the chain; each distinct market is read once.
  const closeTimes = new Map<string, number>();
  const outcomes = new Map<string, 0 | 1>();
  const readMarkets = eachWithLimit([...marketIds], MARKET_READ_CONCURRENCY, async (id) => {
    try {
      const view = await queryClient.ensureQueryData({
        queryKey: stellarKeys.market(id),
        queryFn: () => fetchOnChainMarket(id),
      });
      closeTimes.set(id, Number(view.market.close_time));
      const status = view.market.status;
      if (status.tag === "Resolved") outcomes.set(id, status.values[0].tag === "Yes" ? 1 : 0);
      else if (status.tag === "Void") counts.voided += 1;
      else counts.open += 1;
    } catch {
      /* an unreadable market cannot be scored; exclude it */
    }
  });
  const [, baselines] = await Promise.all([readMarkets, fetchBaselines()]);

  const resolved = scored.filter((t) => outcomes.has(t.marketId));
  const selected = selectForecasts(resolved, closeTimes, policy);
  const forecasts: Forecast[] = selected.map((t) => ({
    p: t.p,
    outcome: outcomes.get(t.marketId) as 0 | 1,
    group: t.agentType,
    marketId: t.marketId,
    baselineP: baselines.get(t.marketId),
  }));

  return {
    forecasts,
    counts,
    nMarkets: new Set(forecasts.map((f) => f.marketId)).size,
  };
}

/**
 * All traces paged from the backend, each distinct on-chain market read once
 * (de-duplicated, 4 at a time, cached under stellarKeys.market), scored with
 * on-chain outcomes only. Outcomes come from get_market().status: Resolved Yes
 * → 1, Resolved No → 0; Void and Open are excluded and counted.
 */
export function useCalibrationData(policy: Policy): CalibrationData {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["stellar", "calibration", policy],
    queryFn: () => loadCalibration(policy, queryClient),
    staleTime: 10 * 60_000,
    enabled: true,
  });
  return {
    forecasts: query.data?.forecasts ?? EMPTY_FORECASTS,
    counts: query.data?.counts ?? EMPTY_COUNTS,
    nMarkets: query.data?.nMarkets ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** True once the ref's element is within 200px of the viewport (checked once). */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}
