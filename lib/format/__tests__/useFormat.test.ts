import { describe, expect, it } from "vitest";
import { createFormatters } from "../useFormat";

describe("createFormatters", () => {
  it("binds every formatter to the locale", () => {
    const de = createFormatters("de-DE");
    expect(de.usdc(12_345_678_900_000n, { grouping: true, maxDecimals: 2, minDecimals: 2 })).toBe("1.234.567,89");
    expect(de.tryParseAmount("2,5")).toBe(25_000_000n);
    expect(de.tryParseAmount("abc")).toBeNull();
    expect(de.points(5319)).toBe("53,2");
    expect(createFormatters("en").percent(5319)).toBe("53.2%");
  });
});
