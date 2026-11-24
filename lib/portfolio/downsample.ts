export interface DownsampleOptions {
  target?: number;
}

export function downsample<T extends { equity: bigint }>(points: readonly T[], opts: DownsampleOptions = {}): T[] {
  const target = Math.max(2, opts.target ?? 400);
  if (points.length <= target) return [...points];

  let minIndex = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].equity < points[minIndex].equity) minIndex = i;
    if (points[i].equity > points[maxIndex].equity) maxIndex = i;
  }

  const keep = new Set<number>([0, points.length - 1, minIndex, maxIndex]);
  const buckets = Math.max(1, target - keep.size);
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = Math.floor((bucket * (points.length - 2)) / buckets) + 1;
    const to = Math.floor(((bucket + 1) * (points.length - 2)) / buckets) + 1;
    let best = from;
    let bestDistance = Infinity;
    for (let i = from; i < to && i < points.length - 1; i += 1) {
      let distance = Math.abs(Number(points[i].equity - points[from].equity));
      if (!Number.isFinite(distance)) distance = i === from ? 0 : 1;
      const duplicatePenalty = keep.has(i) ? Number.MAX_SAFE_INTEGER : 0;
      if (distance + duplicatePenalty < bestDistance) {
        bestDistance = distance + duplicatePenalty;
        best = i;
      }
    }
    keep.add(best);
  }

  return [...keep].sort((a, b) => a - b).map((index) => points[index]);
}
