import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatAmount, formatBpsPercent, formatLedgerTime, formatUsdcLocale, numberSymbols, parseLocaleAmount } from "../locale";
import { formatUsdc, parseDecimalAscii, parseUsdc } from "../../stellar/units";

const LOCALES = ["en-US", "en-IN", "de-DE", "fr-FR", "de-CH", "pt-BR", "ar-EG", "fa-IR", "hi-IN-u-nu-deva", "ja-JP"];
const UNIT = 10n ** 7n;
const SAMPLES = [UNIT, 1n, 1234567890125000n, 10n ** 15n * UNIT, 0n, 5n, 12_345_678_900_000n];

describe("numberSymbols", () => {
  it("reads separators and grouping sizes from Intl", () => {
    expect(numberSymbols("en-US")).toMatchObject({ decimal: ".", group: ",", groupingSizes: [3, 3] });
    expect(numberSymbols("de-DE")).toMatchObject({ decimal: ",", group: "." });
    expect(numberSymbols("en-IN").groupingSizes).toEqual([3, 2]);
    expect(numberSymbols("fr-FR").group).toMatch(/[   ]/);
    expect(numberSymbols("ar-EG").digits[1]).toBe("١");
    expect(numberSymbols("en-US")).toBe(numberSymbols("en-US"));
  });
});

describe("formatAmount", () => {
  it("matches formatUsdc byte for byte in en-US", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 }), fc.boolean(), (raw, a, b, grouping) => {
        const [minDecimals, maxDecimals] = a <= b ? [a, b] : [b, a];
        expect(formatAmount(raw, "en-US", { minDecimals, maxDecimals, grouping })).toBe(formatUsdc(raw, { minDecimals, maxDecimals, grouping }));
      }),
    );
    expect(formatAmount(-5n, "en-US")).toBe(formatUsdc(-5n));
    expect(formatAmount(12_345_678_900_000n, "en-US", { grouping: true, maxDecimals: 2, minDecimals: 2 })).toBe("1,234,567.89");
  });

  it("truncates instead of rounding and never leaves a trailing separator", () => {
    expect(formatAmount(19_999_999n, "en-US", { maxDecimals: 2 })).toBe("1.99");
    expect(formatAmount(15_000_000n, "de-DE", { maxDecimals: 0 })).toBe("1");
    expect(formatAmount(-5n, "en-US", { maxDecimals: 2 })).toBe("0");
  });

  it("formats grouping per locale", () => {
    const raw = 12_345_678_900_000n; // 1234567.89
    const opts = { grouping: true, maxDecimals: 2, minDecimals: 2 } as const;
    expect(formatAmount(raw, "en-IN", opts)).toBe("12,34,567.89");
    expect(formatAmount(raw, "de-DE", opts)).toBe("1.234.567,89");
    expect(formatAmount(raw, "fr-FR", opts)).toBe("1 234 567,89");
    const ch = numberSymbols("de-CH");
    expect(formatAmount(raw, "de-CH", opts)).toBe(`1${ch.group}234${ch.group}567.89`);
  });

  it("uses Arabic-Indic digits and the Arabic decimal separator in ar-EG", () => {
    const symbols = numberSymbols("ar-EG");
    const text = formatAmount(25_000_000n, "ar-EG", { minDecimals: 1 });
    expect(text).toBe(`${symbols.digits[2]}${symbols.decimal}${symbols.digits[5]}`);
    expect(text).toContain("\u066b");
    expect(text).not.toMatch(/[0-9]/);
  });

  it("formatUsdcLocale defaults to 7 decimals", () => {
    expect(formatUsdcLocale(1n, "en-US")).toBe("0.0000001");
  });
});

describe("parseLocaleAmount", () => {
  it("round-trips formatAmount in every locale", () => {
    for (const locale of LOCALES) {
      for (const raw of SAMPLES) {
        expect(parseLocaleAmount(formatAmount(raw, locale), locale)).toEqual({ ok: true, value: raw });
        expect(parseLocaleAmount(formatAmount(raw, locale, { grouping: true }), locale, { allowGrouping: true })).toEqual({ ok: true, value: raw });
      }
    }
  });

  it("equals parseUsdc for ASCII-equivalent inputs (1000 random values per locale)", () => {
    for (const locale of LOCALES) {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), (raw) => {
          const ascii = formatAmount(raw, "en-US");
          expect(parseLocaleAmount(formatAmount(raw, locale), locale)).toEqual({ ok: true, value: parseUsdc(ascii) });
        }),
        { numRuns: 1000 },
      );
    }
  });

  it("accepts the decimal comma where the locale uses one", () => {
    expect(parseLocaleAmount("2,5", "de-DE")).toEqual({ ok: true, value: 25_000_000n });
    expect(parseLocaleAmount("2,5", "fr-FR")).toEqual({ ok: true, value: 25_000_000n });
    expect(parseLocaleAmount(".5", "en-US")).toEqual({ ok: true, value: 5_000_000n });
  });

  it("strips bidi marks and surrounding space", () => {
    expect(parseLocaleAmount("‏ ٢٫٥ ‎", "ar-EG")).toEqual({ ok: true, value: 25_000_000n });
  });

  it("accepts ASCII digits in non-Latin locales", () => {
    expect(parseLocaleAmount("12", "ar-EG")).toEqual({ ok: true, value: 120_000_000n });
  });

  it("rejects exponent, sign, Infinity, multiple decimals and >7 decimals in every locale", () => {
    for (const locale of LOCALES) {
      const { decimal } = numberSymbols(locale);
      expect(parseLocaleAmount("1e5", locale)).toEqual({ ok: false, reason: "exponent" });
      expect(parseLocaleAmount("1E5", locale)).toEqual({ ok: false, reason: "exponent" });
      expect(parseLocaleAmount("-1", locale)).toEqual({ ok: false, reason: "negative" });
      expect(parseLocaleAmount("−1", locale)).toEqual({ ok: false, reason: "negative" });
      expect(parseLocaleAmount("+1", locale).ok).toBe(false);
      expect(parseLocaleAmount("Infinity", locale).ok).toBe(false);
      expect(parseLocaleAmount("∞", locale).ok).toBe(false);
      expect(parseLocaleAmount(`1${decimal}2${decimal}3`, locale).ok).toBe(false);
      expect(parseLocaleAmount(`1${decimal}00000001`, locale)).toEqual({ ok: false, reason: "too-many-decimals" });
      expect(parseLocaleAmount("   ", locale)).toEqual({ ok: false, reason: "empty" });
    }
  });

  it("never guesses an ambiguous separator", () => {
    // de-DE "1.234" is 1234 with grouping, so it is a format error without it.
    expect(parseLocaleAmount("1.234", "de-DE")).toEqual({ ok: false, reason: "format" });
    expect(parseLocaleAmount("1.234", "de-DE", { allowGrouping: true })).toEqual({ ok: true, value: 12_340_000_000n });
    expect(parseLocaleAmount("1.234,5", "de-DE", { allowGrouping: true })).toEqual({ ok: true, value: 12_345_000_000n });
    expect(parseLocaleAmount("1.234", "en-US")).toEqual({ ok: true, value: 12_340_000n });
    expect(parseLocaleAmount("1,000", "en-US")).toEqual({ ok: false, reason: "format" });
  });

  it("validates group positions in strict mode, including Indian 3;2", () => {
    expect(parseLocaleAmount("12,34,567.89", "en-IN", { allowGrouping: true })).toEqual({ ok: true, value: 12_345_678_900_000n });
    expect(parseLocaleAmount("1,2345", "en-US", { allowGrouping: true }).ok).toBe(false);
    expect(parseLocaleAmount("1,234,56", "en-US", { allowGrouping: true }).ok).toBe(false);
    expect(parseLocaleAmount(",123", "en-US", { allowGrouping: true }).ok).toBe(false);
  });
});

describe("formatBpsPercent", () => {
  it("formats per locale with the locale's pattern", () => {
    expect(formatBpsPercent(5319, "en-US")).toBe("53.2%");
    expect(formatBpsPercent(5319n, "en-US", { decimals: 2 })).toBe("53.19%");
    expect(formatBpsPercent(5000, "en-US", { decimals: 0 })).toBe("50%");
    expect(formatBpsPercent(5319, "de-DE")).toMatch(/^53,2[\u00a0 ]%$/);
    expect(formatBpsPercent(5324, "en-US")).toBe("53.2%");
    expect(formatBpsPercent(5325, "en-US")).toBe("53.3%");
    expect(formatBpsPercent(-5319, "en-US")).toBe("-53.2%");
    const fr = formatBpsPercent(5319, "fr-FR");
    expect(fr).toMatch(/^53,2[   ]%$/);
    expect(formatBpsPercent(10_000, "en-US")).toBe("100.0%");
    expect(formatBpsPercent(0, "en-US")).toBe("0.0%");
  });

  it("uses locale digits and percent sign for Arabic", () => {
    const text = formatBpsPercent(5319, "ar-EG");
    expect(text).not.toMatch(/[0-9]/);
    expect(text).toContain(numberSymbols("ar-EG").percentSign);
  });
});

describe("formatLedgerTime", () => {
  const seconds = 1_767_225_600n; // 2026-01-01T00:00:00Z
  it("formats in UTC and in an explicit zone", () => {
    expect(formatLedgerTime(seconds, "en-US", { timeZone: "UTC", style: "date" })).toBe("Jan 1, 2026");
    expect(formatLedgerTime(seconds, "en-US", { timeZone: "America/Sao_Paulo", style: "date" })).toBe("Dec 31, 2025");
    expect(formatLedgerTime(Number(seconds), "en-US", { timeZone: "UTC", style: "time" })).toMatch(/^12:00:00\sAM$/);
    expect(formatLedgerTime(seconds, "de-DE", { timeZone: "UTC", style: "datetime" })).toContain("01.01.2026");
  });

  it("formats a relative close time", () => {
    const now = Number(seconds) * 1000;
    expect(formatLedgerTime(seconds + 3n * 86_400n + 3_600n, "en-US", { style: "relative", now })).toBe("in 3 days");
    expect(formatLedgerTime(seconds - 2n * 3_600n, "en-US", { style: "relative", now })).toBe("2 hours ago");
    expect(formatLedgerTime(seconds, "en-US", { style: "relative", now })).toBe("now");
  });
});

describe("shared parse rule", () => {
  it("parseDecimalAscii and parseUsdc agree", () => {
    for (const input of ["1", "1.5", ".5", "5.", "0.0000001", "", "1e5", "1,000", "-1", "0.00000001", " 2 "]) {
      const a = (() => { try { return parseDecimalAscii(input, 7); } catch { return null; } })();
      const b = (() => { try { return parseUsdc(input); } catch { return null; } })();
      expect(a).toEqual(b);
    }
    expect(parseDecimalAscii("1.5", 2)).toBe(150n);
    expect(() => parseDecimalAscii("1.555", 2)).toThrow("at most 2 decimal places");
  });
});

describe("float-free source", () => {
  it("never converts amounts to number", () => {
    const source = readFileSync(new URL("../locale.ts", import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/parseFloat|parseInt|toFixed|Number\((raw|abs|whole|value|bps)\b/);
    expect(code).not.toMatch(/Math\.(round|floor)\([^)]*(raw|bps)/);
  });
});
