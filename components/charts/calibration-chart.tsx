"use client";

import React from "react";
import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { GroupStats } from "@/lib/analytics/calibration";

interface BinPoint {
  x: number;
  y: number;
  n: number;
  lo: number;
  hi: number;
  meanP: number;
}

const SERIES_COLORS = ["#004655", "#006c49", "#b45309", "#7c3aed"];
const SERIES_SHAPES = ["circle", "triangle", "square", "diamond"] as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

const agentLabel = (group: string) =>
  group
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");

const BinTooltip = ({ active, payload }: Partial<TooltipContentProps>) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as BinPoint | undefined;
  if (!point) return null;
  return (
    <div className="bg-white border border-outline-variant rounded-lg p-3 shadow-md space-y-1 text-xs">
      <p className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
        Bin {pct(point.lo)} – {pct(point.hi)}
      </p>
      <p className="text-on-surface-variant font-data-mono text-data-mono">n = {point.n}</p>
      <p className="text-on-surface-variant font-data-mono text-data-mono">Mean forecast {point.meanP.toFixed(3)}</p>
      <p className="text-on-surface-variant font-data-mono text-data-mono">Observed frequency {point.y.toFixed(3)}</p>
    </div>
  );
};

export interface CalibrationChartProps {
  groups: Record<string, GroupStats>;
}

/** Reliability diagram: observed frequency vs mean forecast per bin, with the perfect-calibration diagonal. */
export function CalibrationChart({ groups }: CalibrationChartProps) {
  const series = Object.entries(groups)
    .map(([group, stats], i) => ({
      name: agentLabel(group),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      shape: SERIES_SHAPES[i % SERIES_SHAPES.length],
      data: stats.reliability
        .filter((bin) => bin.n > 0)
        .map<BinPoint>((bin) => ({
          x: (bin.lo + bin.hi) / 2,
          y: bin.freq,
          n: bin.n,
          lo: bin.lo,
          hi: bin.hi,
          meanP: bin.meanP,
        })),
    }))
    .filter((entry) => entry.data.length > 0);

  if (series.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="h-[320px] w-full bg-surface-container-lowest border border-surface-container rounded">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#bfc8cc" opacity={0.3} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 1]}
              name="Mean forecast"
              tickFormatter={pct}
              stroke="#bfc8cc"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 1]}
              name="Observed frequency"
              tickFormatter={pct}
              stroke="#bfc8cc"
              tick={{ fontSize: 11 }}
              width={48}
            />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#bfc8cc" strokeDasharray="4 4" />
            <Tooltip content={BinTooltip} cursor={{ strokeDasharray: "3 3" }} />
            <Legend />
            {series.map((entry) => (
              <Scatter
                key={entry.name}
                name={entry.name}
                data={entry.data}
                fill={entry.color}
                shape={entry.shape}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="font-label-caps text-label-caps text-on-surface-variant">
        DIAGONAL = PERFECT CALIBRATION · POINT SIZE FIXED · CI WHISKERS OMITTED
      </p>
      <details>
        <summary className="font-label-caps text-label-caps text-on-surface-variant cursor-pointer select-none">
          View reliability table
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left font-data-mono text-data-mono text-xs">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface uppercase">
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Bin</th>
                <th className="py-2 pr-4">n</th>
                <th className="py-2 pr-4">Mean forecast</th>
                <th className="py-2">Observed frequency</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).flatMap(([group, stats]) =>
                stats.reliability
                  .filter((bin) => bin.n > 0)
                  .map((bin) => (
                    <tr key={`${group}-${bin.lo}`} className="border-b border-outline-variant last:border-0">
                      <td className="py-1.5 pr-4 text-on-surface">{agentLabel(group)}</td>
                      <td className="py-1.5 pr-4 text-on-surface-variant">
                        {bin.lo.toFixed(2)} – {bin.hi.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-4 text-on-surface-variant">{bin.n}</td>
                      <td className="py-1.5 pr-4 text-on-surface-variant">{bin.meanP.toFixed(3)}</td>
                      <td className="py-1.5 text-on-surface-variant">{bin.freq.toFixed(3)}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
