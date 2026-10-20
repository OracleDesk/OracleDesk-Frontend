import { describe, expect, it } from "vitest";
import {
  BPS,
  MAX_SETS,
  MathError,
  calcBuy,
  calcSell,
  priceYesBps,
} from "../generated/fpmm";
import { collateralToReachYesBps, depthCurve, sellYesToBps } from "../depth";

// Worked examples pinned in contracts model/fpmm_model.py _check_known_values():
// calc_buy(1000, 1000, 100, 0) -> shares_out 190, new reserves 910/1100;
// calc_sell(1000, 1000, 100, 0) -> shares_in 211..., gross 100, new reserves 1112/900.
describe("worked examples", () => {
  it("buy: collateral to reach the post-calc_buy(1000,1000,100,0) price is exactly 100", () => {
    const q = calcBuy(1_000n, 1_000n, 100n, 0n);
    expect(q.sharesOut).toBe(190n);
    expect(q.newReserveBought).toBe(910n);
    expect(q.newReserveOther).toBe(1_100n);
    const target = priceYesBps(q.newReserveBought, q.newReserveOther);
    const r = collateralToReachYesBps(1_000n, 1_000n, target, 0n);
    expect(r).not.toBeNull();
    expect(r!.collateralIn).toBe(100n);
    expect(r!.reachedBps).toBe(target);
    // minimality: 99 does not reach
    const below = calcBuy(1_000n, 1_000n, 99n, 0n);
    expect(priceYesBps(below.newReserveBought, below.newReserveOther)).toBeLessThan(target);
  });

  it("sell: collateral out at the post-calc_sell(1000,1000,100,0) price is exactly 100", () => {
    const q = calcSell(1_000n, 1_000n, 100n, 0n);
    expect(q.newReserveSold).toBe(1_112n);
    expect(q.newReserveOther).toBe(900n);
    const target = priceYesBps(q.newReserveSold, q.newReserveOther);
    const r = sellYesToBps(1_000n, 1_000n, target, 0n);
    expect(r).not.toBeNull();
    expect(r!.collateralOut).toBe(100n);
    expect(r!.sharesIn).toBe(q.sharesIn);
    expect(r!.reachedBps).toBe(target);
    // maximality: 101 drops below
    const below = calcSell(1_000n, 1_000n, 101n, 0n);
    expect(priceYesBps(below.newReserveSold, below.newReserveOther)).toBeLessThan(target);
  });
});

// Seeded PRNG (same LCG as quote.test.ts).
let seed = 0x5eed;
const rnd = (max: number) => {
  seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
  return seed % max;
};
const randReserve = () => {
  const exp = 7 + rnd(7); // 1e7 .. ~1e14
  const mag = BigInt(rnd(900_000) + 100_000);
  return mag * 10n ** BigInt(exp - 5);
};

describe("property: buy inversion", () => {
  it(">=2000 random cases: forward-verified, minimal collateral", () => {
    let checked = 0;
    for (let i = 0; i < 10_000 && checked < 2_000; i++) {
      const yes = randReserve();
      const no = randReserve();
      const fee = BigInt(rnd(1_001));
      const mid = priceYesBps(yes, no);
      let target = mid + BigInt(50 + rnd(1_951));
      if (target > 9_900n) target = 9_900n;
      if (target <= mid) continue;
      const r = collateralToReachYesBps(yes, no, target, fee);
      expect(r).not.toBeNull();
      if (!r) continue;
      checked++;
      const q = calcBuy(yes, no, r.collateralIn, fee);
      const reached = priceYesBps(q.newReserveBought, q.newReserveOther);
      expect(reached).toBeGreaterThanOrEqual(target);
      expect(r.reachedBps).toBe(reached);
      if (r.collateralIn > 1n) {
        let prevReaches = true;
        try {
          const q1 = calcBuy(yes, no, r.collateralIn - 1n, fee);
          prevReaches = priceYesBps(q1.newReserveBought, q1.newReserveOther) >= target;
        } catch (e) {
          expect(e).toBeInstanceOf(MathError);
          prevReaches = false;
        }
        expect(prevReaches).toBe(false);
      }
    }
    expect(checked).toBe(2_000);
  });
});

describe("property: sell inversion", () => {
  it(">=2000 random cases: forward-verified, maximal collateral", () => {
    let checked = 0;
    for (let i = 0; i < 10_000 && checked < 2_000; i++) {
      const yes = randReserve();
      const no = randReserve();
      const fee = BigInt(rnd(1_001));
      const mid = priceYesBps(yes, no);
      let target = mid - BigInt(50 + rnd(1_951));
      if (target < 100n) target = 100n;
      if (target >= mid) continue;
      const r = sellYesToBps(yes, no, target, fee);
      expect(r).not.toBeNull();
      if (!r) continue;
      checked++;
      const q = calcSell(yes, no, r.collateralOut, fee);
      const reached = priceYesBps(q.newReserveSold, q.newReserveOther);
      expect(reached).toBeGreaterThanOrEqual(target);
      expect(r.reachedBps).toBe(reached);
      expect(r.sharesIn).toBe(q.sharesIn);
      let nextOk = true;
      try {
        const q2 = calcSell(yes, no, r.collateralOut + 1n, fee);
        nextOk = priceYesBps(q2.newReserveSold, q2.newReserveOther) >= target;
      } catch (e) {
        expect(e).toBeInstanceOf(MathError);
        nextOk = false;
      }
      expect(nextOk).toBe(false);
    }
    expect(checked).toBe(2_000);
  });
});

describe("depthCurve", () => {
  const fixture = {
    reserve_yes: 1_000_000_000_000n, // 100k USDC
    reserve_no: 1_000_000_000_000n,
    fee_bps: 30,
    sets_minted: 0n,
  };

  it("cumulative is strictly monotonic on all four sides", () => {
    const { mid, levels } = depthCurve(fixture);
    for (const side of ["buyYes", "sellYes", "buyNo", "sellNo"] as const) {
      const sideLevels = levels.filter((l) => l.side === side);
      expect(sideLevels.length).toBeGreaterThan(3);
      let prevDist = -1n;
      let prevCum = -1n;
      for (const l of sideLevels) {
        const dist = l.bps > mid ? l.bps - mid : mid - l.bps;
        expect(dist).toBeGreaterThan(prevDist);
        expect(l.cumulative).toBeGreaterThan(prevCum);
        prevDist = dist;
        prevCum = l.cumulative;
      }
    }
  });

  it("every plotted buy level is forward-verified with calcBuy", () => {
    const { levels } = depthCurve(fixture);
    for (const l of levels.filter((x) => x.side === "buyYes")) {
      const q = calcBuy(fixture.reserve_yes, fixture.reserve_no, l.cumulative, BigInt(fixture.fee_bps));
      expect(q.sharesOut).toBe(l.shares);
      expect(priceYesBps(q.newReserveBought, q.newReserveOther)).toBeGreaterThanOrEqual(l.bps);
    }
    for (const l of levels.filter((x) => x.side === "sellYes")) {
      const q = calcSell(fixture.reserve_yes, fixture.reserve_no, l.cumulative, BigInt(fixture.fee_bps));
      expect(q.sharesIn).toBe(l.shares);
      expect(priceYesBps(q.newReserveSold, q.newReserveOther)).toBeGreaterThanOrEqual(l.bps);
    }
  });

  it("near MAX_SETS, the buy side ends with capped 'market-too-large' without throwing", () => {
    const { levels } = depthCurve({ ...fixture, sets_minted: MAX_SETS - 1_000_000n });
    const buys = levels.filter((l) => l.side === "buyYes");
    expect(buys.length).toBeGreaterThan(0);
    expect(buys.at(-1)?.capped).toBe("market-too-large");
    expect(buys.filter((l) => l.capped).length).toBe(1);
    // no capped levels past the stopper
    const cappedIdx = buys.findIndex((l) => l.capped);
    expect(cappedIdx).toBe(buys.length - 1);
  });

  it("insufficient liquidity bounds the sell side without throwing", () => {
    const tiny = { reserve_yes: 10_000n, reserve_no: 10_000n, fee_bps: 0, sets_minted: 0n };
    expect(() => depthCurve(tiny)).not.toThrow();
    const sells = depthCurve(tiny).levels.filter((l) => l.side === "sellYes");
    for (const l of sells) {
      expect(l.cumulative).toBeLessThan(tiny.reserve_no);
      const q = calcSell(tiny.reserve_yes, tiny.reserve_no, l.cumulative, 0n);
      expect(priceYesBps(q.newReserveSold, q.newReserveOther)).toBeGreaterThanOrEqual(l.bps);
    }
    // direct call at an extreme target still bounded, not throwing
    const r = sellYesToBps(10_000n, 10_000n, 100n, 0n);
    expect(r).not.toBeNull();
    expect(r!.collateralOut).toBeLessThan(10_000n);
  });

  it("NO-side curves mirror YES-side curves on swapped reserves", () => {
    // 1000/3000: mid 7500, swapped mid 2500 — grids align under bps -> BPS - bps.
    const a = { reserve_yes: 1_000n * 10n ** 7n, reserve_no: 3_000n * 10n ** 7n, fee_bps: 30, sets_minted: 0n };
    const b = { reserve_yes: a.reserve_no, reserve_no: a.reserve_yes, fee_bps: a.fee_bps, sets_minted: 0n };
    const curveA = depthCurve(a, { stepBps: 250n });
    const curveB = depthCurve(b, { stepBps: 250n });
    expect(curveB.mid).toBe(BPS - curveA.mid);
    const byBps = (side: "buyYes" | "sellYes") =>
      new Map(curveB.levels.filter((l) => l.side === side).map((l) => [l.bps, l]));
    const buyYesB = byBps("buyYes");
    const sellYesB = byBps("sellYes");
    for (const l of curveA.levels.filter((x) => x.side === "buyNo")) {
      const m = buyYesB.get(BPS - l.bps);
      expect(m).toBeDefined();
      expect(m!.cumulative).toBe(l.cumulative);
      expect(m!.shares).toBe(l.shares);
    }
    for (const l of curveA.levels.filter((x) => x.side === "sellNo")) {
      const m = sellYesB.get(BPS - l.bps);
      expect(m).toBeDefined();
      expect(m!.cumulative).toBe(l.cumulative);
      expect(m!.shares).toBe(l.shares);
    }
    expect(curveA.levels.filter((l) => l.side === "buyNo").length).toBeGreaterThan(2);
    expect(curveA.levels.filter((l) => l.side === "sellNo").length).toBeGreaterThan(2);
  });
});
