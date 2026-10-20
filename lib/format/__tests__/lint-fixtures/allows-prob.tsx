export function AllowedProbabilityView({ yesProb, edge, confidence }: { yesProb: number; edge: number; confidence: number }) {
  return (
    <div>
      <span>{yesProb.toFixed(1)}%</span>
      <span>{edge.toFixed(1)}%</span>
      <span>{confidence.toFixed(1)}%</span>
    </div>
  );
}
