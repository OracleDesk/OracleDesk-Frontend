import { describe, expect, it } from "vitest";
import { evaluateValidateConfigurationAndUrlsAt } from "../validate-configuration-and-urls-at";

describe("evaluateValidateConfigurationAndUrlsAt", () => {
  it("evaluates nominal, elevated, and critical thresholds deterministically", () => {
    expect(evaluateValidateConfigurationAndUrlsAt({ contextId: "ctx-1", primaryMetric: 15, secondaryMetric: 10, limitThreshold: 100 }).status).toBe("nominal");
    expect(evaluateValidateConfigurationAndUrlsAt({ contextId: "ctx-2", primaryMetric: 40, secondaryMetric: 20 }).status).toBe("elevated");
    expect(evaluateValidateConfigurationAndUrlsAt({ contextId: "ctx-3", primaryMetric: 70, secondaryMetric: 25, limitThreshold: 100 }).status).toBe("critical");
  });

  it("rejects blank contextId", () => {
    expect(() => evaluateValidateConfigurationAndUrlsAt({ contextId: "   ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/contextId is required/);
  });
});
