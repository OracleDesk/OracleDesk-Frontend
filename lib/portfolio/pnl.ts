import { BPS, seedReserves, settleValue } from "../stellar/generated/fpmm";
import { mulDivFloor } from "../stellar/units";

/**
 * Pure bigint cost-basis and PnL replay engine for market-core positions.
 *
 * Accounting and rounding rules:
 * 1. Base units only: every share count, collateral amount, fee and PnL figure
 *    is a bigint in 7-decimal USDC base units (stroop-scale). Floating-point
 *    conversions are never used anywhere in this module.
 * 2. Average-cost buys: on a buy of `shares` for `collateral` (which in
 *    market-core is the full `collateral_in` transferred by the trader,
 *    inclusive of the protocol fee), `leg.shares += shares`,
 *    `leg.cost += collateral`, and `leg.fees += fee`.
 * 3. Drift-free partial sells: on a sell of `s` shares for `c` (`collateral_out`
 *    received by the trader after the fee), the cost removed is:
 *      removed = (s === leg.shares) ? leg.cost : mulDivFloor(leg.cost, s, leg.shares)
 *    Flooring leaves any sub-stroop rounding residue in the remaining cost
 *    basis, and the final sell (`s === leg.shares`) removes all remaining cost.
 *    Consequently, the sum of `realized = c - removed` over any partition of a
 *    position telescopes to the exact single-exit realized PnL with zero drift,
 *    and closing a leg always resets `leg.cost` to `0n`.
 * 4. Oversells (incomplete history): if a sell's `shares` exceeds `leg.shares`
 *    (for instance when earlier buys fell outside the RPC retention window),
 *    the sold share count is clamped to `leg.shares`, all known cost is
 *    removed, and an entry is appended to `anomalies`. Cost basis and share
 *    counts never go negative.
 * 5. Redemptions and void allocation: `redeem` settles both legs at once.
 *    On `Yes`, the YES leg receives `yes.shares` (1 base unit per winning share)
 *    and NO receives `0n`; on `No`, the reverse. On `Void`, the contract pays
 *    `settleValue("void", y, n) = (y + n) / 2n` (flooring once on the sum), and
 *    the payout is allocated across legs via
 *      yesPart = mulDivFloor(payout, y, y + n),  noPart = payout - yesPart
 *    so `yesPart + noPart === payout` even when `y + n` is odd.
 *    `redemptionPnl = payout - (yes.cost + no.cost)`, and both legs are zeroed.
 *    If the event's `payout` differs from `settleValue(kind, yes.shares, no.shares)`,
 *    the on-chain event is trusted and the discrepancy is recorded in `anomalies`.
 * 6. Resolved without redeem: when a market has resolved (`Yes`, `No` or `Void`)
 *    but has not yet been redeemed, `unrealizedAt` marks the held shares at
 *    `settleValue` rather than a mid price.
 * 7. Mark-to-mid for open markets: `unrealizedAt(m, yesBps)` computes
 *      value = mulDivFloor(yes.shares, yesBps, BPS) + mulDivFloor(no.shares, BPS - yesBps, BPS)
 *      unrealized = value - (yes.cost + no.cost)
 *    Note that mid price overstates executable exit value on an FPMM because
 *    selling moves the price along the constant-product curve and pays fees;
 *    use `lib/portfolio/valuation.ts` for liquidation-value marking.
 * 8. Creator seed shares policy: `create_market` mints complete sets from
 *    `seed_amount`, places `reserveYes` and `reserveNo` into the pool, and
 *    credits leftover `creatorYes` / `creatorNo` shares to the creator without
 *    emitting a `Trade` event. `seedCostBasis(seed, initialYesBps)` values those
 *    leftover shares at the opening price and treats the remainder of the seed
 *    as LP capital outside this trading PnL engine. Callers may also supply an
 *    explicit `costBasis` on a `seed` event.
 * 9. Deterministic, idempotent replay: events are sorted by `(ledger, id)` and
 *    deduplicated by `id` before replay.
 */

export type PnlEvent =
  | {
      kind: "trade";
      id: string;
      ledger: number;
      marketId: string;
      outcome: "Yes" | "No";
      isBuy: boolean;
      collateral: bigint;
      shares: bigint;
      fee: bigint;
      time?: string;
    }
  | {
      kind: "seed";
      id: string;
      ledger: number;
      marketId: string;
      yes: bigint;
      no: bigint;
      costBasis: bigint;
      time?: string;
    }
  | {
      kind: "resolved";
      id: string;
      ledger: number;
      marketId: string;
      outcome: "Yes" | "No" | "Void";
      time?: string;
    }
  | {
      kind: "redeem";
      id: string;
      ledger: number;
      marketId: string;
      payout: bigint;
      time?: string;
    };

export interface Leg {
  shares: bigint;
  cost: bigint;
  realized: bigint;
  fees: bigint;
  bought: bigint;
  sold: bigint;
}

export interface MarketPnl {
  yes: Leg;
  no: Leg;
  resolution: "Open" | "Yes" | "No" | "Void";
  redeemed: boolean;
  redemptionPnl: bigint;
  anomalies: string[];
}

export interface PnlRealization {
  id: string;
  ledger: number;
  time: string;
  marketId: string;
  outcome: "YES" | "NO" | "BOTH";
  realized: bigint;
  costRemoved: bigint;
  note: string;
}

export interface PnlTotals {
  cost: bigint;
  realized: bigint;
  unrealized: bigint;
  redemption: bigint;
  fees: bigint;
}

function emptyLeg(): Leg {
  return {
    shares: 0n,
    cost: 0n,
    realized: 0n,
    fees: 0n,
    bought: 0n,
    sold: 0n,
  };
}

function emptyMarketPnl(): MarketPnl {
  return {
    yes: emptyLeg(),
    no: emptyLeg(),
    resolution: "Open",
    redeemed: false,
    redemptionPnl: 0n,
    anomalies: [],
  };
}

/**
 * Allocates a redemption payout across YES and NO holdings.
 * For Void (or unknown open resolution), `yesPart = floor(payout * y / (y + n))`
 * and `noPart = payout - yesPart`, so the parts always sum to `payout`.
 */
export function allocateRedemptionPayout(
  resolution: MarketPnl["resolution"],
  yesShares: bigint,
  noShares: bigint,
  payout: bigint,
): { yesPart: bigint; noPart: bigint } {
  if (payout <= 0n) return { yesPart: 0n, noPart: 0n };
  if (resolution === "Yes") return { yesPart: payout, noPart: 0n };
  if (resolution === "No") return { yesPart: 0n, noPart: payout };
  const totalShares = yesShares + noShares;
  if (totalShares <= 0n) return { yesPart: payout, noPart: 0n };
  const yesPart = mulDivFloor(payout, yesShares, totalShares);
  return { yesPart, noPart: payout - yesPart };
}

/**
 * Default policy for valuing leftover creator shares from `create_market` at the
 * opening price (`initialYesBps`). The remainder of `seed` is LP capital in the
 * FPMM reserves and is outside user position cost-basis accounting.
 */
export function seedCostBasis(seed: bigint, initialYesBps: bigint): bigint {
  const { creatorYes, creatorNo } = seedReserves(seed, initialYesBps);
  return (
    mulDivFloor(creatorYes, initialYesBps, BPS) +
    mulDivFloor(creatorNo, BPS - initialYesBps, BPS)
  );
}

/**
 * Replays events in `(ledger, id)` order, ignoring duplicate `id`s, and returns
 * both per-market PnL state and the chronological list of realizations.
 */
export function replayWithRealizations(events: readonly PnlEvent[]): {
  markets: Map<string, MarketPnl>;
  realizations: PnlRealization[];
} {
  const sorted = [...events].sort(
    (a, b) => a.ledger - b.ledger || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const seenIds = new Set<string>();
  const markets = new Map<string, MarketPnl>();
  const realizations: PnlRealization[] = [];

  const getMarket = (marketId: string): MarketPnl => {
    let m = markets.get(marketId);
    if (!m) {
      m = emptyMarketPnl();
      markets.set(marketId, m);
    }
    return m;
  };

  for (const ev of sorted) {
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);

    const m = getMarket(ev.marketId);

    switch (ev.kind) {
      case "seed": {
        const yes = ev.yes > 0n ? ev.yes : 0n;
        const no = ev.no > 0n ? ev.no : 0n;
        const basis = ev.costBasis > 0n ? ev.costBasis : 0n;
        const total = yes + no;
        const yesCost =
          total > 0n
            ? no === 0n
              ? basis
              : mulDivFloor(basis, yes, total)
            : 0n;
        const noCost = total > 0n ? basis - yesCost : 0n;

        m.yes.shares += yes;
        m.yes.cost += yesCost;
        m.yes.bought += yes;

        m.no.shares += no;
        m.no.cost += noCost;
        m.no.bought += no;
        break;
      }

      case "trade": {
        const leg = ev.outcome === "Yes" ? m.yes : m.no;
        const collateral = ev.collateral >= 0n ? ev.collateral : 0n;
        const shares = ev.shares >= 0n ? ev.shares : 0n;
        const fee = ev.fee >= 0n ? ev.fee : 0n;

        if (ev.isBuy) {
          leg.shares += shares;
          leg.cost += collateral;
          leg.fees += fee;
          leg.bought += shares;
        } else {
          leg.fees += fee;
          let soldShares = shares;
          let note = "sell";
          if (shares > leg.shares) {
            m.anomalies.push(
              `oversell on ${ev.outcome} (${ev.id}): sold ${shares.toString()} with ${leg.shares.toString()} held`,
            );
            soldShares = leg.shares;
            note = "sell (oversell clamped)";
          }
          const removed =
            soldShares === 0n || leg.shares === 0n
              ? 0n
              : soldShares === leg.shares
                ? leg.cost
                : mulDivFloor(leg.cost, soldShares, leg.shares);
          leg.cost -= removed;
          leg.shares -= soldShares;
          leg.sold += soldShares;
          const realizedDelta = collateral - removed;
          leg.realized += realizedDelta;

          realizations.push({
            id: ev.id,
            ledger: ev.ledger,
            time: ev.time ?? "",
            marketId: ev.marketId,
            outcome: ev.outcome === "Yes" ? "YES" : "NO",
            realized: realizedDelta,
            costRemoved: removed,
            note,
          });
        }
        break;
      }

      case "resolved": {
        m.resolution = ev.outcome;
        break;
      }

      case "redeem": {
        const payout = ev.payout >= 0n ? ev.payout : 0n;
        if (m.resolution === "Open") {
          m.anomalies.push(
            `redeem (${ev.id}) before resolution event: payout ${payout.toString()}`,
          );
        } else {
          const settlementKind =
            m.resolution === "Yes"
              ? "yes"
              : m.resolution === "No"
                ? "no"
                : "void";
          const expected = settleValue(settlementKind, m.yes.shares, m.no.shares);
          if (payout !== expected) {
            m.anomalies.push(
              `redeem payout mismatch (${ev.id}): got ${payout.toString()}, expected ${expected.toString()}`,
            );
          }
        }

        const { yesPart, noPart } = allocateRedemptionPayout(
          m.resolution,
          m.yes.shares,
          m.no.shares,
          payout,
        );
        const totalCost = m.yes.cost + m.no.cost;
        const redemptionDelta = yesPart + noPart - totalCost;
        m.redemptionPnl += redemptionDelta;
        m.redeemed = true;
        m.yes.shares = 0n;
        m.yes.cost = 0n;
        m.no.shares = 0n;
        m.no.cost = 0n;

        realizations.push({
          id: ev.id,
          ledger: ev.ledger,
          time: ev.time ?? "",
          marketId: ev.marketId,
          outcome: "BOTH",
          realized: redemptionDelta,
          costRemoved: totalCost,
          note:
            m.resolution === "Void"
              ? `redeem void (yes=${yesPart.toString()}, no=${noPart.toString()})`
              : `redeem ${m.resolution.toLowerCase()}`,
        });
        break;
      }
    }
  }

  return { markets, realizations };
}

/**
 * Replays a wallet's events across markets with average-cost accounting.
 */
export function replay(events: readonly PnlEvent[]): Map<string, MarketPnl> {
  return replayWithRealizations(events).markets;
}

/**
 * Marks a market position to mid (when open) or settlement value (when resolved
 * and not yet redeemed). Floor rounding keeps valuation conservative.
 */
export function unrealizedAt(
  m: MarketPnl,
  yesBps: bigint,
): { value: bigint; unrealized: bigint } {
  const totalCost = m.yes.cost + m.no.cost;
  if (m.redeemed || (m.yes.shares === 0n && m.no.shares === 0n && totalCost === 0n)) {
    return { value: 0n, unrealized: 0n };
  }

  if (m.resolution !== "Open") {
    const kind =
      m.resolution === "Yes" ? "yes" : m.resolution === "No" ? "no" : "void";
    const value = settleValue(kind, m.yes.shares, m.no.shares);
    return { value, unrealized: value - totalCost };
  }

  const clampedBps = yesBps < 0n ? 0n : yesBps > BPS ? BPS : yesBps;
  const value =
    mulDivFloor(m.yes.shares, clampedBps, BPS) +
    mulDivFloor(m.no.shares, BPS - clampedBps, BPS);
  return { value, unrealized: value - totalCost };
}

/**
 * Sums cost basis, realized trading PnL, unrealized PnL, redemption PnL and
 * fees across all markets. Open markets without a price entry in `prices`
 * contribute `0n` to `unrealized`.
 */
export function totals(
  ms: Map<string, MarketPnl>,
  prices: Map<string, bigint>,
): PnlTotals {
  let cost = 0n;
  let realized = 0n;
  let unrealized = 0n;
  let redemption = 0n;
  let fees = 0n;

  for (const [marketId, m] of ms.entries()) {
    cost += m.yes.cost + m.no.cost;
    realized += m.yes.realized + m.no.realized;
    redemption += m.redemptionPnl;
    fees += m.yes.fees + m.no.fees;

    if (m.resolution !== "Open") {
      unrealized += unrealizedAt(m, 0n).unrealized;
    } else {
      const price = prices.get(marketId);
      if (price !== undefined) {
        unrealized += unrealizedAt(m, price).unrealized;
      }
    }
  }

  return { cost, realized, unrealized, redemption, fees };
}

export interface SerializedLeg {
  shares: string;
  cost: string;
  realized: string;
  fees: string;
  bought: string;
  sold: string;
}

export interface SerializedMarketPnl {
  yes: SerializedLeg;
  no: SerializedLeg;
  resolution: MarketPnl["resolution"];
  redeemed: boolean;
  redemptionPnl: string;
  anomalies: string[];
}

function serializeLeg(leg: Leg): SerializedLeg {
  return {
    shares: leg.shares.toString(),
    cost: leg.cost.toString(),
    realized: leg.realized.toString(),
    fees: leg.fees.toString(),
    bought: leg.bought.toString(),
    sold: leg.sold.toString(),
  };
}

function deserializeLeg(raw: SerializedLeg): Leg {
  return {
    shares: BigInt(raw.shares),
    cost: BigInt(raw.cost),
    realized: BigInt(raw.realized),
    fees: BigInt(raw.fees),
    bought: BigInt(raw.bought),
    sold: BigInt(raw.sold),
  };
}

export function serializePnl(
  ms: Map<string, MarketPnl>,
): Record<string, SerializedMarketPnl> {
  const out: Record<string, SerializedMarketPnl> = {};
  for (const [marketId, m] of ms.entries()) {
    out[marketId] = {
      yes: serializeLeg(m.yes),
      no: serializeLeg(m.no),
      resolution: m.resolution,
      redeemed: m.redeemed,
      redemptionPnl: m.redemptionPnl.toString(),
      anomalies: [...m.anomalies],
    };
  }
  return out;
}

export function deserializePnl(
  raw: Record<string, SerializedMarketPnl>,
): Map<string, MarketPnl> {
  const out = new Map<string, MarketPnl>();
  for (const [marketId, m] of Object.entries(raw)) {
    out.set(marketId, {
      yes: deserializeLeg(m.yes),
      no: deserializeLeg(m.no),
      resolution: m.resolution,
      redeemed: m.redeemed,
      redemptionPnl: BigInt(m.redemptionPnl),
      anomalies: [...m.anomalies],
    });
  }
  return out;
}
