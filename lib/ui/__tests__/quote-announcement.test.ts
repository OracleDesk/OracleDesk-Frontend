import { describe, expect, it } from "vitest";
import {
  quoteAnnouncement,
  quoteKey,
  shouldAnnounce,
} from "../quote-announcement";

describe("quoteAnnouncement", () => {
  const baseParams = {
    side: "Yes" as const,
    amountRaw: 100_000_000n, // 10 USDC
    debouncedAmount: 100_000_000n,
    quote: {
      data: 123_400_000n, // 12.34 shares
      isSuccess: true,
      isFetching: false,
    },
    slippageBps: 100, // 1%
  };

  it("formats shares, amount, and minimum with slippage", () => {
    const text = quoteAnnouncement(baseParams);
    expect(text).toBe(
      "About 12.34 YES shares for 10 USDC. At least 12.21 after 1 percent slippage."
    );
  });

  it("suppresses announcement while fetching", () => {
    const text = quoteAnnouncement({
      ...baseParams,
      quote: { ...baseParams.quote, isFetching: true },
    });
    expect(text).toBeNull();
  });

  it("suppresses announcement when quote has not succeeded yet", () => {
    const text = quoteAnnouncement({
      ...baseParams,
      quote: { ...baseParams.quote, isSuccess: false },
    });
    expect(text).toBeNull();
  });

  it("suppresses announcement while user is still typing (debouncedAmount !== amountRaw)", () => {
    const text = quoteAnnouncement({
      ...baseParams,
      amountRaw: 200_000_000n,
      debouncedAmount: 100_000_000n,
    });
    expect(text).toBeNull();
  });

  it("suppresses announcement for invalid or zero amount", () => {
    expect(
      quoteAnnouncement({
        ...baseParams,
        amountRaw: null,
      })
    ).toBeNull();

    expect(
      quoteAnnouncement({
        ...baseParams,
        amountRaw: 0n,
      })
    ).toBeNull();
  });

  it("formats NO side correctly", () => {
    const text = quoteAnnouncement({
      ...baseParams,
      side: "No",
    });
    expect(text).toBe(
      "About 12.34 NO shares for 10 USDC. At least 12.21 after 1 percent slippage."
    );
  });
});

describe("shouldAnnounce & quoteKey", () => {
  it("deduplicates identical quotes", () => {
    const key1 = quoteKey("Yes", 100_000_000n, 123_400_000n);
    const key2 = quoteKey("Yes", 100_000_000n, 123_400_000n);

    expect(key1).toBe(key2);
    expect(shouldAnnounce(key1, key2)).toBe(false);
  });

  it("announces when side changes", () => {
    const keyYes = quoteKey("Yes", 100_000_000n, 123_400_000n);
    const keyNo = quoteKey("No", 100_000_000n, 123_400_000n);

    expect(keyYes).not.toBe(keyNo);
    expect(shouldAnnounce(keyYes, keyNo)).toBe(true);
  });

  it("announces when amount changes", () => {
    const key1 = quoteKey("Yes", 100_000_000n, 123_400_000n);
    const key2 = quoteKey("Yes", 200_000_000n, 246_800_000n);

    expect(shouldAnnounce(key1, key2)).toBe(true);
  });

  it("suppresses when nextKey is null", () => {
    const key1 = quoteKey("Yes", 100_000_000n, 123_400_000n);
    expect(shouldAnnounce(key1, null)).toBe(false);
  });
});
