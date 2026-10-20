"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { depthCurve, type DepthLevel } from "@/lib/stellar/depth";
import { formatUsdc, usdcToNumber } from "@/lib/stellar/units";

export interface DepthMarket {
  reserve_yes: bigint;
  reserve_no: bigint;
  fee_bps: number;
  sets_minted: bigint;
}

interface DepthRow {
  price: number;
  sell?: number;
  buy?: number;
  sellLevel?: DepthLevel;
  buyLevel?: DepthLevel;
}

const SIDE_LABEL: Record<DepthLevel["side"], string> = {
  buyYes: "Buy YES",
  sellYes: "Sell YES",
  buyNo: "Buy NO",
  sellNo: "Sell NO",
};

function DepthTooltip({
  active,
  payload,
  feeBps,
}: {
  active?: boolean;
  payload?: Array<{ payload: DepthRow }>;
  feeBps: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const lvl = row.sellLevel ?? row.buyLevel;
  if (!lvl) return null;
  return (
    <div className="bg-on-background text-surface px-3 py-2 rounded shadow-xl font-data-mono text-[11px]">
      <p className="text-outline mb-1">YES {(Number(lvl.bps) / 100).toFixed(2)}%</p>
      <p>
        {SIDE_LABEL[lvl.side]}: {formatUsdc(lvl.cumulative, { grouping: true })} USDC
      </p>
      <p>Shares: {formatUsdc(lvl.shares, { grouping: true })}</p>
      <p className="text-outline">includes {(feeBps / 100).toFixed(2)}% fee</p>
    </div>
  );
}

/** Two-sided synthetic depth curve for an FPMM market (exact bigint math). */
export function DepthChart({ market }: { market: DepthMarket }) {
  const { reserve_yes, reserve_no, fee_bps, sets_minted } = market;
  const curve = useMemo(
    () => depthCurve({ reserve_yes, reserve_no, fee_bps, sets_minted }),
    [reserve_yes, reserve_no, fee_bps, sets_minted],
  );

  const { rows, midPct } = useMemo(() => {
    const map = new Map<number, DepthRow>();
    for (const l of curve.levels) {
      if (l.side !== "sellYes" && l.side !== "buyYes") continue;
      const price = Number(l.bps) / 100;
      const row = map.get(Number(l.bps)) ?? { price };
      if (l.side === "sellYes") {
        row.sell = usdcToNumber(l.cumulative);
        row.sellLevel = l;
      } else {
        row.buy = usdcToNumber(l.cumulative);
        row.buyLevel = l;
      }
      map.set(Number(l.bps), row);
    }
    return {
      rows: [...map.values()].sort((a, b) => a.price - b.price),
      midPct: Number(curve.mid) / 100,
    };
  }, [curve]);

  if (!rows.length) {
    return (
      <div className="h-[280px] flex items-center justify-center border border-dashed border-outline-variant rounded font-label-caps text-label-caps text-on-surface-variant">
        Not enough liquidity depth to chart
      </div>
    );
  }

  return (
    <div>
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#bfc8cc" strokeOpacity={0.3} />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fill: "#6f797c" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}`}
              tick={{ fontSize: 10, fill: "#6f797c" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DepthTooltip feeBps={fee_bps} />} />
            <ReferenceLine x={midPct} stroke="#004655" strokeDasharray="6 4" strokeWidth={1.5} />
            <Area
              type="stepAfter"
              dataKey="sell"
              stroke="#840023"
              strokeWidth={1.5}
              fill="#840023"
              fillOpacity={0.12}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="stepAfter"
              dataKey="buy"
              stroke="#006c49"
              strokeWidth={1.5}
              fill="#006c49"
              fillOpacity={0.12}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer font-label-caps text-label-caps text-on-surface-variant">
          Depth table
        </summary>
        <table className="w-full text-left font-data-mono text-[11px] mt-2">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="py-1 font-label-caps text-on-surface-variant">Price</th>
              <th className="py-1 font-label-caps text-on-surface-variant">USDC needed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lvl = r.sellLevel ?? r.buyLevel;
              if (!lvl) return null;
              return (
                <tr key={r.price} className="border-b border-outline-variant/50">
                  <td className="py-1">{r.price.toFixed(2)}%</td>
                  <td className="py-1">
                    {formatUsdc(lvl.cumulative, { grouping: true })} (
                    {lvl.side === "sellYes" ? "received selling" : "needed to buy"})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}
