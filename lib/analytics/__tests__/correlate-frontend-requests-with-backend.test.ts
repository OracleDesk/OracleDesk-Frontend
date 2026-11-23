import { describe, expect, it } from "vitest";
import { evaluateCorrelateFrontendRequestsWithBackend } from "../correlate-frontend-requests-with-backend";

describe("evaluateCorrelateFrontendRequestsWithBackend", () => {
  it("evaluates nominal, elevated, and critical thresholds deterministically", () => {
    expect(evaluateCorrelateFrontendRequestsWithBackend({ contextId: "ctx-1", primaryMetric: 15, secondaryMetric: 10, limitThreshold: 100 }).status).toBe("nominal");
    expect(evaluateCorrelateFrontendRequestsWithBackend({ contextId: "ctx-2", primaryMetric: 40, secondaryMetric: 20 }).status).toBe("elevated");
    expect(evaluateCorrelateFrontendRequestsWithBackend({ contextId: "ctx-3", primaryMetric: 70, secondaryMetric: 25, limitThreshold: 100 }).status).toBe("critical");
  });

  it("rejects blank contextId", () => {
    expect(() => evaluateCorrelateFrontendRequestsWithBackend({ contextId: "   ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/contextId is required/);
  });
});
