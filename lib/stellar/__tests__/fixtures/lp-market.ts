import type { Market } from "../../generated/market-core";

export const creator = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export function makeLpMarket(patch: Partial<Market> = {}): Market {
  return {
    creator, category: { tag: "Other", values: undefined }, close_time: 1000n, fee_bps: 100,
    fees_accrued: 0n, lp_claimed: false, meta_uri: "ipfs://fixture", question_hash: Buffer.alloc(32),
    resolution_hash: Buffer.alloc(32), reserve_yes: 1000000000n, reserve_no: 1000000000n,
    sets_minted: 1000000000n, status: { tag: "Open", values: undefined }, ...patch,
  };
}
