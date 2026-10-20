import { describe, expect, it } from "vitest";
import { evaluateIntroduceAnI18nFrameworkWith } from "../introduce-an-i18n-framework-with";

describe("evaluateIntroduceAnI18nFrameworkWith", () => {
  it("evaluates nominal, elevated, and critical thresholds deterministically", () => {
    expect(evaluateIntroduceAnI18nFrameworkWith({ contextId: "ctx-1", primaryMetric: 15, secondaryMetric: 10, limitThreshold: 100 }).status).toBe("nominal");
    expect(evaluateIntroduceAnI18nFrameworkWith({ contextId: "ctx-2", primaryMetric: 40, secondaryMetric: 20 }).status).toBe("elevated");
    expect(evaluateIntroduceAnI18nFrameworkWith({ contextId: "ctx-3", primaryMetric: 70, secondaryMetric: 25, limitThreshold: 100 }).status).toBe("critical");
  });

  it("rejects blank contextId", () => {
    expect(() => evaluateIntroduceAnI18nFrameworkWith({ contextId: "   ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/contextId is required/);
  });
});
