import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BPS, calcBuy, calcSell, seedReserves, settleValue } from "../../stellar/generated/fpmm";
import { mulDivFloor, USDC_UNIT } from "../../stellar/units";
import {
  allocateRedemptionPayout,
  deserializePnl,
  replay,
  seedCostBasis,
  serializePnl,
  totals,
  unrealizedAt,
  type PnlEvent,
} from "../pnl";

/** Deterministic PRNG for repeatable property tests (1,000+ runs). */
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
      const span = max - min + 1n;
      const hi = BigInt(nextU32());
      const lo = BigInt(nextU32());
      const combined = (hi << 32n) | lo;
      return min + (combined % span);
    },
  };
}

describe("lib/portfolio/pnl", () => {
  it("uses only bigint arithmetic and never calls Number( or parseFloat", () => {
    const source = readFileSync(resolve(__dirname, "../pnl.ts"), "utf8");
    expect(source).not.toContain("Number(");
    expect(source).not.toContain("parseFloat");
  });

  it("buy then full sell realizes collateralOut - collateralIn", () => {
    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "0001-1",
        ledger: 100,
        marketId: "1",
        outcome: "Yes",
        isBuy: true,
        collateral: 100n * USDC_UNIT,
        shares: 158_730_158n,
        fee: 2n * USDC_UNIT,
      },
      {
        kind: "trade",
        id: "0002-1",
        ledger: 101,
        marketId: "1",
        outcome: "Yes",
        isBuy: false,
        collateral: 112n * USDC_UNIT,
        shares: 158_730_158n,
        fee: 1n * USDC_UNIT,
      },
    ];

    const state = replay(events).get("1")!;
    expect(state.yes.shares).toBe(0n);
    expect(state.yes.cost).toBe(0n);
    expect(state.yes.realized).toBe(12n * USDC_UNIT);
    expect(state.yes.fees).toBe(3n * USDC_UNIT);
    expect(state.yes.bought).toBe(158_730_158n);
    expect(state.yes.sold).toBe(158_730_158n);
  });

  it("property: any partition of a sell sums to the single-sell realized PnL (1,200 runs)", () => {
    const rng = createRng(0x59_2026);

    for (let run = 0; run < 1_200; run++) {
      let rYes = rng.big(10n * USDC_UNIT, 500_000n * USDC_UNIT);
      let rNo = rng.big(10n * USDC_UNIT, 500_000n * USDC_UNIT);
      const feeBps = BigInt([0, 10, 30, 100, 250, 500][rng.int(0, 5)]);
      const collateralIn = rng.big(1n * USDC_UNIT, 5_000n * USDC_UNIT);

      const buyQuote = calcBuy(rYes, rNo, collateralIn, feeBps);
      rYes = buyQuote.newReserveBought;
      rNo = buyQuote.newReserveOther;

      const totalShares = buyQuote.sharesOut;
      const partsCount = rng.int(2, 6);
      const events: PnlEvent[] = [
        {
          kind: "trade",
          id: `buy-${run}`,
          ledger: 10,
          marketId: "m",
          outcome: "Yes",
          isBuy: true,
          collateral: collateralIn,
          shares: totalShares,
          fee: buyQuote.fee,
        },
      ];

      let remainingShares = totalShares;
      let totalCollateralOut = 0n;
      let totalSellFees = 0n;

      for (let k = 0; k < partsCount && remainingShares > 0n; k++) {
        const isLast = k === partsCount - 1;
        const shareSlice = isLast
          ? remainingShares
          : rng.big(1n, remainingShares);

        // Pick a collateralOut simulated via calcSell or direct slice
        let collateralOut = rng.big(1n, (rNo * (BPS - feeBps)) / BPS / 4n + 1n);
        let sharesIn = shareSlice;
        let sellFee = rng.big(0n, 1_000_000n);
        try {
          const sq = calcSell(rYes, rNo, collateralOut, feeBps);
          if (sq.sharesIn <= remainingShares && !isLast) {
            sharesIn = sq.sharesIn;
            sellFee = sq.fee;
            rYes = sq.newReserveSold;
            rNo = sq.newReserveOther;
          } else {
            collateralOut = mulDivFloor(shareSlice, 5_000n, BPS);
          }
        } catch {
          collateralOut = mulDivFloor(shareSlice, 5_000n, BPS);
        }

        remainingShares -= sharesIn;
        totalCollateralOut += collateralOut;
        totalSellFees += sellFee;

        events.push({
          kind: "trade",
          id: `sell-${run}-${k}`,
          ledger: 11 + k,
          marketId: "m",
          outcome: "Yes",
          isBuy: false,
          collateral: collateralOut,
          shares: sharesIn,
          fee: sellFee,
        });
      }

      if (remainingShares > 0n) {
        const finalOut = mulDivFloor(remainingShares, 6_000n, BPS);
        totalCollateralOut += finalOut;
        events.push({
          kind: "trade",
          id: `sell-${run}-final`,
          ledger: 20,
          marketId: "m",
          outcome: "Yes",
          isBuy: false,
          collateral: finalOut,
          shares: remainingShares,
          fee: 0n,
        });
      }

      const partitioned = replay(events).get("m")!;
      const singleExit = replay([
        events[0],
        {
          kind: "trade",
          id: `sell-${run}-single`,
          ledger: 20,
          marketId: "m",
          outcome: "Yes",
          isBuy: false,
          collateral: totalCollateralOut,
          shares: totalShares,
          fee: totalSellFees,
        },
      ]).get("m")!;

      expect(partitioned.yes.shares).toBe(0n);
      expect(partitioned.yes.cost).toBe(0n);
      expect(partitioned.yes.realized).toBe(totalCollateralOut - collateralIn);
      expect(partitioned.yes.realized).toBe(singleExit.yes.realized);
    }
  });

  it("property: cost basis is never negative, is 0 whenever shares are 0, and reconciles with cash flows (1,200 runs)", () => {
    const rng = createRng(0x99_1337);

    for (let run = 0; run < 1_200; run++) {
      const steps = rng.int(3, 15);
      const events: PnlEvent[] = [];
      let heldYes = 0n;
      let heldNo = 0n;
      let cashInYes = 0n;
      let cashOutYes = 0n;
      let cashInNo = 0n;
      let cashOutNo = 0n;
      let feesYes = 0n;
      let feesNo = 0n;

      for (let i = 0; i < steps; i++) {
        const outcome = rng.int(0, 1) === 0 ? "Yes" : "No";
        const held = outcome === "Yes" ? heldYes : heldNo;
        const isBuy = held === 0n || rng.int(0, 1) === 0;

        if (isBuy) {
          const collateral = rng.big(100n, 1_000n * USDC_UNIT);
          const shares = rng.big(100n, 1_500n * USDC_UNIT);
          const fee = rng.big(0n, collateral / 10n);
          events.push({
            kind: "trade",
            id: `e-${run}-${i}`,
            ledger: 100 + i,
            marketId: "m1",
            outcome,
            isBuy: true,
            collateral,
            shares,
            fee,
          });
          if (outcome === "Yes") {
            heldYes += shares;
            cashInYes += collateral;
            feesYes += fee;
          } else {
            heldNo += shares;
            cashInNo += collateral;
            feesNo += fee;
          }
        } else {
          // Sell up to held (no oversell in this reconciliation check)
          const shares = rng.int(0, 3) === 0 ? held : rng.big(1n, held);
          const collateral = rng.big(0n, 1_000n * USDC_UNIT);
          const fee = rng.big(0n, 10n * USDC_UNIT);
          events.push({
            kind: "trade",
            id: `e-${run}-${i}`,
            ledger: 100 + i,
            marketId: "m1",
            outcome,
            isBuy: false,
            collateral,
            shares,
            fee,
          });
          if (outcome === "Yes") {
            heldYes -= shares;
            cashOutYes += collateral;
            feesYes += fee;
          } else {
            heldNo -= shares;
            cashOutNo += collateral;
            feesNo += fee;
          }
        }
      }

      const m = replay(events).get("m1")!;
      expect(m.yes.cost).toBeGreaterThanOrEqual(0n);
      expect(m.no.cost).toBeGreaterThanOrEqual(0n);
      if (m.yes.shares === 0n) expect(m.yes.cost).toBe(0n);
      if (m.no.shares === 0n) expect(m.no.cost).toBe(0n);

      // Reconciliation: realized + remaining cost == cashOut - cashIn + cashIn == cashOut - (cashIn - remainingCost)
      // Specifically: cashOut - realized === cashIn - remainingCost (both equal total cost removed)
      expect(m.yes.realized + m.yes.cost).toBe(cashOutYes - cashInYes + cashInYes);
      expect(cashOutYes - m.yes.realized).toBe(cashInYes - m.yes.cost);
      expect(cashOutNo - m.no.realized).toBe(cashInNo - m.no.cost);
      expect(m.yes.fees).toBe(feesYes);
      expect(m.no.fees).toBe(feesNo);
    }
  });

  it("YES resolution redeem realizes yes.shares - total cost", () => {
    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "t1",
        ledger: 1,
        marketId: "42",
        outcome: "Yes",
        isBuy: true,
        collateral: 60n * USDC_UNIT,
        shares: 100n * USDC_UNIT,
        fee: 1n * USDC_UNIT,
      },
      {
        kind: "trade",
        id: "t2",
        ledger: 2,
        marketId: "42",
        outcome: "No",
        isBuy: true,
        collateral: 15n * USDC_UNIT,
        shares: 30n * USDC_UNIT,
        fee: 300_000n,
      },
      {
        kind: "resolved",
        id: "r1",
        ledger: 3,
        marketId: "42",
        outcome: "Yes",
      },
      {
        kind: "redeem",
        id: "rd1",
        ledger: 4,
        marketId: "42",
        payout: 100n * USDC_UNIT,
      },
    ];

    const m = replay(events).get("42")!;
    expect(m.resolution).toBe("Yes");
    expect(m.redeemed).toBe(true);
    expect(m.yes.shares).toBe(0n);
    expect(m.yes.cost).toBe(0n);
    expect(m.no.shares).toBe(0n);
    expect(m.no.cost).toBe(0n);
    expect(m.redemptionPnl).toBe(100n * USDC_UNIT - 75n * USDC_UNIT);
    expect(m.anomalies).toEqual([]);
  });

  it("redeem with payout 0 on a losing side realizes -cost", () => {
    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "t1",
        ledger: 1,
        marketId: "9",
        outcome: "No",
        isBuy: true,
        collateral: 25n * USDC_UNIT,
        shares: 40n * USDC_UNIT,
        fee: 0n,
      },
      { kind: "resolved", id: "r1", ledger: 2, marketId: "9", outcome: "Yes" },
      { kind: "redeem", id: "rd1", ledger: 3, marketId: "9", payout: 0n },
    ];

    const m = replay(events).get("9")!;
    expect(m.redeemed).toBe(true);
    expect(m.redemptionPnl).toBe(-25n * USDC_UNIT);
    expect(m.anomalies).toEqual([]);
  });

  it("void redeem allocates payout exactly with an odd share sum and matches settleValue", () => {
    const yesShares = 101n;
    const noShares = 50n; // sum = 151 (odd), settleValue("void", 101n, 50n) = 75n
    const expectedPayout = settleValue("void", yesShares, noShares);
    expect(expectedPayout).toBe(75n);

    const allocation = allocateRedemptionPayout("Void", yesShares, noShares, expectedPayout);
    expect(allocation.yesPart + allocation.noPart).toBe(expectedPayout);

    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "t-yes",
        ledger: 1,
        marketId: "void-mkt",
        outcome: "Yes",
        isBuy: true,
        collateral: 60n,
        shares: yesShares,
        fee: 1n,
      },
      {
        kind: "trade",
        id: "t-no",
        ledger: 2,
        marketId: "void-mkt",
        outcome: "No",
        isBuy: true,
        collateral: 30n,
        shares: noShares,
        fee: 1n,
      },
      {
        kind: "resolved",
        id: "res",
        ledger: 3,
        marketId: "void-mkt",
        outcome: "Void",
      },
      {
        kind: "redeem",
        id: "red",
        ledger: 4,
        marketId: "void-mkt",
        payout: expectedPayout,
      },
    ];

    const m = replay(events).get("void-mkt")!;
    expect(m.redeemed).toBe(true);
    expect(m.redemptionPnl).toBe(75n - 90n);
    expect(m.anomalies).toEqual([]);
  });

  it("payout mismatch records an anomaly and trusts the event", () => {
    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "t1",
        ledger: 1,
        marketId: "7",
        outcome: "Yes",
        isBuy: true,
        collateral: 40n * USDC_UNIT,
        shares: 80n * USDC_UNIT,
        fee: 0n,
      },
      { kind: "resolved", id: "r1", ledger: 2, marketId: "7", outcome: "Yes" },
      {
        kind: "redeem",
        id: "rd1",
        ledger: 3,
        marketId: "7",
        payout: 120n * USDC_UNIT, // 40 USDC more than known shares
      },
    ];

    const m = replay(events).get("7")!;
    expect(m.redemptionPnl).toBe(120n * USDC_UNIT - 40n * USDC_UNIT);
    expect(m.anomalies.length).toBe(1);
    expect(m.anomalies[0]).toMatch(/mismatch/i);
  });

  it("oversell clamps and records an anomaly without going negative", () => {
    const events: PnlEvent[] = [
      {
        kind: "trade",
        id: "t1",
        ledger: 10,
        marketId: "8",
        outcome: "Yes",
        isBuy: true,
        collateral: 20n * USDC_UNIT,
        shares: 30n * USDC_UNIT,
        fee: 0n,
      },
      {
        kind: "trade",
        id: "t2",
        ledger: 11,
        marketId: "8",
        outcome: "Yes",
        isBuy: false,
        collateral: 50n * USDC_UNIT,
        shares: 80n * USDC_UNIT,
        fee: 1n * USDC_UNIT,
      },
    ];

    const m = replay(events).get("8")!;
    expect(m.yes.shares).toBe(0n);
    expect(m.yes.cost).toBe(0n);
    expect(m.yes.realized).toBe(30n * USDC_UNIT);
    expect(m.anomalies.length).toBe(1);
    expect(m.anomalies[0]).toMatch(/oversell/i);
  });

  it("duplicate event ids are rejected and out-of-order events sort deterministically", () => {
    const e1: PnlEvent = {
      kind: "trade",
      id: "0001-b",
      ledger: 10,
      marketId: "1",
      outcome: "Yes",
      isBuy: true,
      collateral: 50n * USDC_UNIT,
      shares: 100n * USDC_UNIT,
      fee: 1n * USDC_UNIT,
    };
    const e2: PnlEvent = {
      kind: "trade",
      id: "0001-a",
      ledger: 10,
      marketId: "1",
      outcome: "Yes",
      isBuy: true,
      collateral: 25n * USDC_UNIT,
      shares: 40n * USDC_UNIT,
      fee: 500_000n,
    };
    const e3: PnlEvent = {
      kind: "trade",
      id: "0002-a",
      ledger: 11,
      marketId: "1",
      outcome: "Yes",
      isBuy: false,
      collateral: 30n * USDC_UNIT,
      shares: 70n * USDC_UNIT,
      fee: 300_000n,
    };

    const a = replay([e1, e2, e3]);
    const b = replay([e3, e1, e2, e1, e3]);
    expect(b).toEqual(a);
  });

  it("unrealizedAt floors and matches hand-computed values for open and unredeemed resolved markets", () => {
    const openEvents: PnlEvent[] = [
      {
        kind: "trade",
        id: "t1",
        ledger: 1,
        marketId: "1",
        outcome: "Yes",
        isBuy: true,
        collateral: 600n,
        shares: 1_001n,
        fee: 10n,
      },
      {
        kind: "trade",
        id: "t2",
        ledger: 2,
        marketId: "1",
        outcome: "No",
        isBuy: true,
        collateral: 200n,
        shares: 503n,
        fee: 5n,
      },
    ];

    const m = replay(openEvents).get("1")!;
    // yesBps = 6333 -> floor(1001 * 6333 / 10000) = 633, floor(503 * 3667 / 10000) = 184 => value = 817
    const mark = unrealizedAt(m, 6_333n);
    expect(mark.value).toBe(633n + 184n);
    expect(mark.unrealized).toBe(817n - 800n);

    // Resolved without redeem uses settleValue instead of price
    const resolvedMap = replay([
      ...openEvents,
      { kind: "resolved", id: "r1", ledger: 3, marketId: "1", outcome: "Yes" },
    ]);
    const resolvedMark = unrealizedAt(resolvedMap.get("1")!, 1_000n);
    expect(resolvedMark.value).toBe(1_001n);
    expect(resolvedMark.unrealized).toBe(1_001n - 800n);

    const summary = totals(resolvedMap, new Map());
    expect(summary.cost).toBe(800n);
    expect(summary.unrealized).toBe(201n);
    expect(summary.fees).toBe(15n);
  });

  it("seedCostBasis matches seedReserves creator shares at the opening price and round-trips serialization", () => {
    const seed = 1_000n * USDC_UNIT;
    const initialYesBps = 6_000n;
    const reserves = seedReserves(seed, initialYesBps);
    const basis = seedCostBasis(seed, initialYesBps);

    expect(basis).toBe(
      mulDivFloor(reserves.creatorYes, initialYesBps, BPS) +
        mulDivFloor(reserves.creatorNo, BPS - initialYesBps, BPS),
    );

    const map = replay([
      {
        kind: "seed",
        id: "seed-1",
        ledger: 1,
        marketId: "10",
        yes: reserves.creatorYes,
        no: reserves.creatorNo,
        costBasis: basis,
      },
    ]);
    const roundTripped = deserializePnl(serializePnl(map));
    expect(roundTripped).toEqual(map);
  });
});
