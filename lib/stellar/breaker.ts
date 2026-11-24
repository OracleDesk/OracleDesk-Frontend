import type { OutcomeTag } from "./clients";
import { BPS, calcBuy, calcSell, MathError, priceYesBps } from "./generated/fpmm";
import type { BandState, BreakerConfig } from "./generated/market-core";

export type BreakerCode = "PriceImpactTooHigh" | "PriceBandExceeded";

export type BreakerVerdict =
  | { ok: true }
  | { ok: false; code: BreakerCode; moveBps: bigint; limitBps: bigint };

export interface BreakerMarket {
  reserveYes: bigint;
  reserveNo: bigint;
  feeBps: bigint;
}

export type BreakerTrade =
  | { kind: "buy"; collateralIn: bigint }
  | { kind: "sell"; collateralOut: bigint };

export interface BreakerLimits {
  impactBps: bigint;
  bandBps: bigint;
}

const absDiff = (a: bigint, b: bigint): bigint => (a > b ? a - b : b - a);

export function breakerLimits(cfg: BreakerConfig | null | undefined): BreakerLimits {
  if (!cfg) return { impactBps: 0n, bandBps: 0n };
  return { impactBps: BigInt(cfg.max_impact_bps), bandBps: BigInt(cfg.band_bps) };
}

export function isCurrentBand(band: BandState | null | undefined, ledgerSeq: number): boolean {
  return Boolean(band && band.ledger_seq === ledgerSeq);
}

function postTradeYesBps(
  market: BreakerMarket,
  side: OutcomeTag,
  trade: BreakerTrade,
): bigint {
  const feeBps = market.feeBps;
  let newYes: bigint;
  let newNo: bigint;

  if (trade.kind === "buy") {
    const [rBought, rOther] =
      side === "Yes"
        ? [market.reserveYes, market.reserveNo]
        : [market.reserveNo, market.reserveYes];
    const quote = calcBuy(rBought, rOther, trade.collateralIn, feeBps);
    newYes = side === "Yes" ? quote.newReserveBought : quote.newReserveOther;
    newNo = side === "Yes" ? quote.newReserveOther : quote.newReserveBought;
  } else {
    const [rSold, rOther] =
      side === "Yes"
        ? [market.reserveYes, market.reserveNo]
        : [market.reserveNo, market.reserveYes];
    const quote = calcSell(rSold, rOther, trade.collateralOut, feeBps);
    newYes = side === "Yes" ? quote.newReserveSold : quote.newReserveOther;
    newNo = side === "Yes" ? quote.newReserveOther : quote.newReserveSold;
  }

  return priceYesBps(newYes, newNo);
}

/**
 * The YES price moves monotonically with collateral for a fixed side, so the
 * breaker verdict is monotone in trade size and a binary search finds the
 * largest passing amount: once a size trips a breaker, every larger size does
 * too. The ledger band is included because its reference is fixed for the
 * ledger and the price only moves further from it as size grows.
 */
export function checkBreakers(
  market: BreakerMarket,
  cfg: BreakerConfig | null | undefined,
  band: BandState | null | undefined,
  side: OutcomeTag,
  trade: BreakerTrade,
): BreakerVerdict {
  const { impactBps, bandBps } = breakerLimits(cfg);
  if (impactBps <= 0n && bandBps <= 0n) return { ok: true };

  try {
    const pre = priceYesBps(market.reserveYes, market.reserveNo);
    const post = postTradeYesBps(market, side, trade);

    if (impactBps > 0n) {
      const move = absDiff(post, pre);
      if (move > impactBps) {
        return { ok: false, code: "PriceImpactTooHigh", moveBps: move, limitBps: impactBps };
      }
    }

    if (bandBps > 0n && band) {
      const move = absDiff(post, BigInt(band.ref_price_bps));
      if (move > bandBps) {
        return { ok: false, code: "PriceBandExceeded", moveBps: move, limitBps: bandBps };
      }
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof MathError) return { ok: true };
    throw error;
  }
}

export function maxBuyWithinBreakers(
  market: BreakerMarket,
  cfg: BreakerConfig | null | undefined,
  band: BandState | null | undefined,
  side: OutcomeTag,
  cap: bigint,
): bigint {
  if (cap <= 0n) return 0n;
  if (checkBreakers(market, cfg, band, side, { kind: "buy", collateralIn: cap }).ok) return cap;

  let low = 0n;
  let high = cap;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    if (checkBreakers(market, cfg, band, side, { kind: "buy", collateralIn: mid }).ok) low = mid;
    else high = mid;
  }
  return low;
}

export function priceMoveBps(
  market: BreakerMarket,
  side: OutcomeTag,
  trade: BreakerTrade,
): { beforeBps: bigint; afterBps: bigint; moveBps: bigint } {
  try {
    const beforeBps = priceYesBps(market.reserveYes, market.reserveNo);
    const yesAfter = postTradeYesBps(market, side, trade);
    const afterBps = side === "Yes" ? yesAfter : BPS - yesAfter;
    const sideBefore = side === "Yes" ? beforeBps : BPS - beforeBps;
    return { beforeBps: sideBefore, afterBps, moveBps: absDiff(afterBps, sideBefore) };
  } catch (error) {
    if (error instanceof MathError) return { beforeBps: 0n, afterBps: 0n, moveBps: 0n };
    throw error;
  }
}
