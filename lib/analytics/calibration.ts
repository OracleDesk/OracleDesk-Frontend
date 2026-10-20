export interface Forecast {
  p: number;
  outcome: 0 | 1;
  group: string;
  marketId: string;
  baselineP?: number;
}

/** Mean squared error of the probability forecasts. NaN for an empty sample. */
export function brier(fs: Forecast[]): number {
  if (fs.length === 0) return NaN;
  let sum = 0;
  for (const f of fs) sum += (f.p - f.outcome) ** 2;
  return sum / fs.length;
}

/** Mean -(o log p + (1-o) log(1-p)) with p clamped to [eps, 1-eps]. NaN for an empty sample. */
export function logLoss(fs: Forecast[], eps = 1e-6): number {
  if (fs.length === 0) return NaN;
  let sum = 0;
  for (const f of fs) {
    const p = Math.min(1 - eps, Math.max(eps, f.p));
    sum += -(f.outcome * Math.log(p) + (1 - f.outcome) * Math.log(1 - p));
  }
  return sum / fs.length;
}

/**
 * 1 - brier/baseline brier: how much better than the baseline (backend opening
 * price) the forecasts are. Null when any forecast lacks a baseline or the
 * baseline brier is 0.
 */
export function brierSkill(fs: Forecast[]): number | null {
  if (fs.length === 0) return null;
  if (fs.some((f) => f.baselineP === undefined || !Number.isFinite(f.baselineP))) return null;
  const baseline = brier(fs.map((f) => ({ ...f, p: f.baselineP as number })));
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return 1 - brier(fs) / baseline;
}

export interface ReliabilityBin {
  lo: number;
  hi: number;
  n: number;
  meanP: number;
  freq: number;
}

/**
 * Partitions [0,1] into `bins` equal-width bins (the last bin includes 1.0).
 * Every bin is reported; empty bins carry n = 0 with meanP/freq = 0.
 */
export function reliability(fs: Forecast[], bins = 10): ReliabilityBin[] {
  const buckets = Array.from({ length: bins }, () => ({ n: 0, pSum: 0, oSum: 0 }));
  for (const f of fs) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(f.p * bins)));
    const bucket = buckets[idx];
    bucket.n += 1;
    bucket.pSum += f.p;
    bucket.oSum += f.outcome;
  }
  return buckets.map((bucket, i) => ({
    lo: i / bins,
    hi: (i + 1) / bins,
    n: bucket.n,
    meanP: bucket.n > 0 ? bucket.pSum / bucket.n : 0,
    freq: bucket.n > 0 ? bucket.oSum / bucket.n : 0,
  }));
}

/** Deterministic PRNG (mulberry32); same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const frac = pos - lo;
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

/**
 * 95% percentile bootstrap CI of `stat`. With `clusterBy: "marketId"` whole
 * markets are resampled (a market drawn k times contributes k copies), which
 * is the right unit when one market contributes many correlated traces.
 * Deterministic for a fixed seed.
 */
export function bootstrap(
  fs: Forecast[],
  stat: (s: Forecast[]) => number,
  opts: { iterations: number; seed: number; clusterBy?: "marketId" },
): { lo: number; hi: number } {
  const iterations = Math.max(0, Math.floor(opts.iterations));
  if (fs.length === 0 || iterations === 0) return { lo: 0, hi: 0 };
  const rand = mulberry32(opts.seed);
  const draws: number[] = [];

  if (opts.clusterBy === "marketId") {
    const byMarket = new Map<string, Forecast[]>();
    for (const f of fs) {
      const list = byMarket.get(f.marketId);
      if (list) list.push(f);
      else byMarket.set(f.marketId, [f]);
    }
    const clusters = [...byMarket.values()];
    const k = clusters.length;
    for (let it = 0; it < iterations; it++) {
      const sample: Forecast[] = [];
      for (let j = 0; j < k; j++) {
        const cluster = clusters[Math.floor(rand() * k)];
        for (const f of cluster) sample.push(f);
      }
      const value = stat(sample);
      if (Number.isFinite(value)) draws.push(value);
    }
  } else {
    const len = fs.length;
    for (let it = 0; it < iterations; it++) {
      const sample: Forecast[] = new Array(len);
      for (let j = 0; j < len; j++) sample[j] = fs[Math.floor(rand() * len)];
      const value = stat(sample);
      if (Number.isFinite(value)) draws.push(value);
    }
  }

  if (draws.length === 0) return { lo: 0, hi: 0 };
  draws.sort((a, b) => a - b);
  return { lo: percentile(draws, 0.025), hi: percentile(draws, 0.975) };
}

export type ForecastPolicy = "lastPreClose" | "all";

export interface ScoredTrace {
  p: number;
  agentType: string;
  marketId: string;
  createdAt: number;
  baselineP?: number;
}

/**
 * Explicit forecast selection. "lastPreClose" keeps, per (market, agentType),
 * the newest trace published before the market's close_time (post-close
 * traces prove nothing); when close_time is unknown the newest trace is kept.
 * "all" keeps every pre-close trace.
 */
export function selectForecasts(
  traces: ScoredTrace[],
  closeTimes: Map<string, number>,
  policy: ForecastPolicy,
): ScoredTrace[] {
  const eligible = traces.filter((t) => {
    const close = closeTimes.get(t.marketId);
    return close === undefined || t.createdAt < close;
  });
  if (policy === "all") return eligible;
  const newest = new Map<string, ScoredTrace>();
  for (const t of eligible) {
    const key = `${t.marketId}::${t.agentType}`;
    const current = newest.get(key);
    if (!current || t.createdAt > current.createdAt) newest.set(key, t);
  }
  return [...newest.values()];
}

export interface GroupStats {
  n: number;
  brier: number;
  brierCi: { lo: number; hi: number };
  logLoss: number;
  logLossCi: { lo: number; hi: number };
  skill: number | null;
  reliability: ReturnType<typeof reliability>;
}

/** Groups by Forecast.group and scores each group with bootstrap CIs. */
export function groupForecasts(
  fs: Forecast[],
  opts: { seed: number; iterations?: number; cluster?: boolean },
): Record<string, GroupStats> {
  const iterations = opts.iterations ?? 2000;
  const clusterBy = opts.cluster ? ("marketId" as const) : undefined;
  const groups = new Map<string, Forecast[]>();
  for (const f of fs) {
    const list = groups.get(f.group);
    if (list) list.push(f);
    else groups.set(f.group, [f]);
  }
  const out: Record<string, GroupStats> = {};
  for (const [group, items] of groups) {
    out[group] = {
      n: items.length,
      brier: brier(items),
      brierCi: bootstrap(items, brier, { iterations, seed: opts.seed, clusterBy }),
      logLoss: logLoss(items),
      logLossCi: bootstrap(items, logLoss, { iterations, seed: opts.seed, clusterBy }),
      skill: brierSkill(items),
      reliability: reliability(items),
    };
  }
  return out;
}
