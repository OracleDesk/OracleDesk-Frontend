import { describe, expect, it } from "vitest";
import { calcBuy, priceYesBps } from "@/lib/stellar/generated/fpmm";
import { buildWindow, PRICE_WINDOW_LIMIT } from "@/lib/hooks/usePriceHistory";
import type { ChainEvent } from "@/lib/stellar/events";

const NOW = Date.parse("2026-10-19T12:00:00Z") / 1000;
const iso = (sec: number) => new Date(sec * 1000).toISOString();

let seq = 0;
function ev(name: string, ledger: number, at: number, data: Record<string, unknown>): ChainEvent {
  seq += 1;
  return { id: `${String(ledger).padStart(19, "0")}-${String(seq).padStart(10, "0")}`, ledger, closedAt: iso(at), txHash: "0".repeat(64), name, data };
}

function buyTrade(
  rYes: bigint,
  rNo: bigint,
  collateral: bigint,
  feeBps: bigint,
  outcome: "Yes" | "No",
  ledger: number,
  at: number,
): ChainEvent {
  const quote = calcBuy(outcome === "Yes" ? rYes : rNo, outcome === "Yes" ? rNo : rYes, collateral, feeBps);
  return ev("Trade", ledger, at, {
    market_id: 7n,
    trader: "GCRHOUOGQ6P2U7X7RL4Q4VJ7ZQZ3Q4S5T6U7V8W9X0Y1Z2A3B4C5D6E7F",
    outcome: { tag: outcome },
    is_buy: true,
    collateral,
    shares: quote.sharesOut,
    fee: quote.fee,
    reserve_yes: outcome === "Yes" ? quote.newReserveBought : quote.newReserveOther,
    reserve_no: outcome === "Yes" ? quote.newReserveOther : quote.newReserveBought,
  });
}

const view = (yesBps: number) => ({ yesBps, ledger: 500 });

describe("buildWindow", () => {
  it("no trades gives a flat line and changeBps 0", () => {
    const window = buildWindow([], view(4200), NOW);
    expect(window.reason).toBe("no-trades");
    expect(window.changeBps).toBe(0n);
    expect(window.startBps).toBe(4200n);
    expect(window.endBps).toBe(4200n);
    expect(window.points.length).toBeGreaterThanOrEqual(2);
    expect(window.points.every(point => point.yesBps === 4200n)).toBe(true);
    expect(window.truncated).toBe(false);
  });

  it("young market starts at initial_yes_bps and says since opening", () => {
    const created = ev("MarketCreated", 400, NOW - 3_600, { creator: "GCR7", market_id: 7n, initial_yes_bps: 3_000 });
    const window = buildWindow([created], view(3450), NOW);
    expect(window.reason).toBe("too-young");
    expect(window.startBps).toBe(3_000n);
    expect(window.changeBps).toBe(450n);
    expect(window.points[0]).toEqual({ time: NOW - 3_600, yesBps: 3_000n });
  });

  it("a page of exactly the limit sets truncated and keeps the start price", () => {
    const rYes = 4_000_000n;
    const rNo = 6_000_000n;
    const first = buyTrade(rYes, rNo, 100_000n, 30n, "Yes", 400, NOW - 72_000);
    const older = Array.from({ length: PRICE_WINDOW_LIMIT - 1 }, (_, i) => ev("Trade", 100 + i, NOW - 86_400 - 60 - i, {}));
    const window = buildWindow([first, ...older], view(6_100), NOW);
    expect(window.truncated).toBe(true);
    expect(window.startBps).toBe(priceYesBps(rYes, rNo));
    expect(window.trades).toBe(1);
  });

  it("resolution inside the window stops the line", () => {
    const t1 = buyTrade(4_000_000n, 6_000_000n, 100_000n, 30n, "Yes", 400, NOW - 72_000);
    const t2 = buyTrade(5_000_000n, 5_000_000n, 50_000n, 0n, "No", 401, NOW - 3_600);
    const resolved = ev("MarketResolved", 402, NOW - 3_000, { market_id: 7n, outcome: { tag: "Yes" } });
    const t3 = buyTrade(5_000_000n, 5_000_000n, 50_000n, 0n, "Yes", 403, NOW - 1_000);
    const window = buildWindow([t1, t2, resolved, t3], view(5_500), NOW);
    expect(window.trades).toBe(2);
    expect(window.points.map(point => point.time)).toEqual([NOW - 86_400, NOW - 72_000, NOW - 3_600]);
  });

  it("change equals end minus start when the start comes from preTradeReserves", () => {
    const rYes = 4_000_000n;
    const rNo = 6_000_000n;
    const trade = buyTrade(rYes, rNo, 100_000n, 30n, "Yes", 400, NOW - 10_000);
    const window = buildWindow([trade], view(5_900), NOW);
    const start = priceYesBps(rYes, rNo);
    expect(window.startBps).toBe(start);
    expect(window.endBps).toBe(5_900n);
    expect(window.changeBps).toBe(5_900n - start);
    expect(window.points[0]).toEqual({ time: NOW - 86_400, yesBps: start });
    expect(window.points.at(-1)).toEqual({ time: NOW, yesBps: 5_900n });
    expect(window.trades).toBe(1);
    expect(window.reason).toBeUndefined();
  });
});
