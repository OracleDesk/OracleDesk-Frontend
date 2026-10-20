import { formatUsdc, minOut } from "@/lib/stellar/units";

export interface QuoteAnnouncementParams {
  side: "Yes" | "No";
  amountRaw: bigint | null;
  debouncedAmount?: bigint | null;
  quote: {
    data?: bigint;
    isSuccess: boolean;
    isFetching: boolean;
  };
  slippageBps: number;
}

/**
 * Computes an accessible, screen-reader friendly quote announcement.
 * Only returns a string for settled quotes (successful, not fetching, amount settled).
 * Never announces while quoting or fetching.
 */
export function quoteAnnouncement(params: QuoteAnnouncementParams): string | null {
  const { side, amountRaw, debouncedAmount, quote, slippageBps } = params;

  if (debouncedAmount !== undefined && debouncedAmount !== amountRaw) {
    return null;
  }
  if (!amountRaw || amountRaw <= 0n) {
    return null;
  }
  if (!quote.isSuccess || quote.isFetching || quote.data === undefined) {
    return null;
  }

  const sharesStr = formatUsdc(quote.data, { maxDecimals: 2 });
  const amountStr = formatUsdc(amountRaw, { maxDecimals: 2 });
  const minSharesStr = formatUsdc(minOut(quote.data, slippageBps), { maxDecimals: 2 });
  const slippageValue = slippageBps % 100 === 0 ? (slippageBps / 100).toString() : (slippageBps / 100).toFixed(1);
  const slippagePercent = `${slippageValue} percent`;

  return `About ${sharesStr} ${side.toUpperCase()} shares for ${amountStr} USDC. At least ${minSharesStr} after ${slippagePercent} slippage.`;
}

/**
 * Returns true if the next announcement key differs from the previous key.
 * Suppresses duplicate announcements for identical quote parameters.
 */
export function shouldAnnounce(prevKey: string | null, nextKey: string | null): boolean {
  if (!nextKey) return false;
  return prevKey !== nextKey;
}

/**
 * Unique identifier for a settled quote to deduplicate announcements.
 */
export function quoteKey(
  side: string,
  amountRaw: bigint | null,
  quoteData?: bigint
): string | null {
  if (amountRaw === null || quoteData === undefined) return null;
  return `${side}:${amountRaw.toString()}:${quoteData.toString()}`;
}
