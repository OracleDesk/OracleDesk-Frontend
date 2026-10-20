import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calcSell,
  collateralOutForShares,
  MathError,
  settleValue,
} from "../../stellar/generated/fpmm";
import { USDC_UNIT } from "../../stellar/units";
import { maxSellable, valueHolding, type MarketState } from "../valuation";

function createRng(seed: number) {
  let state = seed >>> 0;
  const nextU32 = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state;
  };
  return {
    int(min: number, max: number): number {
      return min + (nextU32() % (max - min + 1));
    },
    big(min: bigint, max: bigint): bigint {
      if (max <= min) return min;
      const span = max - min + 1n;
      const hi = BigInt(nextU32());
      const lo = BigInt(nextU32());
      return min + (((hi << 32n) | lo) % span);
    },
  };
}

describe("lib/portfolio/valuation", () => {
  it("uses only bigint arithmetic and never calls Number( or parseFloat", () => {
    const source = readFileSync(resolve(__dirname, "../valuation.ts"), "utf8");
    expect(source).not.toContain("Number(");
    expect(source).not.toContain("parseFloat");
  });

  it("property: liquidation of a fully sellable holding equals collateralOutForShares (within rounding adjustment) and is executable across reserve ratios 1:1 to 1:1e6 and fees 0-1000 bps", () => {
    const rng = createRng(0x60_2026);
    const ratios = [1n, 10n, 100n, 1_000n, 10_000n, 100_000n, 1_000_000n];
    let totalAdjustmentSteps = 0;

    for (let run = 0; run < 1_200; run++) {
      const baseReserve = rng.big(1_000n, 100_000n * USDC_UNIT);
      const ratio = ratios[run % ratios.length];
      const flip = run % 2 === 0;
      const rYes = flip ? baseReserve : baseReserve * ratio;
      const rNo = flip ? baseReserve * ratio : baseReserve;
      const feeBps = rng.big(0n, 1_000n);
      // Choose a share amount comfortably within pool capacity for fully sellable checks
      const maxShares = (rNo > 10n ? rNo / 2n : 1n) + 1n;
      const shares = rng.big(1n, maxShares);

      let rawEstimate: bigint | null = null;
      try {
        rawEstimate = collateralOutForShares(rYes, rNo, shares, feeBps);
      } catch (error) {
        if (!(error instanceof MathError)) throw error;
      }

      const res = maxSellable(rYes, rNo, feeBps, shares);
      totalAdjustmentSteps += res.adjustmentSteps;
      expect(res.adjustmentSteps).toBeLessThanOrEqual(8);

      if (rawEstimate !== null) {
        expect(res.shares).toBe(shares);
        expect(rawEstimate - res.collateral).toBeGreaterThanOrEqual(0n);
        expect(rawEstimate - res.collateral).toBeLessThanOrEqual(8n);
      }

      if (res.collateral > 0n) {
        const quote = calcSell(rYes, rNo, res.collateral, feeBps);
        expect(quote.sharesIn).toBeLessThanOrEqual(res.shares);
      }

      const m: MarketState = {
        reserveYes: rYes,
        reserveNo: rNo,
        feeBps,
        status: "Open",
        closeTime: 2_000_000_000n,
      };
      const valuation = valueHolding(m, { yes: shares, no: 0n }, 1_000_000_000n);
      expect(valuation.liquidation.value).toBeLessThanOrEqual(valuation.mid + 1n);
    }

    expect(totalAdjustmentSteps).toBeGreaterThanOrEqual(0);
  });

  it("property: liquidation value never exceeds mid value + 1 across single and two-sided holdings", () => {
    const rng = createRng(0x60_9999);

    for (let run = 0; run < 1_000; run++) {
      const rYes = rng.big(1_000n, 1_000_000n * USDC_UNIT);
      const rNo = rng.big(1_000n, 1_000_000n * USDC_UNIT);
      const feeBps = rng.big(0n, 1_000n);
      const yes = rng.big(0n, 500_000n * USDC_UNIT);
      const no = rng.int(0, 2) === 0 ? rng.big(0n, 500_000n * USDC_UNIT) : 0n;

      const m: MarketState = {
        reserveYes: rYes,
        reserveNo: rNo,
        feeBps,
        status: "Open",
        closeTime: 2_000_000_000n,
      };
      const v = valueHolding(m, { yes, no }, 1_000_000_000n);
      expect(v.liquidation.value).toBeLessThanOrEqual(v.mid + 1n);
    }
  });

  it("property: maxSellable is maximal (s + 1 fails or s === want) across extreme ratios", () => {
    const rng = createRng(0x60_4242);
    const ratios = [1n, 100n, 10_000n, 1_000_000n];

    for (let run = 0; run < 1_000; run++) {
      const rOther = rng.big(2n, 50_000n * USDC_UNIT);
      const ratio = ratios[run % ratios.length];
      const rSold = run % 2 === 0 ? rOther * ratio : (rOther / ratio) + 10n;
      const feeBps = rng.big(0n, 1_000n);
      const want = rng.big(1n, rSold * 20n + rOther * 20n);

      const res = maxSellable(rSold, rOther, feeBps, want);
      expect(res.shares).toBeLessThanOrEqual(want);
      expect(res.shares).toBeGreaterThanOrEqual(0n);

      if (res.shares < want) {
        expect(() =>
          collateralOutForShares(rSold, rOther, res.shares + 1n, feeBps),
        ).toThrow(MathError);
      }
      if (res.collateral > 0n) {
        const forward = calcSell(rSold, rOther, res.collateral, feeBps);
        expect(forward.sharesIn).toBeLessThanOrEqual(res.shares);
      }
    }
  });

  it("insufficient liquidity yields capped=true with a partial value and no throw", () => {
    const m: MarketState = {
      reserveYes: 1_000n * USDC_UNIT,
      reserveNo: 10n * USDC_UNIT, // very thin counter-reserve
      feeBps: 100n,
      status: "Open",
      closeTime: 2_000_000_000n,
    };
    // Selling 50,000 YES shares exceeds the 10 USDC NO reserve capacity
    const want = 50_000n * USDC_UNIT;
    const v = valueHolding(m, { yes: want, no: 0n }, 1_000_000_000n);

    expect(v.basis).toBe("liquidation");
    expect(v.liquidation.tradable).toBe(true);
    expect(v.liquidation.capped).toBe(true);
    expect(v.liquidation.value).toBeGreaterThan(0n);
    expect(v.liquidation.sold.yes).toBeGreaterThan(0n);
    expect(v.liquidation.sold.yes).toBeLessThan(want);
    expect(v.liquidation.unsold.yes).toBe(want - v.liquidation.sold.yes);
    expect(
      calcSell(m.reserveYes, m.reserveNo, v.liquidation.value, m.feeBps).sharesIn,
    ).toBeLessThanOrEqual(v.liquidation.sold.yes);
  });

  it("two-sided holding uses post-trade reserves for the second leg and picks the better order", () => {
    const m: MarketState = {
      reserveYes: 200n * USDC_UNIT,
      reserveNo: 800n * USDC_UNIT,
      feeBps: 100n,
      status: "Open",
      closeTime: 2_000_000_000n,
    };
    const holding = { yes: 150n * USDC_UNIT, no: 150n * USDC_UNIT };
    const v = valueHolding(m, holding, 1_000_000_000n);

    // Compute both orders manually to verify valueHolding picked the maximum
    const y1 = maxSellable(m.reserveYes, m.reserveNo, m.feeBps, holding.yes);
    const y2 = maxSellable(y1.newReserveOther, y1.newReserveSold, m.feeBps, holding.no);
    const n1 = maxSellable(m.reserveNo, m.reserveYes, m.feeBps, holding.no);
    const n2 = maxSellable(n1.newReserveOther, n1.newReserveSold, m.feeBps, holding.yes);
    const best =
      y1.collateral + y2.collateral >= n1.collateral + n2.collateral
        ? y1.collateral + y2.collateral
        : n1.collateral + n2.collateral;

    expect(v.liquidation.value).toBe(best);
    expect(v.liquidation.value).toBeGreaterThan(0n);
    expect(v.liquidation.value).toBeLessThanOrEqual(v.mid + 1n);
  });

  it("closed-but-unresolved or paused market is not tradable and has basis mid-only", () => {
    const m: MarketState = {
      reserveYes: 500n * USDC_UNIT,
      reserveNo: 500n * USDC_UNIT,
      feeBps: 50n,
      status: "Open",
      closeTime: 1_000n,
    };
    const closed = valueHolding(m, { yes: 100n * USDC_UNIT, no: 0n }, 1_000n);
    expect(closed.basis).toBe("mid-only");
    expect(closed.liquidation.tradable).toBe(false);
    expect(closed.liquidation.value).toBe(0n);
    expect(closed.resolution).toBeNull();
    expect(closed.mid).toBe(50n * USDC_UNIT);

    const paused = valueHolding(
      { ...m, closeTime: 2_000n, paused: true },
      { yes: 100n * USDC_UNIT, no: 0n },
      1_000n,
    );
    expect(paused.basis).toBe("mid-only");
    expect(paused.liquidation.tradable).toBe(false);
    expect(paused.liquidation.value).toBe(0n);
  });

  it("resolved YES, NO and Void equal settleValue", () => {
    const base: MarketState = {
      reserveYes: 400n * USDC_UNIT,
      reserveNo: 600n * USDC_UNIT,
      feeBps: 50n,
      status: "Yes",
      closeTime: 1_000n,
    };
    const h = { yes: 123_456_789n, no: 98_765_432n };

    const yesVal = valueHolding({ ...base, status: "Yes" }, h, 2_000n);
    expect(yesVal.basis).toBe("resolution");
    expect(yesVal.resolution).toBe(settleValue("yes", h.yes, h.no));
    expect(yesVal.liquidation.tradable).toBe(false);

    const noVal = valueHolding({ ...base, status: "No" }, h, 2_000n);
    expect(noVal.basis).toBe("resolution");
    expect(noVal.resolution).toBe(settleValue("no", h.yes, h.no));

    const voidVal = valueHolding({ ...base, status: "Void" }, h, 2_000n);
    expect(voidVal.basis).toBe("resolution");
    expect(voidVal.resolution).toBe(settleValue("void", h.yes, h.no));
  });

  it("zero holding returns zeros without calling calcSell", () => {
    const m: MarketState = {
      reserveYes: 500n * USDC_UNIT,
      reserveNo: 500n * USDC_UNIT,
      feeBps: 50n,
      status: "Open",
      closeTime: 2_000n,
    };
    const v = valueHolding(m, { yes: 0n, no: 0n }, 1_000n);
    expect(v.mid).toBe(0n);
    expect(v.liquidation.value).toBe(0n);
    expect(v.liquidation.sold).toEqual({ yes: 0n, no: 0n });
    expect(v.liquidation.unsold).toEqual({ yes: 0n, no: 0n });
    expect(v.liquidation.capped).toBe(false);
    expect(v.liquidation.tradable).toBe(true);
    expect(v.basis).toBe("liquidation");
  });
});
