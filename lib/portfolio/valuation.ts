import {
  BPS,
  calcSell,
  collateralOutForShares,
  MathError,
  priceYesBps,
  settleValue,
} from "../stellar/generated/fpmm";
import { mulDivFloor } from "../stellar/units";

/**
 * Mark-to-market and executable liquidation valuation for market-core holdings.
 *
 * All share counts and values are bigints in 7-decimal USDC base units.
 * Floating-point conversions are never used anywhere in this module.
 *
 * Why liquidation value differs from mid value:
 * - Mid value prices each share at the marginal FPMM spot probability
 *   (`priceYesBps(reserveYes, reserveNo)`).
 * - Selling moves the constant-product curve against the seller and deducts
 *   `feeBps` from the gross complete sets burned (`collateralOutForShares` /
 *   `calcSell`). On thin pools or large positions, `gross` approaches
 *   `rOther`, where the pool runs out of counter-reserve liquidity.
 * - For two-sided holdings (both YES and NO > 0), selling one side first
 *   shifts the reserves before the second side is sold. Because protocol fees
 *   stay in the pool and grow the invariant product, selling both sides
 *   sequentially recovers at most `min(yes, no)` sets' worth (minus fees) plus
 *   the residual side's curve value. A native on-chain `merge` entrypoint would
 *   redeem `min(yes, no)` complete sets 1:1 without curve slippage (see
 *   `docs/contract-requests.md`).
 */

export interface MarketState {
  reserveYes: bigint;
  reserveNo: bigint;
  feeBps: bigint;
  status: "Open" | "Yes" | "No" | "Void";
  closeTime: bigint;
  paused?: boolean;
}

export interface Holding {
  yes: bigint;
  no: bigint;
}

export type ValuationBasis = "liquidation" | "resolution" | "mid-only";

export type Valuation = {
  mid: bigint;
  liquidation: {
    value: bigint;
    sold: Holding;
    unsold: Holding;
    capped: boolean;
    tradable: boolean;
  };
  /** Set when `status` is final (`Yes`, `No`, or `Void`). */
  resolution: bigint | null;
  basis: ValuationBasis;
};

export interface MaxSellableResult {
  shares: bigint;
  collateral: bigint;
  newReserveSold: bigint;
  newReserveOther: bigint;
  adjustmentSteps: number;
}

const MAX_ROUNDING_ADJUSTMENT_STEPS = 8;

function tryCollateralOut(
  rSold: bigint,
  rOther: bigint,
  sharesIn: bigint,
  feeBps: bigint,
): bigint | null {
  try {
    return collateralOutForShares(rSold, rOther, sharesIn, feeBps);
  } catch (error) {
    if (error instanceof MathError) return null;
    throw error;
  }
}

/**
 * True when `sharesIn` is large enough that the FPMM quadratic root `gross` is
 * at least 1 base unit: `(sharesIn + rSold - 1) * (rOther - 1) >= rSold * rOther`.
 * When false, `grossForShares` throws because `gross === 0n` (dust), not
 * because `sharesIn` exceeded pool capacity (`gross >= rOther`).
 */
function hasAtLeastOneGrossUnit(
  rSold: bigint,
  rOther: bigint,
  sharesIn: bigint,
): boolean {
  if (sharesIn <= 0n || rOther <= 1n) return false;
  return (sharesIn + rSold - 1n) * (rOther - 1n) >= rSold * rOther;
}

/**
 * Validates that `collateral` can be exited on-chain with at most `maxShares`
 * via `calcSell`. Decrements `collateral` by at most a few base units if
 * ceiling rounding in `calcSell` would require more than `maxShares`.
 */
function ensureExecutableCollateral(
  rSold: bigint,
  rOther: bigint,
  feeBps: bigint,
  maxShares: bigint,
  initialCollateral: bigint,
): {
  collateral: bigint;
  newReserveSold: bigint;
  newReserveOther: bigint;
  adjustmentSteps: number;
} {
  let collateral = initialCollateral;
  let steps = 0;

  while (collateral > 0n && steps <= MAX_ROUNDING_ADJUSTMENT_STEPS) {
    try {
      const quote = calcSell(rSold, rOther, collateral, feeBps);
      if (quote.sharesIn <= maxShares) {
        return {
          collateral,
          newReserveSold: quote.newReserveSold,
          newReserveOther: quote.newReserveOther,
          adjustmentSteps: steps,
        };
      }
    } catch (error) {
      if (!(error instanceof MathError)) throw error;
    }
    collateral -= 1n;
    steps += 1;
  }

  return {
    collateral: 0n,
    newReserveSold: rSold,
    newReserveOther: rOther,
    adjustmentSteps: steps,
  };
}

/**
 * Finds the largest share count `s` in `[0, want]` for which
 * `collateralOutForShares` succeeds, and validates the resulting `collateral`
 * against `calcSell` so `calcSell(rSold, rOther, collateral, feeBps).sharesIn <= s`.
 */
export function maxSellable(
  rSold: bigint,
  rOther: bigint,
  feeBps: bigint,
  want: bigint,
): MaxSellableResult {
  if (want <= 0n || rSold <= 0n || rOther <= 0n || feeBps < 0n || feeBps >= BPS) {
    return {
      shares: 0n,
      collateral: 0n,
      newReserveSold: rSold > 0n ? rSold : 0n,
      newReserveOther: rOther > 0n ? rOther : 0n,
      adjustmentSteps: 0,
    };
  }

  const direct = tryCollateralOut(rSold, rOther, want, feeBps);
  if (direct !== null) {
    const validated = ensureExecutableCollateral(rSold, rOther, feeBps, want, direct);
    return {
      shares: want,
      collateral: validated.collateral,
      newReserveSold: validated.newReserveSold,
      newReserveOther: validated.newReserveOther,
      adjustmentSteps: validated.adjustmentSteps,
    };
  }

  // If `want` failed only because it is too small to produce 1 unit of gross
  // collateral (and rOther > 1), then it is dust, not over pool capacity.
  if (rOther > 1n && !hasAtLeastOneGrossUnit(rSold, rOther, want)) {
    return {
      shares: want,
      collateral: 0n,
      newReserveSold: rSold,
      newReserveOther: rOther,
      adjustmentSteps: 0,
    };
  }

  if (rOther <= 1n) {
    return {
      shares: 0n,
      collateral: 0n,
      newReserveSold: rSold,
      newReserveOther: rOther,
      adjustmentSteps: 0,
    };
  }

  // Binary-search the largest `s` in [1, want] that does not exceed pool capacity.
  let low = 0n;
  let high = want;
  let bestShares = 0n;
  let bestEstimate = 0n;

  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    const est = tryCollateralOut(rSold, rOther, mid, feeBps);
    if (est !== null) {
      bestShares = mid;
      bestEstimate = est;
      low = mid;
    } else if (!hasAtLeastOneGrossUnit(rSold, rOther, mid)) {
      // `mid` is below the 1-gross-unit threshold; capacity lies above `mid`.
      low = mid;
    } else {
      // `mid` exceeds pool liquidity (`gross >= rOther`).
      high = mid;
    }
  }

  if (bestShares === 0n || bestEstimate === 0n) {
    return {
      shares: bestShares,
      collateral: 0n,
      newReserveSold: rSold,
      newReserveOther: rOther,
      adjustmentSteps: 0,
    };
  }

  const validated = ensureExecutableCollateral(
    rSold,
    rOther,
    feeBps,
    bestShares,
    bestEstimate,
  );
  return {
    shares: bestShares,
    collateral: validated.collateral,
    newReserveSold: validated.newReserveSold,
    newReserveOther: validated.newReserveOther,
    adjustmentSteps: validated.adjustmentSteps,
  };
}

function computeMid(
  reserveYes: bigint,
  reserveNo: bigint,
  yes: bigint,
  no: bigint,
): bigint {
  if (reserveYes <= 0n || reserveNo <= 0n) return 0n;
  const total = reserveYes + reserveNo;
  if (total <= 0n) return 0n;
  const p = priceYesBps(reserveYes, reserveNo);
  const clampedP = p < 0n ? 0n : p > BPS ? BPS : p;
  const hYes = yes > 0n ? yes : 0n;
  const hNo = no > 0n ? no : 0n;
  return mulDivFloor(hYes, clampedP, BPS) + mulDivFloor(hNo, BPS - clampedP, BPS);
}

/**
 * Values a holding across mid, executable liquidation, and resolution bases.
 */
export function valueHolding(
  m: MarketState,
  h: Holding,
  nowSec: bigint,
): Valuation {
  const yes = h.yes > 0n ? h.yes : 0n;
  const no = h.no > 0n ? h.no : 0n;
  const mid = computeMid(m.reserveYes, m.reserveNo, yes, no);

  if (m.status === "Yes" || m.status === "No" || m.status === "Void") {
    const kind =
      m.status === "Yes" ? "yes" : m.status === "No" ? "no" : "void";
    const resolution = settleValue(kind, yes, no);
    return {
      mid,
      liquidation: {
        value: 0n,
        sold: { yes: 0n, no: 0n },
        unsold: { yes, no },
        capped: false,
        tradable: false,
      },
      resolution,
      basis: "resolution",
    };
  }

  const tradable =
    m.status === "Open" &&
    !m.paused &&
    nowSec < m.closeTime &&
    m.reserveYes > 0n &&
    m.reserveNo > 0n &&
    m.feeBps >= 0n &&
    m.feeBps < BPS;

  if (!tradable) {
    return {
      mid,
      liquidation: {
        value: 0n,
        sold: { yes: 0n, no: 0n },
        unsold: { yes, no },
        capped: false,
        tradable: false,
      },
      resolution: null,
      basis: "mid-only",
    };
  }

  if (yes === 0n && no === 0n) {
    return {
      mid: 0n,
      liquidation: {
        value: 0n,
        sold: { yes: 0n, no: 0n },
        unsold: { yes: 0n, no: 0n },
        capped: false,
        tradable: true,
      },
      resolution: null,
      basis: "liquidation",
    };
  }

  if (no === 0n) {
    const yesSell = maxSellable(m.reserveYes, m.reserveNo, m.feeBps, yes);
    return {
      mid,
      liquidation: {
        value: yesSell.collateral,
        sold: { yes: yesSell.shares, no: 0n },
        unsold: { yes: yes - yesSell.shares, no: 0n },
        capped: yesSell.shares < yes,
        tradable: true,
      },
      resolution: null,
      basis: "liquidation",
    };
  }

  if (yes === 0n) {
    const noSell = maxSellable(m.reserveNo, m.reserveYes, m.feeBps, no);
    return {
      mid,
      liquidation: {
        value: noSell.collateral,
        sold: { yes: 0n, no: noSell.shares },
        unsold: { yes: 0n, no: no - noSell.shares },
        capped: noSell.shares < no,
        tradable: true,
      },
      resolution: null,
      basis: "liquidation",
    };
  }

  // Two-sided holding: evaluate both execution orders using post-trade reserves
  // from calcSell for the second leg, and pick the order with the larger payout.
  const yesFirst1 = maxSellable(m.reserveYes, m.reserveNo, m.feeBps, yes);
  const yesFirst2 = maxSellable(
    yesFirst1.newReserveOther,
    yesFirst1.newReserveSold,
    m.feeBps,
    no,
  );
  const yesFirstTotal = yesFirst1.collateral + yesFirst2.collateral;

  const noFirst1 = maxSellable(m.reserveNo, m.reserveYes, m.feeBps, no);
  const noFirst2 = maxSellable(
    noFirst1.newReserveOther,
    noFirst1.newReserveSold,
    m.feeBps,
    yes,
  );
  const noFirstTotal = noFirst1.collateral + noFirst2.collateral;

  const useYesFirst =
    yesFirstTotal > noFirstTotal ||
    (yesFirstTotal === noFirstTotal &&
      yesFirst1.shares + yesFirst2.shares >= noFirst1.shares + noFirst2.shares);

  const soldYes = useYesFirst ? yesFirst1.shares : noFirst2.shares;
  const soldNo = useYesFirst ? yesFirst2.shares : noFirst1.shares;
  const totalValue = useYesFirst ? yesFirstTotal : noFirstTotal;

  return {
    mid,
    liquidation: {
      value: totalValue,
      sold: { yes: soldYes, no: soldNo },
      unsold: { yes: yes - soldYes, no: no - soldNo },
      capped: soldYes < yes || soldNo < no,
      tradable: true,
    },
    resolution: null,
    basis: "liquidation",
  };
}
