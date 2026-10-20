/**
 * Exact bigint depth inversions for the FPMM in generated/fpmm.ts.
 *
 * Rounding contract (documented per acceptance criteria):
 * - `collateralToReachYesBps` / `collateralToReachNoBps` return the *minimal*
 *   `collateralIn` whose forward `calcBuy` post-trade price reaches
 *   `targetBps` (price floors, so one unit less must fail to reach).
 * - `sellYesToBps` returns the *maximal* `collateralOut` whose forward
 *   `calcSell` post-trade price stays `>= targetBps` (one unit more either
 *   drops below the target or hits insufficient liquidity).
 */
import {
  BPS,
  MAX_SETS,
  MathError,
  calcBuy,
  calcSell,
  isqrt,
  priceYesBps,
} from "./generated/fpmm";

function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  if (a < 0n || b < 0n || c <= 0n) throw new MathError("invalid input");
  return (a * b) / c;
}

function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  if (a < 0n || b < 0n || c <= 0n) throw new MathError("invalid input");
  const p = a * b;
  const q = p / c;
  return p % c !== 0n ? q + 1n : q;
}

/** True when `calcBuy` at `c` lands at or past `targetBps` (MathError = no). */
function buyReaches(rBought: bigint, rOther: bigint, c: bigint, feeBps: bigint, targetBps: bigint): boolean {
  try {
    const q = calcBuy(rBought, rOther, c, feeBps);
    return priceYesBps(q.newReserveBought, q.newReserveOther) >= targetBps;
  } catch (e) {
    if (e instanceof MathError) return false;
    throw e;
  }
}

/**
 * Minimal collateralIn buying YES (rYes vs rNo) that reaches `targetBps`.
 * Returns null when the target is not above the current price, unreachable,
 * or the fee makes every trade invalid.
 */
export function collateralToReachYesBps(
  rYes: bigint,
  rNo: bigint,
  targetBps: bigint,
  feeBps: bigint,
): { collateralIn: bigint; reachedBps: bigint } | null {
  if (rYes <= 0n || rNo <= 0n || feeBps < 0n || feeBps >= BPS || targetBps >= BPS) return null;
  if (targetBps <= priceYesBps(rYes, rNo)) return null;
  // Continuous seed: newNo ~= sqrt(rYes*rNo*t/(BPS-t)); ceil-rounded fee on top.
  const newNo0 = isqrt(mulDivFloor(rYes * rNo, targetBps, BPS - targetBps));
  const net0 = newNo0 > rNo ? newNo0 - rNo : 1n;
  const collateral0 = mulDivCeil(net0, BPS, BPS - feeBps);
  let lo = collateral0 / 2n;
  if (lo < 1n) lo = 1n;
  let hi = collateral0 * 2n + 2n;
  let iter = 0;
  while (!buyReaches(rYes, rNo, hi, feeBps, targetBps) && iter < 64) {
    lo = hi;
    hi *= 2n;
    iter++;
  }
  if (!buyReaches(rYes, rNo, hi, feeBps, targetBps)) return null;
  while (lo < hi && iter < 64) {
    const midC = (lo + hi) / 2n;
    if (buyReaches(rYes, rNo, midC, feeBps, targetBps)) hi = midC;
    else lo = midC + 1n;
    iter++;
  }
  if (!buyReaches(rYes, rNo, lo, feeBps, targetBps)) return null;
  const q = calcBuy(rYes, rNo, lo, feeBps);
  return { collateralIn: lo, reachedBps: priceYesBps(q.newReserveBought, q.newReserveOther) };
}

/**
 * Minimal collateralIn buying NO that pushes the YES price down to
 * `targetBps`. Mirror of collateralToReachYesBps on swapped reserves.
 */
export function collateralToReachNoBps(
  rYes: bigint,
  rNo: bigint,
  targetBps: bigint,
  feeBps: bigint,
): { collateralIn: bigint; reachedBps: bigint } | null {
  return collateralToReachYesBps(rNo, rYes, BPS - targetBps, feeBps);
}

/** True when `calcSell` at `c` is valid and post-trade price stays >= target. */
function sellStays(rSold: bigint, rOther: bigint, c: bigint, feeBps: bigint, targetBps: bigint): boolean {
  try {
    const q = calcSell(rSold, rOther, c, feeBps);
    return priceYesBps(q.newReserveSold, q.newReserveOther) >= targetBps;
  } catch (e) {
    if (e instanceof MathError) return false;
    throw e;
  }
}

/**
 * Maximal collateralOut selling YES that keeps the post-trade YES price
 * `>= targetBps`. Null when even one unit of collateral drops below target
 * (or inputs are invalid).
 */
export function sellYesToBps(
  rYes: bigint,
  rNo: bigint,
  targetBps: bigint,
  feeBps: bigint,
): { collateralOut: bigint; sharesIn: bigint; reachedBps: bigint } | null {
  if (rYes <= 0n || rNo <= 0n || feeBps < 0n || feeBps >= BPS) return null;
  if (!sellStays(rYes, rNo, 1n, feeBps, targetBps)) return null;
  let lo = 1n;
  let hi = 2n;
  while (sellStays(rYes, rNo, hi, feeBps, targetBps)) {
    lo = hi;
    hi *= 2n;
  }
  while (lo + 1n < hi) {
    const midC = (lo + hi) / 2n;
    if (sellStays(rYes, rNo, midC, feeBps, targetBps)) lo = midC;
    else hi = midC;
  }
  const q = calcSell(rYes, rNo, lo, feeBps);
  return { collateralOut: lo, sharesIn: q.sharesIn, reachedBps: priceYesBps(q.newReserveSold, q.newReserveOther) };
}

export interface DepthLevel {
  bps: bigint;
  cumulative: bigint;
  shares: bigint;
  side: "buyYes" | "sellYes" | "buyNo" | "sellNo";
  capped?: string;
}

/** Drop (dev: throw on) levels whose cumulative does not strictly grow with |bps - mid|. */
function enforceMonotonic(levels: DepthLevel[], mid: bigint): DepthLevel[] {
  const out: DepthLevel[] = [];
  let prevDist = 0n;
  let prevCum = 0n;
  for (const l of levels) {
    const dist = l.bps > mid ? l.bps - mid : mid - l.bps;
    if (dist <= prevDist || l.cumulative <= prevCum) {
      if (process.env.NODE_ENV !== "production") {
        throw new Error(`depth curve not monotonic on ${l.side} at ${l.bps} bps`);
      }
      console.warn(`depthCurve: dropping non-monotonic ${l.side} level at ${l.bps} bps`);
      continue;
    }
    out.push(l);
    prevDist = dist;
    prevCum = l.cumulative;
  }
  return out;
}

/**
 * Synthetic depth curve: per-side grid of collateral to/from the pool at
 * `stepBps` increments of the YES price (default 50, capped at 80 levels per
 * side, grid bounded to [100, 9900] bps). MAX_SETS and insufficient liquidity
 * end a side with a `capped` label instead of throwing.
 */
export function depthCurve(
  market: { reserve_yes: bigint; reserve_no: bigint; fee_bps: number; sets_minted: bigint },
  opts?: { stepBps?: bigint; maxLevels?: number },
): { mid: bigint; levels: DepthLevel[] } {
  const rYes = market.reserve_yes;
  const rNo = market.reserve_no;
  const feeBps = BigInt(market.fee_bps);
  const sets = market.sets_minted;
  const step = opts?.stepBps ?? 50n;
  const maxLevels = opts?.maxLevels ?? 80;
  const mid = priceYesBps(rYes, rNo);

  const upGrid: bigint[] = [];
  const downGrid: bigint[] = [];
  for (let i = 1; i <= maxLevels; i++) {
    const up = mid + BigInt(i) * step;
    if (up <= 9900n) upGrid.push(up);
    const down = mid - BigInt(i) * step;
    if (down >= 100n) downGrid.push(down);
    if (up > 9900n && down < 100n) break;
  }

  const buyYes: DepthLevel[] = [];
  for (const bps of upGrid) {
    const r = collateralToReachYesBps(rYes, rNo, bps, feeBps);
    if (!r) break;
    let net: bigint;
    let shares: bigint;
    try {
      const q = calcBuy(rYes, rNo, r.collateralIn, feeBps);
      net = q.net;
      shares = q.sharesOut;
    } catch {
      break;
    }
    if (sets + net > MAX_SETS) {
      buyYes.push({ bps, cumulative: r.collateralIn, shares, side: "buyYes", capped: "market-too-large" });
      break;
    }
    buyYes.push({ bps, cumulative: r.collateralIn, shares, side: "buyYes" });
  }

  const sellYes: DepthLevel[] = [];
  for (const bps of downGrid) {
    const r = sellYesToBps(rYes, rNo, bps, feeBps);
    if (!r) break;
    sellYes.push({ bps, cumulative: r.collateralOut, shares: r.sharesIn, side: "sellYes" });
  }

  // NO side: buying NO pushes YES down (swapped-reserve buy), selling NO
  // pushes YES up (swapped-reserve sell at mirrored target).
  const buyNo: DepthLevel[] = [];
  for (const bps of downGrid) {
    const r = collateralToReachYesBps(rNo, rYes, BPS - bps, feeBps);
    if (!r) break;
    let net: bigint;
    let shares: bigint;
    try {
      const q = calcBuy(rNo, rYes, r.collateralIn, feeBps);
      net = q.net;
      shares = q.sharesOut;
    } catch {
      break;
    }
    if (sets + net > MAX_SETS) {
      buyNo.push({ bps, cumulative: r.collateralIn, shares, side: "buyNo", capped: "market-too-large" });
      break;
    }
    buyNo.push({ bps, cumulative: r.collateralIn, shares, side: "buyNo" });
  }

  const sellNo: DepthLevel[] = [];
  for (const bps of upGrid) {
    const r = sellYesToBps(rNo, rYes, BPS - bps, feeBps);
    if (!r) break;
    sellNo.push({ bps, cumulative: r.collateralOut, shares: r.sharesIn, side: "sellNo" });
  }

  const levels = [
    ...enforceMonotonic(buyYes, mid),
    ...enforceMonotonic(sellYes, mid),
    ...enforceMonotonic(buyNo, mid),
    ...enforceMonotonic(sellNo, mid),
  ];
  return { mid, levels };
}
