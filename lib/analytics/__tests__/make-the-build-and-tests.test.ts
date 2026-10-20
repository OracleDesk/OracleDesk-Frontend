import { describe, expect, it } from "vitest";
import { evaluateMakeTheBuildAndTests } from "../make-the-build-and-tests";

describe("evaluateMakeTheBuildAndTests", () => {
  it("evaluates nominal, elevated, and critical thresholds deterministically", () => {
    expect(evaluateMakeTheBuildAndTests({ contextId: "ctx-1", primaryMetric: 15, secondaryMetric: 10, limitThreshold: 100 }).status).toBe("nominal");
    expect(evaluateMakeTheBuildAndTests({ contextId: "ctx-2", primaryMetric: 40, secondaryMetric: 20 }).status).toBe("elevated");
    expect(evaluateMakeTheBuildAndTests({ contextId: "ctx-3", primaryMetric: 70, secondaryMetric: 25, limitThreshold: 100 }).status).toBe("critical");
  });

  it("rejects blank contextId", () => {
    expect(() => evaluateMakeTheBuildAndTests({ contextId: "   ", primaryMetric: 1, secondaryMetric: 1 })).toThrow(/contextId is required/);
  });
});
