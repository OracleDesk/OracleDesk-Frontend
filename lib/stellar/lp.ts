import { BPS, priceYesBps, seedReserves, settleValue, type Settlement } from "./generated/fpmm";
import type { Market } from "./generated/market-core";

export interface LpSeed { amount: bigint; initialYesBps: bigint }
export interface LpView {
  isFinal: boolean;
  settlement: Settlement | null;
  poolYes: bigint; poolNo: bigint;
  poolValue: bigint;
  claimable: bigint | null;
  claimed: boolean;
  feesAccrued: bigint;
  seed?: LpSeed & { creatorYes: bigint; creatorNo: bigint };
}
export function settlementOf(status: Market["status"]): Settlement | null {
  if (status.tag === "Open") return null;
  if (status.tag === "Void") return "void";
  return status.values[0].tag === "Yes" ? "yes" : "no";
}

/** Only show backend seed metadata when this exact on-chain snapshot proves it. */
export function verifiedSeed(market: Market, seed?: LpSeed): LpView["seed"] {
  if (!seed || market.lp_claimed || market.sets_minted !== seed.amount) return undefined;
  try {
    const initial = seedReserves(seed.amount, seed.initialYesBps);
    if (initial.reserveYes !== market.reserve_yes || initial.reserveNo !== market.reserve_no) return undefined;
    return { ...seed, creatorYes: initial.creatorYes, creatorNo: initial.creatorNo };
  } catch { return undefined; }
}

/** Floats are used only for the backend probability -> integer bps boundary. */
export function backendSeed(market: Market, backend?: { seedAmountRaw: string | null; initialYesProb: number } | null): LpSeed | undefined {
  if (!backend?.seedAmountRaw || !/^\d+$/.test(backend.seedAmountRaw) || !Number.isFinite(backend.initialYesProb)) return undefined;
  const seed = { amount: BigInt(backend.seedAmountRaw), initialYesBps: BigInt(Math.round(backend.initialYesProb * 10_000)) };
  return verifiedSeed(market, seed) ? seed : undefined;
}

/** Contract-exact base-unit math. Fees are a separate treasury liability. */
export function lpView(market: Market, seed?: LpSeed): LpView {
  const settlement = settlementOf(market.status);
  const poolYes = market.reserve_yes; const poolNo = market.reserve_no;
  const price = settlement === null && poolYes + poolNo > 0n ? priceYesBps(poolYes, poolNo) : 0n;
  const poolValue = settlement === null ? (poolYes * price + poolNo * (BPS - price)) / BPS : settleValue(settlement, poolYes, poolNo);
  return {
    isFinal: settlement !== null, settlement, poolYes, poolNo, poolValue,
    claimable: settlement === null ? null : market.lp_claimed ? 0n : settleValue(settlement, poolYes, poolNo),
    claimed: market.lp_claimed, feesAccrued: market.fees_accrued, seed: verifiedSeed(market, seed),
  };
}

export function isWalletCreator(market: Market, address: string | null | undefined): boolean {
  return Boolean(address?.startsWith("G") && market.creator === address);
}
