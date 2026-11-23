import { describe, expect, it } from "vitest";
import { evaluateTranslateContractWalletAndBackend } from "../translate-contract-wallet-and-backend";

describe("evaluateTranslateContractWalletAndBackend", () => {
  it("evaluates nominal, elevated, and critical thresholds deterministically", () => {
    expect(evaluateTranslateContractWalletAndBackend({ contextId: "ctx-1", primaryMetric: 15, secondaryMetric: 10, limitThreshold: 100 }).status).toBe("nominal");
    expect(evaluateTranslateContractWalletAndBackend({ contextId: "ctx-2", primaryMetric: 40, secondaryMetric: 20 }).status).toBe("elevated");
    expect(evaluateTranslateContractWalletAndBackend({ contextId: "ctx-3", primaryMetric: 70, secondaryMetric: 25, limitThreshold: 100 }).status).toBe("critical");
  });

  it("rejects blank contextId", () => {
    expect(() => evaluateTranslateContractWalletAndBackend({ contextId: "   ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/contextId is required/);
  });
});
