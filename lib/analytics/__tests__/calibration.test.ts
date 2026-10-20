import { describe, expect, it } from "vitest";
import {
  brier,
  brierSkill,
  bootstrap,
  groupForecasts,
  logLoss,
  mulberry32,
  reliability,
  selectForecasts,
  type Forecast,
  type ScoredTrace,
} from "../calibration";

const f = (p: number, outcome: 0 | 1, marketId = "1", baselineP?: number): Forecast => ({
  p,
  outcome,
  group: "TRADER",
  marketId,
  baselineP,
});

describe("brier", () => {
  it("is 0 for perfect forecasts and 0.25 for a constant 0.5", () => {
    expect(brier([f(1, 1), f(0, 0), f(1, 1)])).toBe(0);
    expect(brier([f(0.5, 1), f(0.5, 0), f(0.5, 1), f(0.5, 0)])).toBeCloseTo(0.25, 12);
    expect(brier([])).toBeNaN();
  });
});

describe("logLoss", () => {
  it("clamps 0 and 1 without producing Infinity", () => {
    const loss = logLoss([f(0, 1), f(1, 0), f(0, 0), f(1, 1)]);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeCloseTo(-Math.log(1e-6) / 2, 4);
    expect(logLoss([])).toBeNaN();
  });
});

describe("reliability", () => {
  it("partitions [0,1] into equal bins and counts sum to n", () => {
    const fs = [f(0.05, 1), f(0.15, 0), f(0.55, 1), f(0.95, 1), f(1, 1)];
    const bins = reliability(fs, 10);
    expect(bins).toHaveLength(10);
    expect(bins[0].lo).toBe(0);
    expect(bins[bins.length - 1].hi).toBe(1);
    for (let i = 0; i < bins.length; i++) {
      expect(bins[i].lo).toBe(i / 10);
      expect(bins[i].hi).toBe((i + 1) / 10);
      if (i > 0) expect(bins[i].lo).toBe(bins[i - 1].hi);
    }
    expect(bins.reduce((sum, b) => sum + b.n, 0)).toBe(fs.length);
    expect(bins[0]).toMatchObject({ n: 1, meanP: 0.05, freq: 1 });
    expect(bins[1]).toMatchObject({ n: 1, meanP: 0.15, freq: 0 });
    expect(bins[2].n).toBe(0);
  });
});

describe("brierSkill", () => {
  it("is positive when forecasts beat the baseline", () => {
    const fs = [f(0.9, 1, "1", 0.5), f(0.8, 1, "2", 0.5), f(0.2, 0, "3", 0.5)];
    const skill = brierSkill(fs);
    expect(skill).not.toBeNull();
    expect(skill as number).toBeGreaterThan(0);
  });

  it("is null without baselines, for an empty sample, or when the baseline is perfect", () => {
    expect(brierSkill([f(0.5, 1)])).toBeNull();
    expect(brierSkill([])).toBeNull();
    expect(brierSkill([f(0.6, 1, "1", 1)])).toBeNull();
  });
});

describe("bootstrap", () => {
  const fs = Array.from({ length: 40 }, (_, i) => f(((i % 7) / 10) + 0.05, (i % 2) as 0 | 1, String((i % 5) + 1)));

  it("is deterministic for a fixed seed", () => {
    const a = bootstrap(fs, brier, { iterations: 500, seed: 42 });
    const b = bootstrap(fs, brier, { iterations: 500, seed: 42 });
    expect(a).toEqual(b);
    expect(a.lo).toBeLessThanOrEqual(a.hi);
    expect(a.lo).toBeGreaterThanOrEqual(0);
  });

  it("resamples individual forecasts by default", () => {
    const sizes: number[] = [];
    bootstrap(fs, (s) => { sizes.push(s.length); return s.length; }, { iterations: 200, seed: 3 });
    expect(sizes).toHaveLength(200);
    expect(sizes.every((n) => n === fs.length)).toBe(true);
  });

  it("resamples whole markets (not traces) with clusterBy", () => {
    const big: Forecast[] = Array.from({ length: 50 }, (_, i) => f(0.6 + (i % 3) * 0.05, (i % 2) as 0 | 1, "A"));
    const small: Forecast[] = [f(0.2, 0, "B")];
    const clustered = [...big, ...small];

    const sizes: number[] = [];
    bootstrap(clustered, (s) => { sizes.push(s.length); return s.length; }, { iterations: 300, seed: 3, clusterBy: "marketId" });
    expect(sizes).toHaveLength(300);
    expect(sizes.every((n) => n === 2 || n === 51 || n === 100)).toBe(true);
    expect(new Set(sizes).size).toBeGreaterThan(1);

    const ci = bootstrap(clustered, brier, { iterations: 300, seed: 3, clusterBy: "marketId" });
    expect(ci.lo).toBeLessThanOrEqual(ci.hi);
    expect(bootstrap(clustered, brier, { iterations: 300, seed: 3, clusterBy: "marketId" })).toEqual(ci);
  });
});

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    const seqC = Array.from({ length: 10 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("selectForecasts", () => {
  const traces: ScoredTrace[] = [
    { p: 0.4, agentType: "TRADER", marketId: "1", createdAt: 100 },
    { p: 0.6, agentType: "TRADER", marketId: "1", createdAt: 200 },
    { p: 0.7, agentType: "TRADER", marketId: "1", createdAt: 500 },
    { p: 0.5, agentType: "MARKET_MAKER", marketId: "1", createdAt: 150 },
    { p: 0.3, agentType: "TRADER", marketId: "2", createdAt: 300 },
  ];
  const closeTimes = new Map<string, number>([["1", 400]]);

  it("keeps the last pre-close trace per market and agent type and drops post-close traces", () => {
    const out = selectForecasts(traces, closeTimes, "lastPreClose");
    expect(out).toHaveLength(3);
    expect(out.find((t) => t.marketId === "1" && t.agentType === "TRADER")?.p).toBe(0.6);
    expect(out.find((t) => t.marketId === "1" && t.agentType === "MARKET_MAKER")?.createdAt).toBe(150);
    expect(out.find((t) => t.marketId === "2")?.createdAt).toBe(300);
  });

  it("keeps all pre-close traces under the all policy", () => {
    const out = selectForecasts(traces, closeTimes, "all");
    expect(out).toHaveLength(4);
    expect(out.some((t) => t.createdAt === 500)).toBe(false);
  });

  it("ignores unknown close times gracefully and keeps the last trace", () => {
    const out = selectForecasts(traces, new Map(), "lastPreClose");
    expect(out).toHaveLength(3);
    expect(out.find((t) => t.marketId === "1" && t.agentType === "TRADER")?.createdAt).toBe(500);
  });
});

describe("groupForecasts", () => {
  it("scores every group with sample sizes and CIs", () => {
    const fs: Forecast[] = [
      f(0.9, 1, "1", 0.5),
      f(0.2, 0, "2", 0.5),
      { ...f(0.6, 1, "1"), group: "MARKET_MAKER" },
    ];
    const stats = groupForecasts(fs, { seed: 42, iterations: 200 });
    expect(Object.keys(stats).sort()).toEqual(["MARKET_MAKER", "TRADER"]);
    expect(stats.TRADER.n).toBe(2);
    expect(stats.TRADER.brier).toBeCloseTo((0.01 + 0.04) / 2, 12);
    expect(stats.TRADER.brierCi.lo).toBeLessThanOrEqual(stats.TRADER.brierCi.hi);
    expect(stats.TRADER.logLossCi.lo).toBeLessThanOrEqual(stats.TRADER.logLossCi.hi);
    expect(stats.TRADER.skill).not.toBeNull();
    expect(stats.TRADER.reliability.reduce((sum, b) => sum + b.n, 0)).toBe(2);
    expect(stats.MARKET_MAKER.skill).toBeNull();
    expect(groupForecasts([], { seed: 42 })).toEqual({});
  });
});
