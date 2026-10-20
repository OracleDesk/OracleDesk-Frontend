import { readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { USDC_UNIT } from "../../stellar/units";
import {
  floatUsdcToRaw,
  formatBps,
  formatProbability,
  formatSignedUsdc,
  formatUsdcDisplay,
  MINUS_SIGN,
  ratioBps,
} from "../money";

describe("lib/format/money", () => {
  it("formatUsdcDisplay truncates to 2 dp and groups thousands", () => {
    expect(formatUsdcDisplay(12_345_678_900_000n)).toBe("1,234,567.89 USDC");
    // 1.9999999 USDC truncates to 1.99 USDC (never rounds up)
    expect(formatUsdcDisplay(19_999_999n)).toBe("1.99 USDC");
    expect(formatUsdcDisplay(15_000_000n, { suffix: false })).toBe("1.50");
  });

  it("formatUsdcDisplay renders < 0.01 for dust and 0.00 for zero", () => {
    expect(formatUsdcDisplay(0n)).toBe("0.00 USDC");
    expect(formatUsdcDisplay(1n)).toBe("< 0.01 USDC");
    expect(formatUsdcDisplay(99_999n)).toBe("< 0.01 USDC");
    expect(formatUsdcDisplay(100_000n)).toBe("0.01 USDC");
    expect(formatUsdcDisplay(-50_000n)).toBe(`${MINUS_SIGN}< 0.01 USDC`);
  });

  it("formatSignedUsdc uses U+2212 for negatives and no sign for zero or truncated dust", () => {
    expect(formatSignedUsdc(0n)).toBe("0.00 USDC");
    expect(formatSignedUsdc(90_000n)).toBe("0.00 USDC"); // +0.009 truncates to 0.00
    expect(formatSignedUsdc(-90_000n)).toBe("0.00 USDC"); // -0.009 truncates to 0.00, never -0.00
    expect(formatSignedUsdc(125_000_000n)).toBe("+12.50 USDC");
    expect(formatSignedUsdc(-125_000_000n)).toBe(`${MINUS_SIGN}12.50 USDC`);
    expect(formatSignedUsdc(-125_000_000n, { suffix: false })).toBe(
      `${MINUS_SIGN}12.50`,
    );
  });

  it("formatBps formats signed and unsigned with 1 and 2 decimals", () => {
    expect(formatBps(6_420n)).toBe("64.2%");
    expect(formatBps(6_425n, { decimals: 2 })).toBe("64.25%");
    expect(formatBps(1_250n, { signed: true })).toBe("+12.50%");
    expect(formatBps(-1_250n, { signed: true })).toBe(`${MINUS_SIGN}12.50%`);
    expect(formatBps(-1_250n, { decimals: 1, signed: true })).toBe(
      `${MINUS_SIGN}12.5%`,
    );
    expect(formatBps(0n, { signed: true })).toBe("0.00%");
    expect(formatBps(0n, { decimals: 1, signed: true })).toBe("0.0%");
  });

  it("formatProbability clamps out-of-range floats and formats to 1 dp", () => {
    expect(formatProbability(0.624)).toBe("62.4%");
    expect(formatProbability(0)).toBe("0.0%");
    expect(formatProbability(1)).toBe("100.0%");
    expect(formatProbability(-0.25)).toBe("0.0%");
    expect(formatProbability(1.8)).toBe("100.0%");
    expect(formatProbability(Number.NaN)).toBe("—");
  });

  it("floatUsdcToRaw handles negatives, NaN, Infinity and >= 1e15", () => {
    expect(floatUsdcToRaw(12.5)).toBe(125_000_000n);
    expect(floatUsdcToRaw(-12.5)).toBe(-125_000_000n);
    expect(floatUsdcToRaw(0)).toBe(0n);
    expect(floatUsdcToRaw(-0)).toBe(0n);
    expect(floatUsdcToRaw(Number.NaN)).toBeNull();
    expect(floatUsdcToRaw(Number.POSITIVE_INFINITY)).toBeNull();
    expect(floatUsdcToRaw(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(floatUsdcToRaw(1e15)).toBeNull();
    expect(floatUsdcToRaw(-1e15)).toBeNull();
    expect(floatUsdcToRaw(null)).toBeNull();
    expect(floatUsdcToRaw(undefined)).toBeNull();
  });

  it("ratioBps floors and returns null on zero denominator", () => {
    expect(ratioBps(125n, 1_000n)).toBe(1_250n); // 12.50%
    expect(ratioBps(1n, 3n)).toBe(3_333n); // 33.33%
    expect(ratioBps(-1n, 3n)).toBe(-3_333n);
    expect(ratioBps(0n, 500n)).toBe(0n);
    expect(ratioBps(100n, 0n)).toBeNull();
  });

  it("compact formatting uses bigint division (1_234_567 USDC -> 1.23M)", () => {
    expect(
      formatUsdcDisplay(1_234_567n * USDC_UNIT, {
        compact: true,
        suffix: false,
      }),
    ).toBe("1.23M");
    expect(formatUsdcDisplay(1_234_567n * USDC_UNIT, { compact: true })).toBe(
      "1.23M USDC",
    );
    expect(
      formatUsdcDisplay(14_190n * USDC_UNIT, { compact: true, suffix: false }),
    ).toBe("14.1K");
    expect(formatUsdcDisplay(950n * USDC_UNIT, { compact: true })).toBe(
      "950.00 USDC",
    );
  });
});

describe("money formatting ESLint rule", () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const fixtureDir = path.join(__dirname, "lint-fixtures");
  const readFixture = (name: string) =>
    readFileSync(path.join(fixtureDir, name), "utf8");

  it("flags summary.totalUsdc.toLocaleString(), amount.toFixed(2), and $ template literals", async () => {
    const [result] = await eslint.lintText(readFixture("flags-money.tsx"), {
      filePath: path.join(process.cwd(), "app/portfolio/fixture-flags.tsx"),
    });
    const restricted = result.messages.filter(
      (m) => m.ruleId === "no-restricted-syntax",
    );
    expect(restricted.length).toBeGreaterThanOrEqual(3);
    expect(restricted[0]?.message).toContain("Format money with lib/format/money.ts");
  });

  it("allows yesProb.toFixed(1), edge.toFixed(1), and confidence.toFixed(1)", async () => {
    const [result] = await eslint.lintText(readFixture("allows-prob.tsx"), {
      filePath: path.join(process.cwd(), "app/portfolio/fixture-prob.tsx"),
    });
    expect(result.messages).toEqual([]);
  });

  it("allows a disabled line with a reason", async () => {
    const [result] = await eslint.lintText(
      readFixture("allows-disabled-with-reason.tsx"),
      {
        filePath: path.join(
          process.cwd(),
          "app/portfolio/fixture-disabled.tsx",
        ),
      },
    );
    expect(result.messages).toEqual([]);
  });
});
