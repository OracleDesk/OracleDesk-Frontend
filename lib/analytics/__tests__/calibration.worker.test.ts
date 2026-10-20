import { describe, expect, it } from "vitest";
import { handleMessage, type CalibrationRequest } from "../calibration.worker";

const forecasts: CalibrationRequest["forecasts"] = [
  { p: 0.7, outcome: 1, group: "TRADER", marketId: "1" },
  { p: 0.3, outcome: 0, group: "TRADER", marketId: "2" },
  { p: 0.6, outcome: 1, group: "MARKET_MAKER", marketId: "1", baselineP: 0.5 },
];

describe("handleMessage", () => {
  it("echoes the request id and returns per-group stats", () => {
    const reply = handleMessage({ id: 7, forecasts, seed: 42 });
    expect(reply.id).toBe(7);
    expect(Object.keys(reply.perGroup).sort()).toEqual(["MARKET_MAKER", "TRADER"]);

    const trader = reply.perGroup.TRADER;
    expect(trader.n).toBe(2);
    expect(trader.brier).toBeCloseTo((0.09 + 0.09) / 2, 12);
    expect(Number.isFinite(trader.logLoss)).toBe(true);
    expect(trader.brierCi.lo).toBeLessThanOrEqual(trader.brierCi.hi);
    expect(trader.logLossCi.lo).toBeLessThanOrEqual(trader.logLossCi.hi);
    expect(trader.reliability.reduce((sum, b) => sum + b.n, 0)).toBe(2);
    expect(trader.skill).toBeNull();

    const maker = reply.perGroup.MARKET_MAKER;
    expect(maker.n).toBe(1);
    expect(maker.skill).not.toBeNull();
    expect(maker.skill as number).toBeCloseTo(1 - 0.16 / 0.25, 12);
  });

  it("runs the clustered path for the all policy and stays deterministic", () => {
    const request: CalibrationRequest = { id: 1, forecasts, policy: "all", seed: 42 };
    const a = handleMessage(request);
    const b = handleMessage(request);
    expect(a.id).toBe(1);
    expect(a).toEqual(b);
    expect(a.perGroup.TRADER.brierCi.lo).toBeLessThanOrEqual(a.perGroup.TRADER.brierCi.hi);
  });

  it("handles an empty forecast list", () => {
    const reply = handleMessage({ id: 3, forecasts: [], seed: 1 });
    expect(reply.id).toBe(3);
    expect(reply.perGroup).toEqual({});
  });
});
