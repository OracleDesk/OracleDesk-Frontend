"use client";

export interface SparklineProps {
  points: { time: number; yesBps: bigint }[];
  label: string;
  trend: "up" | "down" | "flat";
}

const TREND_COLOR = {
  up: "text-secondary",
  down: "text-tertiary",
  flat: "text-outline",
} as const;

/** Step-line sparkline for FPMM prices (flat between trades), dependency-free SVG. */
export function Sparkline({ points, label, trend }: SparklineProps) {
  if (points.length === 0) return null;
  const values = points.map(point => Number(point.yesBps));
  let lo = values.reduce((min, value) => (value < min ? value : min), values[0]);
  let hi = values.reduce((max, value) => (value > max ? value : max), values[0]);
  if (hi - lo < 50) {
    const mid = (hi + lo) / 2;
    lo = mid - 25;
    hi = mid + 25;
  }
  const t0 = points[0].time;
  const t1 = points[points.length - 1].time;
  const x = (time: number) => (points.length === 1 || t1 === t0 ? 50 : ((time - t0) / (t1 - t0)) * 100);
  const y = (value: number) => 28 - ((value - lo) / (hi - lo)) * 26;
  let d = `M ${x(t0)} ${y(values[0])}`;
  for (let i = 1; i < points.length; i++) d += ` H ${x(points[i].time)} V ${y(values[i])}`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={`w-full h-16 stroke-2 fill-none ${TREND_COLOR[trend]}`}
    >
      <path d={d} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
