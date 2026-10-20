import { describe, expect, it } from "vitest";
import { verifyCopyBuy } from "@/lib/copy-trade/outbox";
import { CONTRACTS } from "@/lib/stellar/config";
import { buyCheck, expected, trader } from "./copy-trade-fixture";

describe("copy-buy transaction verification", () => {
  it("matches the trader, market, outcome and amount", () => expect(verifyCopyBuy(buyCheck(), expected)).toBe("match"));
  it.each([
    { contract: CONTRACTS.treasury }, { fn: "sell" }, { fn: "redeem" }, { amount: 9999999n }, { outcome: "No" }, { market: 8n },
  ])("rejects changed invocation %#", (changes) => expect(verifyCopyBuy(buyCheck(changes), expected)).toBe("mismatch"));
  it("does not confuse the source wallet with another trader", () => expect(verifyCopyBuy(buyCheck(), { ...expected, trader: trader + "X" })).toBe("mismatch"));
  it("treats failed transactions as failed and missing ones as pending", () => {
    expect(verifyCopyBuy({ kind: "failed", resultCode: "txFailed" }, expected)).toBe("failed");
    expect(verifyCopyBuy({ kind: "not-found" }, expected)).toBe("pending");
  });
});
