import { DecimalParseError, parseDecimalAscii, USDC_DECIMALS } from "../stellar/units";

/**
 * Locale-aware, float-free formatting and parsing of fixed-point amounts
 * (bigint base units), basis-point percentages and ledger timestamps.
 *
 * Rules: amounts are never converted to a JavaScript `number`; fractional
 * digits are truncated (never rounded) before digit transliteration; the
 * module takes a `locale` argument and never decides it.
 */

export interface NumberSymbols {
  decimal: string;
  group: string;
  /** Locale digits for 0..9. */
  digits: string[];
  minusSign: string;
  percentSign: string;
  /** Primary and secondary group sizes, e.g. [3, 3] (en) or [3, 2] (en-IN). */
  groupingSizes: [primary: number, secondary: number];
  /** Text placed before / after a negative number (minus sign plus any bidi mark). */
  negativePrefix: string;
  negativeSuffix: string;
}

const symbolCache = new Map<string, NumberSymbols>();

function partsOf(locale: string, value: number | bigint, options: Intl.NumberFormatOptions = {}): Intl.NumberFormatPart[] {
  return new Intl.NumberFormat(locale, options).formatToParts(value as number);
}

const ALWAYS_GROUP = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;

/** Number symbols for a locale, derived from `Intl` and memoised. */
export function numberSymbols(locale: string): NumberSymbols {
  const cached = symbolCache.get(locale);
  if (cached) return cached;

  const grouped = partsOf(locale, 123456789.5, ALWAYS_GROUP);
  const decimal = grouped.find((p) => p.type === "decimal")?.value ?? ".";
  const group = grouped.find((p) => p.type === "group")?.value ?? ",";

  const ints = grouped.filter((p) => p.type === "integer").map((p) => p.value.length);
  const primary = ints.length > 1 ? (ints[ints.length - 1] ?? 3) : 3;
  const secondary = ints.length > 2 ? (ints[ints.length - 2] ?? primary) : primary;

  const digits = Array.from({ length: 10 }, (_, d) => partsOf(locale, d, { useGrouping: false }).map((p) => p.value).join(""));

  const negative = partsOf(locale, -1);
  const minusSign = negative.find((p) => p.type === "minusSign")?.value ?? "-";
  const intIndex = negative.findIndex((p) => p.type === "integer");
  const negativePrefix = negative
    .slice(0, intIndex)
    .map((p) => p.value)
    .join("");
  const negativeSuffix = negative
    .slice(intIndex + 1)
    .map((p) => p.value)
    .join("");

  const percentSign = partsOf(locale, 0.5, { style: "percent" }).find((p) => p.type === "percentSign")?.value ?? "%";

  const symbols: NumberSymbols = {
    decimal,
    group,
    digits,
    minusSign,
    percentSign,
    groupingSizes: [primary, secondary],
    negativePrefix,
    negativeSuffix,
  };
  symbolCache.set(locale, symbols);
  return symbols;
}

export interface AmountFormatOptions {
  /** Fixed-point decimals of `raw`; defaults to USDC's 7. */
  decimals?: number;
  minDecimals?: number;
  maxDecimals?: number;
  grouping?: boolean;
  /** Truncation is the only mode: money is never rounded up. */
  rounding?: "trunc";
}

function transliterate(ascii: string, symbols: NumberSymbols): string {
  let out = "";
  for (const ch of ascii) out += ch >= "0" && ch <= "9" ? symbols.digits[ch.charCodeAt(0) - 48] : ch;
  return out;
}

/**
 * Formats a bigint fixed-point amount for `locale`. Grouping and digit shaping
 * of the whole part come from `Intl.NumberFormat#format(bigint)`; the fraction
 * is truncated as an ASCII digit string and then transliterated.
 */
export function formatAmount(raw: bigint, locale: string, opts: AmountFormatOptions = {}): string {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  const maxDecimals = Math.min(opts.maxDecimals ?? decimals, decimals);
  const minDecimals = Math.min(opts.minDecimals ?? 0, maxDecimals);
  const symbols = numberSymbols(locale);

  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;

  let frac = (abs % unit).toString().padStart(decimals, "0").slice(0, maxDecimals).replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");

  const wholeText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    ...(opts.grouping ? ALWAYS_GROUP : { useGrouping: false }),
  }).format(whole);
  const body = frac ? `${wholeText}${symbols.decimal}${transliterate(frac, symbols)}` : wholeText;

  // A value that truncates to zero carries no minus sign.
  const isZero = whole === 0n && /^0*$/.test(frac);
  return negative && !isZero ? `${symbols.negativePrefix}${body}${symbols.negativeSuffix}` : body;
}

/** USDC amount in base units (7 decimals) formatted for `locale`; the unit label is the caller's. */
export function formatUsdcLocale(raw: bigint, locale: string, opts: Omit<AmountFormatOptions, "decimals"> = {}): string {
  return formatAmount(raw, locale, { ...opts, decimals: USDC_DECIMALS });
}

/**
 * `bps / 100` as a locale-formatted number without a percent sign ("53.2"),
 * rounded half away from zero to `decimals` (0..2) in bigint arithmetic.
 */
export function formatBpsPoints(bps: number | bigint, locale: string, opts: { decimals?: number } = {}): string {
  const decimals = Math.max(0, Math.min(opts.decimals ?? 1, 2));
  const exact = typeof bps === "bigint" ? bps : BigInt(Math.trunc(bps));
  // Percentages are not money: round half away from zero (53.19% -> 53.2%) in bigint.
  const step = 10n ** BigInt(2 - decimals);
  const magnitude = exact < 0n ? -exact : exact;
  const rounded = ((magnitude + step / 2n) / step) * step;
  const value = exact < 0n ? -rounded : rounded;
  return formatAmount(value, locale, { decimals: 2, minDecimals: decimals, maxDecimals: decimals });
}

/**
 * Formats basis points as a percent for `locale` using bigint arithmetic only
 * (`bps / 100`, two implied decimals, rounded half away from zero to `decimals`) and the locale's percent pattern
 * (`53.2%`, `53,2 %`, Arabic percent sign, ...).
 */
export function formatBpsPercent(bps: number | bigint, locale: string, opts: { decimals?: number } = {}): string {
  const numberText = formatBpsPoints(bps, locale, opts);

  // Discover the locale's percent pattern from a placeholder, then swap in our digits.
  const pattern = partsOf(locale, 0.5, { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  let placed = false;
  return pattern
    .map((part) => {
      if (part.type === "integer" || part.type === "group" || part.type === "decimal" || part.type === "fraction") {
        if (placed) return "";
        placed = true;
        return numberText;
      }
      return part.value;
    })
    .join("");
}

export interface LedgerTimeOptions {
  /** IANA zone. Defaults to the runtime's zone; pass "UTC" for verification views. */
  timeZone?: string;
  style?: "date" | "time" | "datetime" | "relative";
  /** "Now" in epoch milliseconds, for relative style and tests. */
  now?: number;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, bigint]> = [
  ["day", 86_400n],
  ["hour", 3_600n],
  ["minute", 60n],
  ["second", 1n],
];

/** Formats a Unix-seconds ledger timestamp for `locale`. */
export function formatLedgerTime(unixSeconds: bigint | number, locale: string, opts: LedgerTimeOptions = {}): string {
  const seconds = typeof unixSeconds === "bigint" ? unixSeconds : BigInt(Math.trunc(unixSeconds));
  const style = opts.style ?? "datetime";

  if (style === "relative") {
    const nowSeconds = BigInt(Math.floor((opts.now ?? Date.now()) / 1000));
    const diff = seconds - nowSeconds;
    const abs = diff < 0n ? -diff : diff;
    const [unit, size] = RELATIVE_UNITS.find(([, s]) => abs >= s) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
    // Truncate toward zero so "3 days 23 hours" reads "in 3 days", not "in 4 days".
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Number(diff / size), unit);
  }

  const date = new Date(Number(seconds * 1000n));
  const base: Intl.DateTimeFormatOptions = { timeZone: opts.timeZone };
  const options: Intl.DateTimeFormatOptions =
    style === "date"
      ? { ...base, dateStyle: "medium" }
      : style === "time"
        ? { ...base, timeStyle: "medium" }
        : { ...base, dateStyle: "medium", timeStyle: "medium" };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export type ParseResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: "empty" | "format" | "too-many-decimals" | "negative" | "exponent" };

export interface ParseLocaleOptions {
  /** Fixed-point decimals; defaults to USDC's 7. */
  decimals?: number;
  /** Accept the locale's group separator in valid positions. Off by default for inputs. */
  allowGrouping?: boolean;
}

const BIDI_MARKS = /[‎‏؜‪-‮⁦-⁩]/g;

const normalise = (text: string) => text.normalize("NFKC");

/**
 * Parses a locale-formatted amount to bigint base units. Accepts the locale's
 * decimal separator and digits (plus ASCII), strips bidi marks, and rejects
 * exponents, signs, extra decimals and ambiguous separators. The numeric rule
 * itself is `parseDecimalAscii`, shared with `parseUsdc`.
 */
export function parseLocaleAmount(input: string, locale: string, opts: ParseLocaleOptions = {}): ParseResult {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  const symbols = numberSymbols(locale);

  let text = normalise(input).replace(BIDI_MARKS, "").trim();
  if (text === "") return { ok: false, reason: "empty" };

  // Locale digits -> ASCII. ASCII digits pass through.
  const digitIndex = new Map(symbols.digits.map((d, i) => [normalise(d), String(i)]));
  let ascii = "";
  for (const ch of text) ascii += digitIndex.get(ch) ?? ch;
  text = ascii;

  if (/[eE]/.test(text)) return { ok: false, reason: "exponent" };
  const minus = new Set(["-", "−", normalise(symbols.minusSign).replace(BIDI_MARKS, "")]);
  for (const ch of text) if (minus.has(ch)) return { ok: false, reason: "negative" };

  const decimalSep = normalise(symbols.decimal);
  const groupSep = normalise(symbols.group);

  // Which character is the decimal point? The locale's own; a bare "." is also
  // accepted when it cannot be this locale's group separator.
  let point = decimalSep;
  if (!text.includes(decimalSep) && decimalSep !== "." && text.includes(".") && groupSep !== ".") point = ".";
  if (point === decimalSep && decimalSep !== "." && text.includes(".") && groupSep === "." && !opts.allowGrouping) {
    // e.g. de-DE "1.234": group or decimal? Never guess.
    return { ok: false, reason: "format" };
  }

  const pieces = text.split(point);
  if (pieces.length > 2) return { ok: false, reason: "format" };
  let intPart = pieces[0] ?? "";
  const fracPart: string | undefined = pieces[1];

  if (intPart.includes(groupSep) || (groupSep === " " && /\s/.test(intPart))) {
    if (!opts.allowGrouping) return { ok: false, reason: "format" };
    const groups = intPart.split(groupSep === " " ? /\s/ : groupSep);
    const [primary, secondary] = symbols.groupingSizes;
    const last = groups.length - 1;
    const valid = groups.every((g, i) => {
      if (!/^\d+$/.test(g)) return false;
      if (i === 0) return g.length >= 1 && g.length <= (groups.length === 2 ? primary : secondary);
      return g.length === (i === last ? primary : secondary);
    });
    if (!valid) return { ok: false, reason: "format" };
    intPart = groups.join("");
  }

  const canonical = fracPart === undefined ? intPart : `${intPart}.${fracPart}`;
  try {
    return { ok: true, value: parseDecimalAscii(canonical, decimals) };
  } catch (error) {
    if (error instanceof DecimalParseError) return { ok: false, reason: error.reason };
    throw error;
  }
}
