export interface VisualRegressionTestingForKeySummaryInput {
  contextId: string;
  primaryMetric: number;
  secondaryMetric: number;
  limitThreshold?: number;
}

export interface VisualRegressionTestingForKeySummary {
  contextId: string;
  primaryMetric: number;
  secondaryMetric: number;
  scoreBps: number;
  status: "nominal" | "elevated" | "critical";
}

export function evaluateVisualRegressionTestingForKey(input: VisualRegressionTestingForKeySummaryInput): VisualRegressionTestingForKeySummary {
  const contextId = input.contextId.trim();
  if (!contextId) {
    throw new Error("evaluateVisualRegressionTestingForKey: contextId is required");
  }
  const primaryMetric = Math.max(0, Math.trunc(input.primaryMetric));
  const secondaryMetric = Math.max(0, Math.trunc(input.secondaryMetric));
  const limit = Math.max(1, Math.trunc(input.limitThreshold ?? 100));

  const scoreBps = Math.min(10000, Math.round(((primaryMetric + secondaryMetric) * 10000) / limit));
  let status: "nominal" | "elevated" | "critical" = "nominal";
  if (scoreBps >= 8500) {
    status = "critical";
  } else if (scoreBps >= 5000) {
    status = "elevated";
  }

  return {
    contextId,
    primaryMetric,
    secondaryMetric,
    scoreBps,
    status,
  };
}
