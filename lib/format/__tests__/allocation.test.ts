import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { amountForBps, bpsForAmount, MAX_BPS, slippageBpsFromInput, snapBps } from "../allocation";
import { shareOf } from "../../stellar/units";

describe("amountForBps", () => {
  it("matches shareOf", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), fc.integer({ min: 0, max: MAX_BPS }), (balance, bps) => {
        expect(amountForBps(balance, bps)).toBe(shareOf(balance, bps));
      }),
    );
  });

  it("clamps out-of-range bps", () => {
    expect(amountForBps(1000n, -5)).toBe(0n);
    expect(amountForBps(1000n, 20_000)).toBe(1000n);
    expect(amountForBps(1000n, Number.NaN)).toBe(0n);
  });
});

describe("bpsForAmount", () => {
  it("is the floor inverse of amountForBps", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 24n }), fc.bigInt({ min: 0n, max: 2n * 10n ** 24n }), (balance, amount) => {
        const bps = bpsForAmount(balance, amount);
        expect(bps).toBeGreaterThanOrEqual(0);
        expect(bps).toBeLessThanOrEqual(MAX_BPS);
        expect(amountForBps(balance, bps)).toBeLessThanOrEqual(amount);
      }),
    );
  });

  it("returns 0 for a zero balance", () => {
    expect(bpsForAmount(0n, 500n)).toBe(0);
  });

  it("clamps to 100% above the balance and handles values beyond 2^53", () => {
    expect(bpsForAmount(1000n, 5000n)).toBe(MAX_BPS);
    const big = 10n ** 30n;
    expect(bpsForAmount(big, big / 2n)).toBe(5000);
  });
});

describe("snapBps", () => {
  it("rounds to the step and stays an integer in range", () => {
    expect(snapBps(1234, 100)).toBe(1200);
    expect(snapBps(1250, 100)).toBe(1300);
    expect(snapBps(99_999, 10)).toBe(MAX_BPS);
    expect(snapBps(-40, 10)).toBe(0);
    expect(snapBps(Number.NaN, 10)).toBe(0);
  });
});

describe("slippageBpsFromInput", () => {
  it("accepts percent strings as integer bps", () => {
    expect(slippageBpsFromInput("0.5")).toEqual({ ok: true, bps: 50 });
    expect(slippageBpsFromInput("1")).toEqual({ ok: true, bps: 100 });
    expect(slippageBpsFromInput("0.25")).toEqual({ ok: true, bps: 25 });
    expect(slippageBpsFromInput(".5")).toEqual({ ok: true, bps: 50 });
    expect(slippageBpsFromInput("2,5")).toEqual({ ok: true, bps: 250 });
    expect(slippageBpsFromInput(" 3% ")).toEqual({ ok: true, bps: 300 });
    expect(slippageBpsFromInput("50")).toEqual({ ok: true, bps: 5000 });
    expect(slippageBpsFromInput("0.01")).toEqual({ ok: true, bps: 1 });
  });

  it("rejects exponents, signs, extra decimals and out-of-range values", () => {
    expect(slippageBpsFromInput("1e2")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("-1")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("+1")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("50.001")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput(".")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("abc")).toEqual({ ok: false, reason: "format" });
    expect(slippageBpsFromInput("0")).toEqual({ ok: false, reason: "too-low" });
    expect(slippageBpsFromInput("0.00")).toEqual({ ok: false, reason: "too-low" });
    expect(slippageBpsFromInput("50.01")).toEqual({ ok: false, reason: "too-high" });
    expect(slippageBpsFromInput("99999999")).toEqual({ ok: false, reason: "too-high" });
  });
});
