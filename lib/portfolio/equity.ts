import type { ChainEvent } from "@/lib/stellar/events";
import type { PricePoint } from "@/lib/stellar/price-history";
import { BPS, seedReserves } from "@/lib/stellar/generated/fpmm";
import { midValue, valueHolding, type Holding, type MarketState } from "./valuation";

export type Resolution = "Yes" | "No" | "Void";

type LedgerMeta = { id?: string; ledger?: number; fee?: bigint };

export type LedgerEntry =
  | (LedgerMeta & { kind: "buy" | "sell"; time: number; marketId: string; outcome: "Yes" | "No"; collateral: bigint; shares: bigint; txHash: string })
  | (LedgerMeta & { kind: "seed"; time: number; marketId: string; seed: bigint; yesShares: bigint; noShares: bigint; txHash: string })
  | (LedgerMeta & { kind: "redeem"; time: number; marketId: string; payout: bigint; txHash: string })
  | (LedgerMeta & { kind: "pool-claim"; time: number; marketId: string; payout: bigint; txHash: string });

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
      entries.push({ id: event.id, ledger: event.ledger, fee: typeof event.data.fee === "bigint" ? event.data.fee : undefined,
        kind: event.data.is_buy ? "buy" : "sell", time, marketId: String(event.data.market_id),
        outcome: outcome.tag, collateral: event.data.collateral, shares: event.data.shares, txHash: event.txHash });
    } else if (event.name === "Redeemed") {
      if (event.data.holder !== wallet || typeof event.data.payout !== "bigint") continue;
      entries.push({ id: event.id, ledger: event.ledger, kind: "redeem", time, marketId: String(event.data.market_id), payout: event.data.payout, txHash: event.txHash });
    } else if (event.name === "PoolRemainderClaimed") {
      if (event.data.creator !== wallet || typeof event.data.payout !== "bigint") continue;
      entries.push({ id: event.id, ledger: event.ledger, kind: "pool-claim", time, marketId: String(event.data.market_id), payout: event.data.payout, txHash: event.txHash });
    } else if (event.name === "MarketCreated") {
      const seed = event.data.seed_amount;
      const initial = event.data.initial_yes_bps;
      if (event.data.creator !== wallet || typeof seed !== "bigint" || typeof initial !== "number") continue;
      const { creatorYes, creatorNo } = seedReserves(seed, BigInt(initial));
      entries.push({ id: event.id, ledger: event.ledger, kind: "seed", time, marketId: String(event.data.market_id), seed, yesShares: creatorYes, noShares: creatorNo, txHash: event.txHash });
    }
  }
  // Stable sort: equal times keep event order (RPC returns ascending ids).
  return entries.sort((a, b) => a.time - b.time);
}

export type PriceOrReserves =
  | bigint
  | { reserveYes: bigint; reserveNo: bigint; yesBps?: bigint };

/**
 * Replays the ledger over the union of entry times and sampleTimes.
 * Mark value uses exact reserves when present (via midValue), falling back to bps.
 * When priceAt returns null for a market with open shares, the last known price
 * is reused and the point is flagged partial; with no known price the market contributes 0.
 */
export function equitySeries(
  ledger: LedgerEntry[],
  priceAt: (marketId: string, time: number) => PriceOrReserves | null,
  sampleTimes: number[],
): EquityPoint[] {
  const times = [...new Set([...ledger.map(entry => entry.time), ...sampleTimes])].sort((a, b) => a - b);
  const holdings = new Map<string, Holdings>();
  const lastPrice = new Map<string, PriceOrReserves>();
  let cashFlow = 0n;
  let index = 0;
  const points: EquityPoint[] = [];
  for (const time of times) {
    while (index < ledger.length && ledger[index].time <= time) {
      const entry = ledger[index++];
      let held = holdings.get(entry.marketId);
      if (!held) holdings.set(entry.marketId, (held = { yes: 0n, no: 0n }));
      if (entry.kind === "redeem") { held.yes = 0n; held.no = 0n; cashFlow += entry.payout; }
      else if (entry.kind === "pool-claim") { cashFlow += entry.payout; }
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
      if (typeof price === "object" && price !== null && "reserveYes" in price && "reserveNo" in price) {
        markValue += midValue(price.reserveYes, price.reserveNo, held.yes, held.no);
      } else {
        const bps = typeof price === "bigint" ? price : price.yesBps ?? 0n;
        markValue += (held.yes * bps) / BPS + (held.no * (BPS - bps)) / BPS;
      }
    }
    points.push({ time, cashFlow, markValue, equity: cashFlow + markValue, partial });
  }
  return points;
}

export interface EquityCoverageEntry {
  fromLedger: number;
  complete: boolean;
  reason?: "retention" | "partial";
}

export interface ExactEquityOptions {
  streams: Record<string, readonly PricePoint[]>;
  feeBps: Record<string, bigint>;
  finals: Record<string, Resolution>;
  closeTimes?: Record<string, bigint>;
  coverage?: Record<string, EquityCoverageEntry>;
  basis?: "liquidation" | "mid";
  reconcileFinals?: boolean;
}

export interface ExactEquityPoint {
  ledger: number;
  time: number;
  cashFlow: bigint;
  mid: bigint;
  liquidation: bigint;
  markValue: bigint;
  equity: bigint;
  partial: boolean;
  lower: bigint;
  upper: bigint;
}

type ExactEvent =
  | { ledger: number; order: string; kind: "ledger"; entry: LedgerEntry }
  | { ledger: number; order: string; kind: "price"; marketId: string; point: PricePoint };

export function exactEquitySeries(
  ledger: readonly LedgerEntry[],
  opts: ExactEquityOptions,
): ExactEquityPoint[] {
  const events: ExactEvent[] = [];
  ledger.forEach((entry, index) => {
    events.push({
      ledger: entry.ledger ?? 0,
      order: entry.id ?? `ledger-${index}`,
      kind: "ledger",
      entry,
    });
  });
  for (const [marketId, points] of Object.entries(opts.streams)) {
    points.forEach((point, index) => {
      events.push({ ledger: point.ledger, order: point.eventId || `price-${marketId}-${index}`, kind: "price", marketId, point });
    });
  }
  events.sort((a, b) => a.ledger - b.ledger || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  const holdings = new Map<string, Holdings>();
  const reserves = new Map<string, { reserveYes: bigint; reserveNo: bigint }>();
  const prices = new Map<string, bigint>();
  const statuses = new Map<string, MarketState["status"]>();
  let cashFlow = 0n;
  const points: ExactEquityPoint[] = [];
  const basis = opts.basis ?? "liquidation";

  const emit = (currentLedger: number, time: number) => {
    let mid = 0n;
    let liquidation = 0n;
    let markValue = 0n;
    let lower = cashFlow;
    let upper = cashFlow;
    let partial = false;
    const timeSec = BigInt(Math.floor(time / 1000));

    for (const [marketId, held] of holdings) {
      if (held.yes === 0n && held.no === 0n) continue;
      const status = statuses.get(marketId) ?? "Open";
      const reserve = reserves.get(marketId);
      const market: MarketState = {
        reserveYes: reserve?.reserveYes ?? 0n,
        reserveNo: reserve?.reserveNo ?? 0n,
        feeBps: opts.feeBps[marketId] ?? 0n,
        status,
        closeTime: opts.closeTimes?.[marketId] ?? timeSec,
      };
      const valuation = valueHolding(market, held as Holding, timeSec);
      let mark = status === "Open" ? (basis === "mid" ? valuation.mid : valuation.liquidation.value) : (valuation.resolution ?? 0n);
      if (status === "Open" && mark === 0n && reserve === undefined) {
        const bps = prices.get(marketId);
        if (bps !== undefined) mark = (held.yes * bps) / BPS + (held.no * (BPS - bps)) / BPS;
      }
      mid += valuation.mid;
      liquidation += status === "Open" ? valuation.liquidation.value : (valuation.resolution ?? 0n);
      markValue += mark;
      lower += mark;
      upper += mark;

      const coverage = opts.coverage?.[marketId];
      if (coverage && !coverage.complete && currentLedger < coverage.fromLedger) {
        partial = true;
        lower -= mark;
        upper = upper - mark + (held.yes > held.no ? held.yes : held.no);
      }
    }

    points.push({
      ledger: currentLedger,
      time,
      cashFlow,
      mid,
      liquidation,
      markValue,
      equity: cashFlow + markValue,
      partial,
      lower,
      upper,
    });
  };

  for (let cursor = 0; cursor < events.length;) {
    const currentLedger = events[cursor].ledger;
    let time = 0;
    let changed = false;
    while (cursor < events.length && events[cursor].ledger === currentLedger) {
      const event = events[cursor++];
      if (event.kind === "ledger") {
        const entry = event.entry;
        time = Math.max(time, entry.time);
        changed = true;
        let held = holdings.get(entry.marketId);
        if (!held) holdings.set(entry.marketId, (held = { yes: 0n, no: 0n }));
        if (entry.kind === "redeem") { held.yes = 0n; held.no = 0n; cashFlow += entry.payout; }
        else if (entry.kind === "pool-claim") cashFlow += entry.payout;
        else if (entry.kind === "seed") { held.yes += entry.yesShares; held.no += entry.noShares; cashFlow -= entry.seed; }
        else if (entry.kind === "buy") { held[entry.outcome === "Yes" ? "yes" : "no"] += entry.shares; cashFlow -= entry.collateral; }
        else { held[entry.outcome === "Yes" ? "yes" : "no"] -= entry.shares; cashFlow += entry.collateral; }
        continue;
      }

      const point = event.point;
      time = Math.max(time, point.time * 1000);
      prices.set(event.marketId, point.yesBps);
      if (point.kind === "resolved") {
        statuses.set(event.marketId, opts.finals[event.marketId] ?? "Void");
        changed = true;
      } else if (point.kind === "trade" && point.reserveYes !== undefined && point.reserveNo !== undefined) {
        reserves.set(event.marketId, { reserveYes: point.reserveYes, reserveNo: point.reserveNo });
        changed = true;
      }
    }
    if (!changed) continue;
    emit(currentLedger, time);
  }

  if (opts.reconcileFinals && points.length > 0) {
    let needsReconcile = false;
    for (const [marketId, held] of holdings) {
      if ((held.yes > 0n || held.no > 0n) && opts.finals[marketId] && statuses.get(marketId) !== opts.finals[marketId]) {
        statuses.set(marketId, opts.finals[marketId]);
        needsReconcile = true;
      }
    }
    if (needsReconcile) {
      const last = points[points.length - 1];
      emit(last.ledger, last.time);
    }
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
    const flow = entry.kind === "redeem" || entry.kind === "pool-claim" ? entry.payout
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
