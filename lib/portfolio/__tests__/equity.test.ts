import { describe, expect, it } from "vitest";
import { calcBuy, calcSell, BPS, seedReserves, settleValue } from "@/lib/stellar/generated/fpmm";
import type { ChainEvent } from "@/lib/stellar/events";
import { equitySeries, kpis, toLedger, type LedgerEntry } from "../equity";

const WALLET = "GALICEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER = "GBOBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const TX = "a".repeat(64);
let sequence = 0;

const event = (name: string, data: Record<string, unknown>, over: Partial<ChainEvent> = {}): ChainEvent => ({
  id: `${String(++sequence).padStart(19, "0")}-0000000001`,
  ledger: 100 + sequence,
  closedAt: new Date(Date.UTC(2026, 9, 18, 12, 0, sequence)).toISOString(),
  txHash: TX,
  name,
  data,
  ...over,
});

const buyEvent = (collateral: bigint, shares: bigint, fee: bigint, reserveYes: bigint, reserveNo: bigint, over: Partial<ChainEvent> = {}) =>
  event("Trade", { market_id: 7n, trader: WALLET, outcome: { tag: "Yes" }, is_buy: true, collateral, shares, fee, reserve_yes: reserveYes, reserve_no: reserveNo }, over);
const sellEvent = (collateral: bigint, shares: bigint, fee: bigint, reserveYes: bigint, reserveNo: bigint) =>
  event("Trade", { market_id: 7n, trader: WALLET, outcome: { tag: "Yes" }, is_buy: false, collateral, shares, fee, reserve_yes: reserveYes, reserve_no: reserveNo });
const redeemEvent = (payout: bigint, holder = WALLET) =>
  event("Redeemed", { market_id: 7n, holder, payout });

const zeroPoint = { time: 0, cashFlow: 0n, markValue: 0n, equity: 0n, partial: false };
const finalOf = (ledger: LedgerEntry[], priceAt: (id: string, t: number) => bigint | null) =>
  equitySeries(ledger, priceAt, []).at(-1)!;

describe("toLedger", () => {
  it("maps trade, seed and redeem events and skips other wallets", () => {
    const seed = 100_000_000n;
    const expected = seedReserves(seed, 3000n);
    const rows = toLedger([
      event("MarketCreated", { market_id: 3n, creator: OTHER, seed_amount: seed, initial_yes_bps: 3000 }),
      buyEvent(10_000_000n, 19_800_000n, 100_000n, 500_000_000n, 509_900_000n),
      event("Redeemed", { market_id: 7n, holder: OTHER, payout: 1n }),
      event("Trade", { market_id: 7n, trader: OTHER, outcome: { tag: "Yes" }, is_buy: true, collateral: 5n, shares: 5n, fee: 0n, reserve_yes: 1n, reserve_no: 1n }),
      redeemEvent(42_000_000n),
      event("MarketCreated", { market_id: 9n, creator: WALLET, seed_amount: seed, initial_yes_bps: 3000 }),
    ], WALLET);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "buy", marketId: "7", outcome: "Yes", collateral: 10_000_000n, shares: 19_800_000n, txHash: TX });
    expect(rows[1]).toMatchObject({ kind: "redeem", marketId: "7", payout: 42_000_000n });
    expect(rows[2]).toMatchObject({ kind: "seed", marketId: "9", seed, yesShares: expected.creatorYes, noShares: expected.creatorNo });
    expect(rows.map(r => r.time)).toEqual([...rows.map(r => r.time)].sort((a, b) => a - b));
  });

  it("ignores events for other wallets entirely", () => {
    const foreign = [
      event("Trade", { market_id: 7n, trader: OTHER, outcome: { tag: "No" }, is_buy: true, collateral: 1n, shares: 1n, fee: 0n, reserve_yes: 1n, reserve_no: 1n }),
      redeemEvent(1n, OTHER),
      event("MarketCreated", { market_id: 1n, creator: OTHER, seed_amount: 1n, initial_yes_bps: 5000 }),
    ];
    expect(toLedger(foreign, WALLET)).toEqual([]);
  });
});

describe("equitySeries", () => {
  it("buy then sell at the same reserves loses exactly the two fees", () => {
    const feeBps = 100n;
    const buy = calcBuy(509_900_000n, 500_000_000n, 10_000_000n, feeBps);
    const net = 10_000_000n - buy.fee;
    // collateral_out whose gross (via calcSell's ceil) is exactly the net in.
    const feeSell = (net * feeBps + BPS - 1n) / BPS;
    const collateralOut = net - feeSell;
    const sell = calcSell(buy.newReserveBought, buy.newReserveOther, collateralOut, feeBps);
    expect(sell.sharesIn).toBe(buy.sharesOut);

    const ledger = toLedger([
      buyEvent(10_000_000n, buy.sharesOut, buy.fee, buy.newReserveBought, buy.newReserveOther),
      sellEvent(collateralOut, sell.sharesIn, sell.fee, sell.newReserveSold, sell.newReserveOther),
    ], WALLET);
    const last = finalOf(ledger, () => 4950n);
    expect(last.equity).toBe(collateralOut - 10_000_000n);
    expect(last.equity).toBe(-(buy.fee + sell.fee));
    // Round trip lands back on the pre-buy reserves.
    expect(sell.newReserveSold).toBe(509_900_000n);
    expect(sell.newReserveOther).toBe(500_000_000n);
  });

  it("buy then redeem on a YES resolution equals payout minus collateral", () => {
    const collateral = 10_000_000n;
    const shares = 19_800_000n;
    const payout = settleValue("yes", shares, 0n);
    const ledger = toLedger([buyEvent(collateral, shares, 100_000n, 500_000_000n, 509_900_000n), redeemEvent(payout)], WALLET);
    const last = finalOf(ledger, () => 5000n);
    expect(payout).toBe(shares);
    expect(last.equity).toBe(payout - collateral);
    expect(last.markValue).toBe(0n);
  });

  it("void redemption uses (yes + no) / 2", () => {
    const first = calcBuy(500_000_000n, 500_000_000n, 10_000_000n, 100n);
    const second = calcBuy(first.newReserveOther, first.newReserveBought, 10_000_000n, 100n);
    const yes = first.sharesOut;
    const no = second.sharesOut;
    const payout = settleValue("void", yes, no);
    expect(payout).toBe((yes + no) / 2n);
    const ledger = toLedger([
      buyEvent(10_000_000n, yes, first.fee, first.newReserveBought, first.newReserveOther),
      event("Trade", { market_id: 7n, trader: WALLET, outcome: { tag: "No" }, is_buy: true, collateral: 10_000_000n, shares: no, fee: second.fee, reserve_yes: second.newReserveOther, reserve_no: second.newReserveBought }),
      redeemEvent(payout),
    ], WALLET);
    const last = finalOf(ledger, () => 5000n);
    expect(last.equity).toBe(payout - 20_000_000n);
  });

  it("creator seed adds seedReserves creator shares and -seed cash flow", () => {
    const seed = 100_000_000n;
    const reserves = seedReserves(seed, 3000n);
    const ledger = toLedger([event("MarketCreated", { market_id: 3n, creator: WALLET, seed_amount: seed, initial_yes_bps: 3000 })], WALLET);
    const price = 3000n;
    const last = finalOf(ledger, () => price);
    expect(last.cashFlow).toBe(-seed);
    expect(last.markValue).toBe(reserves.creatorYes * price / BPS + reserves.creatorNo * (BPS - price) / BPS);
    expect(last.equity).toBe(last.cashFlow + last.markValue);
  });

  it("floors the mark value (1 share at p=3333 marks 0)", () => {
    const one = finalOf(toLedger([buyEvent(1_000_000n, 1n, 0n, 1n, 1n)], WALLET), () => 3333n);
    expect(one.markValue).toBe(0n);
    const four = finalOf(toLedger([buyEvent(4_000_000n, 4n, 0n, 1n, 1n)], WALLET), () => 3333n);
    expect(four.markValue).toBe(1n);
  });

  it("keeps equity = cashFlow + markValue at every point", () => {
    const ledger = toLedger([
      buyEvent(10_000_000n, 19_800_000n, 100_000n, 500_000_000n, 509_900_000n),
      sellEvent(9_800_000n, 5_000_000n, 50_000n, 509_900_000n, 500_000_000n),
    ], WALLET);
    const points = equitySeries(ledger, () => 5000n, [0, 1, ...ledger.map(e => e.time + 1)]);
    expect(points.length).toBeGreaterThan(2);
    for (const point of points) expect(point.equity).toBe(point.cashFlow + point.markValue);
  });

  it("marks partial and reuses the last known price when priceAt returns null", () => {
    const ledger = toLedger([buyEvent(10_000_000n, 19_800_000n, 100_000n, 500_000_000n, 509_900_000n)], WALLET);
    const buyTime = ledger[0].time;
    const flat = finalOf(ledger, () => 4950n);
    expect(flat.partial).toBe(false);

    const points = equitySeries(ledger, (id, time) => (time <= buyTime ? 4950n : null), [buyTime + 1000, buyTime + 2000]);
    const [, later1, later2] = points;
    for (const point of [later1, later2]) {
      expect(point.partial).toBe(true);
      expect(point.markValue).toBe(19_800_000n * 4950n / BPS);
    }

    const blind = equitySeries(ledger, () => null, [buyTime + 1000]);
    expect(blind[0].partial).toBe(true);
    expect(blind[0].markValue).toBe(0n);
  });
});

describe("kpis", () => {
  const ledgerFor = (marketId: string, payout: bigint): LedgerEntry[] => [
    { kind: "buy", time: 1, marketId, outcome: "Yes" as const, collateral: 10_000_000n, shares: 19_800_000n, txHash: TX },
    { kind: "redeem", time: 2, marketId, payout, txHash: TX },
  ];

  it("is null with no finished markets", () => {
    const tradedOnly: LedgerEntry[] = [{ kind: "buy", time: 1, marketId: "1", outcome: "Yes", collateral: 10n, shares: 10n, txHash: TX }];
    expect(kpis(tradedOnly, zeroPoint, new Map()).winRateBps).toBeNull();
    expect(kpis(tradedOnly, zeroPoint, new Map([["1", "Yes" as const]])).winRateBps).toBeNull();
    expect(kpis(ledgerFor("2", 15_000_000n), zeroPoint, new Map([["2", "Void" as const]])).winRateBps).toBeNull();
  });

  it("computes win rate over resolved and redeemed markets", () => {
    const ledger = [...ledgerFor("1", 15_000_000n), ...ledgerFor("2", 8_000_000n)];
    const result = kpis(ledger, zeroPoint, new Map([["1", "Yes" as const], ["2", "No" as const]]));
    expect(result.winRateBps).toBe(5000n);
    expect(result.marketsTraded).toBe(2);
    expect(result.volume).toBe(20_000_000n);
    expect(result.totalPnl).toBe(0n);
    expect(kpis(ledger, { ...zeroPoint, equity: 3n }, new Map()).winRateBps).toBeNull();
  });
});
