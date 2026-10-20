import type { ChainEvent } from "@/lib/stellar/events";
import { BPS, seedReserves } from "@/lib/stellar/generated/fpmm";

export type LedgerEntry =
  | { kind: "buy" | "sell"; time: number; marketId: string; outcome: "Yes" | "No"; collateral: bigint; shares: bigint; txHash: string }
  | { kind: "seed"; time: number; marketId: string; seed: bigint; yesShares: bigint; noShares: bigint; txHash: string }
  | { kind: "redeem"; time: number; marketId: string; payout: bigint; txHash: string };

export interface Holdings { yes: bigint; no: bigint }

export interface EquityPoint { time: number; cashFlow: bigint; markValue: bigint; equity: bigint; partial: boolean }

const timeOf = (event: ChainEvent) => Date.parse(event.closedAt);

/** Wallet-scoped ledger from decoded market-core events; other wallets' rows are dropped. */
export function toLedger(events: ChainEvent[], wallet: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const event of events) {
    const time = timeOf(event);
    if (event.name === "Trade") {
      const outcome = event.data.outcome as { tag?: unknown } | undefined;
      if (event.data.trader !== wallet || (outcome?.tag !== "Yes" && outcome?.tag !== "No") || typeof event.data.is_buy !== "boolean" ||
        typeof event.data.collateral !== "bigint" || typeof event.data.shares !== "bigint") continue;
      entries.push({ kind: event.data.is_buy ? "buy" : "sell", time, marketId: String(event.data.market_id),
        outcome: outcome.tag, collateral: event.data.collateral, shares: event.data.shares, txHash: event.txHash });
    } else if (event.name === "Redeemed") {
      if (event.data.holder !== wallet || typeof event.data.payout !== "bigint") continue;
      entries.push({ kind: "redeem", time, marketId: String(event.data.market_id), payout: event.data.payout, txHash: event.txHash });
    } else if (event.name === "MarketCreated") {
      const seed = event.data.seed_amount;
      const initial = event.data.initial_yes_bps;
      if (event.data.creator !== wallet || typeof seed !== "bigint" || typeof initial !== "number") continue;
      const { creatorYes, creatorNo } = seedReserves(seed, BigInt(initial));
      entries.push({ kind: "seed", time, marketId: String(event.data.market_id), seed, yesShares: creatorYes, noShares: creatorNo, txHash: event.txHash });
    }
  }
  // Stable sort: equal times keep event order (RPC returns ascending ids).
  return entries.sort((a, b) => a.time - b.time);
}

/**
 * Replays the ledger over the union of entry times and sampleTimes.
 * Mark value floors per side (conservative). When priceAt returns null for a
 * market with open shares, the last known price is reused and the point is
 * flagged partial; with no known price the market contributes 0.
 */
export function equitySeries(
  ledger: LedgerEntry[],
  priceAt: (marketId: string, time: number) => bigint | null,
  sampleTimes: number[],
): EquityPoint[] {
  const times = [...new Set([...ledger.map(entry => entry.time), ...sampleTimes])].sort((a, b) => a - b);
  const holdings = new Map<string, Holdings>();
  const lastPrice = new Map<string, bigint>();
  let cashFlow = 0n;
  let index = 0;
  const points: EquityPoint[] = [];
  for (const time of times) {
    while (index < ledger.length && ledger[index].time <= time) {
      const entry = ledger[index++];
      let held = holdings.get(entry.marketId);
      if (!held) holdings.set(entry.marketId, (held = { yes: 0n, no: 0n }));
      if (entry.kind === "redeem") { held.yes = 0n; held.no = 0n; cashFlow += entry.payout; }
      else if (entry.kind === "seed") { held.yes += entry.yesShares; held.no += entry.noShares; cashFlow -= entry.seed; }
      else if (entry.kind === "buy") { held[entry.outcome === "Yes" ? "yes" : "no"] += entry.shares; cashFlow -= entry.collateral; }
      else { held[entry.outcome === "Yes" ? "yes" : "no"] -= entry.shares; cashFlow += entry.collateral; }
    }
    let markValue = 0n;
    let partial = false;
    for (const [marketId, held] of holdings) {
      if (held.yes === 0n && held.no === 0n) continue;
      let price = priceAt(marketId, time);
      if (price === null) {
        partial = true;
        const cached = lastPrice.get(marketId);
        if (cached === undefined) continue;
        price = cached;
      } else {
        lastPrice.set(marketId, price);
      }
      markValue += (held.yes * price) / BPS + (held.no * (BPS - price)) / BPS;
    }
    points.push({ time, cashFlow, markValue, equity: cashFlow + markValue, partial });
  }
  return points;
}

/**
 * Win rate: resolved Yes/No markets the wallet has redeemed, counted as a win
 * when the wallet's net cash flow for that market is positive; null when none qualify.
 */
export function kpis(
  ledger: LedgerEntry[],
  last: EquityPoint,
  resolved: Map<string, "Yes" | "No" | "Void">,
): { totalPnl: bigint; volume: bigint; marketsTraded: number; winRateBps: bigint | null } {
  let volume = 0n;
  const cash = new Map<string, bigint>();
  const redeemed = new Set<string>();
  for (const entry of ledger) {
    const flow = entry.kind === "redeem" ? entry.payout
      : entry.kind === "seed" ? -entry.seed
      : entry.kind === "buy" ? -entry.collateral
      : entry.collateral;
    cash.set(entry.marketId, (cash.get(entry.marketId) ?? 0n) + flow);
    if (entry.kind === "buy") volume += entry.collateral;
    else if (entry.kind === "seed") volume += entry.seed;
    if (entry.kind === "redeem") redeemed.add(entry.marketId);
  }
  let wins = 0;
  let finished = 0;
  for (const [marketId, outcome] of resolved) {
    if (outcome === "Void" || !redeemed.has(marketId)) continue;
    finished++;
    if ((cash.get(marketId) ?? 0n) > 0n) wins++;
  }
  return {
    totalPnl: last.equity,
    volume,
    marketsTraded: cash.size,
    winRateBps: finished === 0 ? null : (BigInt(wins) * BPS) / BigInt(finished),
  };
}
