import { describe, expect, it } from "vitest";
import { backendSeed, isWalletCreator, lpView, settlementOf } from "../lp";
import fixture from "./fixtures/lp-contract.json";
import { creator, makeLpMarket } from "./fixtures/lp-market";
import { CONTRACTS } from "../config";

describe("creator LP economics", () => {
  it("maps all contract settlements", () => {
    expect(settlementOf({ tag: "Open", values: undefined })).toBeNull();
    expect(settlementOf({ tag: "Void", values: undefined })).toBe("void");
    expect(settlementOf({ tag: "Resolved", values: [{ tag: "Yes", values: undefined }] })).toBe("yes");
    expect(settlementOf({ tag: "Resolved", values: [{ tag: "No", values: undefined }] })).toBe("no");
  });
  it.each(["Yes", "No"] as const)("claims exactly the %s reserve without treasury fees", (tag) => {
    const lp = lpView(makeLpMarket({ reserve_yes: 7n, reserve_no: 12n, fees_accrued: 99n, status: { tag: "Resolved", values: [{ tag, values: undefined }] } }));
    expect(lp.claimable).toBe(tag === "Yes" ? 7n : 12n); expect(lp.feesAccrued).toBe(99n);
  });
  it("matches the Rust initial-price fixture via the Python model", () => {
    const f = fixture.seed6800;
    const seed = { amount: BigInt(f.amount), initialYesBps: BigInt(f.initialYesBps) };
    const market = makeLpMarket({ reserve_yes: BigInt(f.reserveYes), reserve_no: BigInt(f.reserveNo) });
    expect(lpView(market, seed).seed).toEqual({ ...seed, creatorYes: BigInt(f.creatorYes), creatorNo: BigInt(f.creatorNo) });
    expect(backendSeed(market, { seedAmountRaw: f.amount, initialYesProb: 0.68 })).toEqual(seed);
  });
  it("matches the Rust void-pool fixture and odd-unit floor rounding", () => {
    const f = fixture.void5000;
    const market = makeLpMarket({ reserve_yes: BigInt(f.reserveYes), reserve_no: BigInt(f.reserveNo), status: { tag: "Void", values: undefined } });
    expect(lpView(market).claimable).toBe(BigInt(f.voidPayout));
    expect(lpView({ ...market, reserve_yes: BigInt(fixture.oddVoid.reserveYes), reserve_no: BigInt(fixture.oddVoid.reserveNo) }).claimable).toBe(BigInt(fixture.oddVoid.payout));
    const asymmetric = fixture.seed6800;
    expect(lpView({ ...market, reserve_yes: BigInt(asymmetric.reserveYes), reserve_no: BigInt(asymmetric.reserveNo) }).claimable).toBe(BigInt(asymmetric.voidPayout));
  });
  it("has no claim while open and zero after a claim", () => {
    expect(lpView(makeLpMarket()).claimable).toBeNull();
    expect(lpView(makeLpMarket({ lp_claimed: true, status: { tag: "Void", values: undefined } })).claimable).toBe(0n);
  });
  it("marks a balanced pool at half the reserve sum", () => {
    const market = makeLpMarket({ reserve_yes: 1000000001n, reserve_no: 1000000001n });
    expect(lpView(market).poolValue).toBe((market.reserve_yes + market.reserve_no) / 2n);
  });
  it("omits missing, invalid or unverifiable seed metadata", () => {
    const seed = { amount: 1000000000n, initialYesBps: 5000n };
    expect(lpView(makeLpMarket({ reserve_yes: 1n }), seed).seed).toBeUndefined();
    expect(lpView(makeLpMarket({ sets_minted: 2000000000n }), seed).seed).toBeUndefined();
    expect(backendSeed(makeLpMarket(), { seedAmountRaw: "invalid", initialYesProb: 0.5 })).toBeUndefined();
    expect(backendSeed(makeLpMarket(), { seedAmountRaw: "1000000000", initialYesProb: 1.1 })).toBeUndefined();
    expect(lpView(makeLpMarket()).seed).toBeUndefined();
  });
  it("never treats a treasury contract as a connected-wallet creator", () => {
    expect(isWalletCreator(makeLpMarket(), creator)).toBe(true);
    expect(isWalletCreator(makeLpMarket({ creator: CONTRACTS.treasury }), creator)).toBe(false);
    expect(isWalletCreator(makeLpMarket({ creator: CONTRACTS.treasury }), CONTRACTS.treasury)).toBe(false);
  });
});
