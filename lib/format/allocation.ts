import { shareOf } from "../stellar/units";

/** 100% of a balance, in basis points. */
export const MAX_BPS = 10_000;

/** Slippage bounds accepted from free-text input (0.01% to 50%). */
export const MIN_SLIPPAGE_BPS = 1;
export const MAX_SLIPPAGE_BPS = 5000;

/**
 * Amount (base units) that `bps` of `balance` buys. Same rounding as the trade
 * itself: floor, bigint only. The trade amount is always this value.
 */
export function amountForBps(balance: bigint, bps: number): bigint {
  return shareOf(balance, clampBps(bps));
}

/**
 * Largest whole-bps share whose amount is <= `amount`, clamped to 0..10 000.
 * Floor of `amount * 10_000 / balance` in bigint, so
 * `amountForBps(balance, bpsForAmount(balance, a)) <= a` always holds.
 * A zero (or negative) balance or amount yields 0.
 */
export function bpsForAmount(balance: bigint, amount: bigint): number {
  if (balance <= 0n || amount <= 0n) return 0;
  if (amount >= balance) return MAX_BPS;
  return Number((amount * BigInt(MAX_BPS)) / balance);
}

/** Rounds `bps` to the nearest multiple of `step` (integer result, clamped to 0..10 000). */
export function snapBps(bps: number, step: number): number {
  if (!Number.isFinite(bps)) return 0;
  const s = Number.isFinite(step) && step >= 1 ? Math.floor(step) : 1;
  return clampBps(Math.round(bps / s) * s);
}

function clampBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0;
  return Math.min(MAX_BPS, Math.max(0, Math.trunc(bps)));
}

export type SlippageParse =
  | { ok: true; bps: number }
  | { ok: false; reason: "format" | "too-low" | "too-high" };

/**
 * Parses a percent string ("0.5", "1", ".25", "2,5") to whole basis points
 * without floats. Accepts at most two decimals, rejects signs and exponents,
 * and allows 1..5000 bps.
 */
export function slippageBpsFromInput(input: string): SlippageParse {
  const text = input.trim().replace(/%$/, "").trim();
  const match = /^(\d*)(?:[.,](\d{0,2}))?$/.exec(text);
  if (!match || (match[1] === "" && !match[2])) return { ok: false, reason: "format" };
  const whole = match[1] || "0";
  const frac = (match[2] ?? "").padEnd(2, "0");
  // Guard the Number conversion: more than 4 whole digits is far over the max.
  if (whole.length > 4) return { ok: false, reason: "too-high" };
  const bps = Number(whole) * 100 + Number(frac || "0");
  if (bps < MIN_SLIPPAGE_BPS) return { ok: false, reason: "too-low" };
  if (bps > MAX_SLIPPAGE_BPS) return { ok: false, reason: "too-high" };
  return { ok: true, bps };
}
