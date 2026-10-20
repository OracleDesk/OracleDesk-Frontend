import { BPS, formatUsdc, parseUsdc, probabilityToBps, USDC_DECIMALS, USDC_UNIT } from "../stellar/units";

/**
 * Presentation-layer money and probability formatting policy:
 *
 * 1. USDC display (`formatUsdcDisplay`):
 *    - 2 decimal places by default, truncating toward zero (never rounding up
 *      money the user does not have).
 *    - Always thousands-grouped with `,` (fixed en-US grouping).
 *    - Appends a ` USDC` suffix by default and never prefixes `$` (amounts are
 *      on-chain Stellar USDC, not fiat USD).
 *    - Non-zero dust below `0.01 USDC` renders as `< 0.01 USDC` (or
 *      `−< 0.01 USDC` when negative).
 *    - Compact mode (`compact: true`) abbreviates thousands (`K`) and millions
 *      (`M`) using pure bigint division, never floating-point math.
 *
 * 2. Signed USDC (`formatSignedUsdc`):
 *    - Explicit `+` for positive amounts and `−` (U+2212 MINUS SIGN) for
 *      negative amounts.
 *    - `0n` and any non-zero dust that truncates to `0.00` toward zero (for
 *      example `+0.009 USDC`) render as `0.00 USDC` without a sign.
 *
 * 3. Basis points & probabilities (`formatBps`, `formatProbability`):
 *    - `formatBps` renders basis points (`10_000 bps = 100%`) with a `%` suffix.
 *      Unsigned probabilities default to 1 decimal place; signed percent
 *      changes (`signed: true`) default to 2 decimal places with `+` / `−`
 *      (U+2212) and no sign on zero.
 *    - `formatProbability` clamps a backend `[0, 1]` float to `[0, 1]` and
 *      renders it with 1 decimal place.
 *
 * 4. Backend float boundary (`floatUsdcToRaw`):
 *    - The single audited helper that converts a backend display float into
 *      7-decimal base units via `toFixed(7)` and `parseUsdc`.
 *    - Returns `null` for `NaN`, `Infinity`, or `|value| >= 1e15` (`MAX_SETS`
 *      scale). Result precision is bounded by the backend's 2-decimal rounding.
 */

export const MINUS_SIGN = "\u2212";

export interface FormatUsdcDisplayOptions {
  decimals?: number;
  suffix?: boolean;
  compact?: boolean;
}

export function formatUsdcDisplay(
  raw: bigint,
  opts: FormatUsdcDisplayOptions = {},
): string {
  const { decimals = 2, suffix = true, compact = false } = opts;
  const unitSuffix = suffix ? " USDC" : "";
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;

  if (compact) {
    const million = 1_000_000n * USDC_UNIT;
    const thousand = 1_000n * USDC_UNIT;
    if (abs >= million) {
      const scaled = abs / 1_000_000n;
      const body = formatUsdc(scaled, {
        minDecimals: 0,
        maxDecimals: opts.decimals ?? 2,
        grouping: true,
      });
      return `${negative ? MINUS_SIGN : ""}${body}M${unitSuffix}`;
    }
    if (abs >= thousand) {
      const scaled = abs / 1_000n;
      const body = formatUsdc(scaled, {
        minDecimals: 0,
        maxDecimals: opts.decimals ?? 1,
        grouping: true,
      });
      return `${negative ? MINUS_SIGN : ""}${body}K${unitSuffix}`;
    }
  }

  if (decimals > 0 && decimals <= USDC_DECIMALS) {
    const dustThreshold = 10n ** BigInt(USDC_DECIMALS - decimals);
    if (abs > 0n && abs < dustThreshold) {
      const minStep = `0.${"0".repeat(decimals - 1)}1`;
      return `${negative ? MINUS_SIGN : ""}< ${minStep}${unitSuffix}`;
    }
  }

  const formatted = formatUsdc(abs, {
    minDecimals: decimals,
    maxDecimals: decimals,
    grouping: true,
  });
  const isZero = formatted.replace(/[0.,]/g, "") === "";
  return `${negative && !isZero ? MINUS_SIGN : ""}${formatted}${unitSuffix}`;
}

export interface FormatSignedUsdcOptions {
  decimals?: number;
  suffix?: boolean;
}

export function formatSignedUsdc(
  raw: bigint,
  opts: FormatSignedUsdcOptions = {},
): string {
  const { decimals = 2, suffix = true } = opts;
  const unitSuffix = suffix ? " USDC" : "";
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const formatted = formatUsdc(abs, {
    minDecimals: decimals,
    maxDecimals: decimals,
    grouping: true,
  });
  const isZero = formatted.replace(/[0.,]/g, "") === "";
  if (isZero) {
    return `${formatted}${unitSuffix}`;
  }
  return `${negative ? MINUS_SIGN : "+"}${formatted}${unitSuffix}`;
}

export interface FormatBpsOptions {
  decimals?: number;
  signed?: boolean;
}

export function formatBps(
  bps: bigint | number,
  opts: FormatBpsOptions = {},
): string {
  const signed = opts.signed ?? false;
  const decimals = opts.decimals ?? (signed ? 2 : 1);
  if (typeof bps === "number" && !Number.isFinite(bps)) return "—";

  const rawBps = typeof bps === "bigint" ? bps : BigInt(Math.trunc(bps));
  const negative = rawBps < 0n;
  const absBps = negative ? -rawBps : rawBps;

  let scaled: bigint;
  if (decimals <= 2) {
    const divisor = 10n ** BigInt(2 - decimals);
    scaled = absBps / divisor;
  } else {
    const multiplier = 10n ** BigInt(decimals - 2);
    scaled = absBps * multiplier;
  }

  const unit = 10n ** BigInt(decimals);
  const whole = (scaled / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac =
    decimals > 0
      ? `.${(scaled % unit).toString().padStart(decimals, "0")}`
      : "";

  if (scaled === 0n) {
    return `${whole}${frac}%`;
  }
  const sign = negative ? MINUS_SIGN : signed ? "+" : "";
  return `${sign}${whole}${frac}%`;
}

export function formatProbability(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  const bps = probabilityToBps(clamped);
  return formatBps(bps, { decimals: 1 });
}

/**
 * Single audited conversion from a backend float to 7-decimal USDC base units.
 * The result is only as precise as the backend's 2-decimal rounding; never feed
 * it into a transaction builder.
 */
export function floatUsdcToRaw(
  value: number | null | undefined,
): bigint | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e15) return null;
  const parsed = parseUsdc(abs.toFixed(USDC_DECIMALS));
  if (parsed === 0n) return 0n;
  return value < 0 ? -parsed : parsed;
}

/**
 * Computes `floor(numerator * BPS / denominator)` in basis points (`10_000 = 100%`),
 * or `null` when `denominator === 0n`.
 */
export function ratioBps(
  numerator: bigint,
  denominator: bigint,
): bigint | null {
  if (denominator === 0n) return null;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const mag = (absNum * BPS) / absDen;
  if (mag === 0n) return 0n;
  return negative ? -mag : mag;
}
