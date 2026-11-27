"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  formatAmount,
  formatBpsPercent,
  formatBpsPoints,
  formatLedgerTime,
  formatUsdcLocale,
  parseLocaleAmount,
  type AmountFormatOptions,
  type LedgerTimeOptions,
  type ParseLocaleOptions,
  type ParseResult,
} from "./locale";

/** Locale used during prerender and on the first client render, so hydration always matches. */
export const SERVER_LOCALE = "en";

const subscribe = () => () => {};
const getClientLocale = () => (typeof navigator !== "undefined" && navigator.language ? navigator.language : SERVER_LOCALE);
const getServerLocale = () => SERVER_LOCALE;

/**
 * The active formatting locale: `en` while prerendering (and while hydrating),
 * then the browser's language. When the i18n framework provides a locale, pass
 * it to `useFormat(locale)` instead.
 */
export function useActiveLocale(): string {
  return useSyncExternalStore(subscribe, getClientLocale, getServerLocale);
}

export interface Formatters {
  locale: string;
  /** Format USDC base units (7 decimals). Truncates; never rounds money up. */
  usdc: (raw: bigint, opts?: Omit<AmountFormatOptions, "decimals">) => string;
  /** Format fixed-point base units with an explicit `decimals`. */
  amount: (raw: bigint, opts?: AmountFormatOptions) => string;
  /** Format basis points as a percent (rounded to `decimals`, default 1). */
  percent: (bps: number | bigint, opts?: { decimals?: number }) => string;
  /** `bps / 100` as a number without the percent sign (e.g. edge in points). */
  points: (bps: number | bigint, opts?: { decimals?: number }) => string;
  ledgerTime: (unixSeconds: bigint | number, opts?: LedgerTimeOptions) => string;
  /** Parse a locale-formatted USDC amount. */
  parseAmount: (input: string, opts?: ParseLocaleOptions) => ParseResult;
  /** Like `parseAmount` but `null` when the input is not a valid amount. */
  tryParseAmount: (input: string, opts?: ParseLocaleOptions) => bigint | null;
}

/** Pure factory so non-React code and tests can bind formatters to a locale. */
export function createFormatters(locale: string): Formatters {
  return {
    locale,
    usdc: (raw, opts) => formatUsdcLocale(raw, locale, opts),
    amount: (raw, opts) => formatAmount(raw, locale, opts),
    percent: (bps, opts) => formatBpsPercent(bps, locale, opts),
    points: (bps, opts) => formatBpsPoints(bps, locale, opts),
    ledgerTime: (unixSeconds, opts) => formatLedgerTime(unixSeconds, locale, opts),
    parseAmount: (input, opts) => parseLocaleAmount(input, locale, opts),
    tryParseAmount: (input, opts) => {
      const result = parseLocaleAmount(input, locale, opts);
      return result.ok ? result.value : null;
    },
  };
}

/** Formatters bound to the active locale. */
export function useFormat(localeOverride?: string): Formatters {
  const active = useActiveLocale();
  const locale = localeOverride ?? active;
  return useMemo(() => createFormatters(locale), [locale]);
}
