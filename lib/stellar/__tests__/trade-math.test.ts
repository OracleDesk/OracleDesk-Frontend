import { describe, expect, it } from "vitest";
import { calcBuy, calcSell, MathError, type BuyQuote, type SellQuote } from "../generated/fpmm";
import { preTradeReserves, type TradeEventData } from "../trade-math";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rnd = mulberry32(0xc0ffee);
const randAmount = () => BigInt(Math.floor(1e6 + rnd() * (1e12 - 1e6)));
const randFeeBps = () => BigInt(Math.floor(rnd() * 1001));

function buyEvent(outcome: "Yes" | "No", rYes: bigint, rNo: bigint, collateral: bigint, feeBps: bigint): TradeEventData | null {
  let quote: BuyQuote;
  try {
    quote = calcBuy(outcome === "Yes" ? rYes : rNo, outcome === "Yes" ? rNo : rYes, collateral, feeBps);
  } catch (error) {
    if (error instanceof MathError) return null;
    throw error;
  }
  return {
    outcome,
    isBuy: true,
    collateral,
    shares: quote.sharesOut,
    fee: quote.fee,
    reserveYes: outcome === "Yes" ? quote.newReserveBought : quote.newReserveOther,
    reserveNo: outcome === "Yes" ? quote.newReserveOther : quote.newReserveBought,
  };
}

function sellEvent(outcome: "Yes" | "No", rYes: bigint, rNo: bigint, collateralOut: bigint, feeBps: bigint): TradeEventData | null {
  let quote: SellQuote;
  try {
    quote = calcSell(outcome === "Yes" ? rYes : rNo, outcome === "Yes" ? rNo : rYes, collateralOut, feeBps);
  } catch (error) {
    if (error instanceof MathError) return null;
    throw error;
  }
  return {
    outcome,
    isBuy: false,
    collateral: collateralOut,
    shares: quote.sharesIn,
    fee: quote.fee,
    reserveYes: outcome === "Yes" ? quote.newReserveSold : quote.newReserveOther,
    reserveNo: outcome === "Yes" ? quote.newReserveOther : quote.newReserveSold,
  };
}

describe("preTradeReserves", () => {
  it("inverts calcBuy for Yes and No", () => {
    for (let i = 0; i < 300; i++) {
      const rYes = randAmount();
      const rNo = randAmount();
      const collateral = randAmount();
      const feeBps = randFeeBps();
      for (const outcome of ["Yes", "No"] as const) {
        const event = buyEvent(outcome, rYes, rNo, collateral, feeBps);
        if (event) expect(preTradeReserves(event)).toEqual({ reserveYes: rYes, reserveNo: rNo });
      }
    }
  });

  it("inverts calcSell for Yes and No", () => {
    for (let i = 0; i < 300; i++) {
      const rYes = randAmount();
      const rNo = randAmount();
      const collateralOut = randAmount();
      const feeBps = randFeeBps();
      for (const outcome of ["Yes", "No"] as const) {
        const event = sellEvent(outcome, rYes, rNo, collateralOut, feeBps);
        if (event) expect(preTradeReserves(event)).toEqual({ reserveYes: rYes, reserveNo: rNo });
      }
    }
  });

  it("round-trips deterministic buy and sell quotes exactly", () => {
    const rYes = 5_000_000_000n;
    const rNo = 3_000_000_000n;
    expect(preTradeReserves(buyEvent("Yes", rYes, rNo, 250_000_000n, 30n)!)).toEqual({ reserveYes: rYes, reserveNo: rNo });
    expect(preTradeReserves(buyEvent("No", rYes, rNo, 250_000_000n, 0n)!)).toEqual({ reserveYes: rYes, reserveNo: rNo });
    expect(preTradeReserves(sellEvent("Yes", rYes, rNo, 100_000_000n, 30n)!)).toEqual({ reserveYes: rYes, reserveNo: rNo });
    expect(preTradeReserves(sellEvent("No", rYes, rNo, 100_000_000n, 0n)!)).toEqual({ reserveYes: rYes, reserveNo: rNo });
  });

  it("returns null when a reconstructed reserve is not positive", () => {
    expect(preTradeReserves({ outcome: "Yes", isBuy: true, collateral: 1_000n, shares: 1n, fee: 0n, reserveYes: 100n, reserveNo: 10_000n })).toBeNull();
    expect(preTradeReserves({ outcome: "Yes", isBuy: false, collateral: 100n, shares: 5_000n, fee: 0n, reserveYes: 100n, reserveNo: 10_000n })).toBeNull();
  });
});
