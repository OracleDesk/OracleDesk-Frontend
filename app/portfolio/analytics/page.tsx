"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useEquity } from "@/lib/portfolio/useEquity";
import type { LedgerEntry } from "@/lib/portfolio/equity";
import { getMarketByOnChainId } from "@/lib/api/markets";
import { explorerTx } from "@/lib/stellar/config";
import { bpsToPercent, formatUsdc, usdcToNumber } from "@/lib/stellar/units";

const RANGES: { label: string; seconds: number }[] = [
  { label: "1D", seconds: 86_400 },
  { label: "1W", seconds: 604_800 },
  { label: "1M", seconds: 2_592_000 },
  { label: "ALL", seconds: Infinity },
];

interface KPIItemProps {
  label: string;
  value: string;
  icon: string;
}

const KPIItem = ({ label, value, icon }: KPIItemProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-surface-container-lowest p-6 border border-outline-variant rounded-lg shadow-sm"
  >
    <div className="flex items-center justify-between mb-2">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <span className="material-symbols-outlined text-primary">{icon}</span>
    </div>
    <div className="font-headline-md text-headline-md text-on-surface font-data-mono">{value}</div>
  </motion.div>
);

const usdcSigned = (raw: bigint) =>
  `${raw >= 0n ? "+" : ""}$${formatUsdc(raw, { grouping: true, maxDecimals: 2 })}`;

const cashFlow = (entry: LedgerEntry): bigint =>
  entry.kind === "redeem" ? entry.payout
  : entry.kind === "seed" ? -entry.seed
  : entry.kind === "buy" ? -entry.collateral
  : entry.collateral;

const MarketLabel = ({ id }: { id: string }) => {
  const { data } = useQuery({
    queryKey: ["market-backend", id],
    queryFn: () => getMarketByOnChainId(id).then(market => market.question).catch(() => null),
    staleTime: 300_000,
  });
  return <span>{data ?? `#${id}`}</span>;
};

const StateCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm p-10 text-center">
    {children}
  </div>
);

export default function PortfolioAnalytics() {
  const { address, openModal } = useWallet();
  const [rangeS, setRangeS] = useState(86_400);
  const equity = useEquity(rangeS);

  if (!address) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-gutter">
        <StateCard>
          <span className="material-symbols-outlined text-primary text-[40px]">account_balance_wallet</span>
          <h1 className="font-headline-md text-headline-md text-on-surface mt-4">
            Connect a wallet to see your trading history
          </h1>
          <button
            onClick={() => void openModal()}
            className="mt-6 px-6 py-2 bg-primary text-primary-foreground rounded text-body-md font-bold hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Connect Wallet
          </button>
        </StateCard>
      </div>
    );
  }

  const { kpis, series, coverage } = equity;
  const partial = series.some(point => point.partial);
  const chartData = series.map(point => ({ time: point.time, value: usdcToNumber(point.equity) }));
  const tickFormat = rangeS <= 86_400
    ? (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="min-h-screen bg-surface">
      <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-surface">Portfolio Analytics</h1>
            <p className="text-on-surface-variant font-body-lg">Your wallet · mark-to-mid</p>
            <p className="text-on-surface-variant font-data-mono text-xs mt-1">
              Treasury agent portfolio lives on{" "}
              <Link href="/portfolio" className="text-primary hover:underline">/portfolio</Link>
            </p>
          </div>
          <Link
            href="/markets"
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-body-md font-bold hover:opacity-90 active:opacity-80 transition-opacity text-center"
          >
            Trade Now
          </Link>
        </div>

        {equity.status === "pending" && (
          <StateCard>
            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">progress_activity</span>
            <p className="text-on-surface-variant font-body-lg mt-4">Loading your trading history…</p>
          </StateCard>
        )}

        {equity.status === "error" && (
          <StateCard>
            <span className="material-symbols-outlined text-error text-[40px]">error</span>
            <p className="text-on-surface-variant font-body-lg mt-4">
              Couldn&apos;t load your trading history. Refresh to try again.
            </p>
          </StateCard>
        )}

        {equity.status === "empty" && (
          <StateCard>
            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">history</span>
            <p className="text-on-surface-variant font-body-lg mt-4">
              No trades from this wallet in the available history (since ledger {coverage.fromLedger})
            </p>
            <Link
              href="/markets"
              className="inline-block mt-6 px-4 py-2 bg-primary text-primary-foreground rounded text-body-md font-bold hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Browse Markets
            </Link>
          </StateCard>
        )}

        {equity.status === "ok" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KPIItem label="TOTAL PNL" value={usdcSigned(kpis.totalPnl)} icon="payments" />
              <KPIItem label="VOLUME TRADED" value={`$${formatUsdc(kpis.volume, { grouping: true, maxDecimals: 2 })}`} icon="swap_horiz" />
              <KPIItem label="MARKETS TRADED" value={String(kpis.marketsTraded)} icon="donut_small" />
              <KPIItem label="WIN RATE" value={kpis.winRateBps === null ? "—" : bpsToPercent(kpis.winRateBps)} icon="target" />
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm p-6 overflow-hidden mb-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Equity (USDC, mark-to-mid)</h3>
                <div className="flex bg-surface-container rounded p-1 gap-1">
                  {RANGES.map(({ label, seconds }) => (
                    <button
                      key={label}
                      onClick={() => setRangeS(seconds)}
                      className={`px-3 py-1 text-label-caps font-bold rounded transition-colors ${seconds === rangeS ? "bg-surface-container-lowest shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="100%">
                        <stop offset="5%" stopColor="#006c49" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#006c49" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#bfc8cc" opacity={0.3} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={tickFormat}
                      tick={{ fontSize: 11, fill: "#687076" }}
                      stroke="#bfc8cc"
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tickFormatter={(value: number) => `$${Number(value).toFixed(0)}`}
                      tick={{ fontSize: 11, fill: "#687076" }}
                      stroke="#bfc8cc"
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #bfc8cc" }}
                      labelStyle={{ fontFamily: "Geist", fontWeight: "bold" }}
                      labelFormatter={(time) => new Date(Number(time)).toLocaleString()}
                      formatter={(value) => [`$${Number(value).toFixed(2)}`, "Equity"]}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="value"
                      stroke="#006c49"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorEquity)"
                      animationDuration={800}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-col gap-1 text-on-surface-variant font-data-mono text-[11px]">
                {coverage.truncated && <span>History before ledger {coverage.fromLedger} is unavailable</span>}
                {partial && <span>Prices between your trades are approximate</span>}
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Recent Activity</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Market</th>
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Type</th>
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Side</th>
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Time</th>
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-right">Amount</th>
                      <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-right">Transaction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {equity.entries.slice(0, 20).map((entry, index) => {
                      const flow = cashFlow(entry);
                      return (
                        <tr key={`${entry.txHash}-${entry.time}-${index}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-data-mono text-on-surface"><MarketLabel id={entry.marketId} /></td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-surface-container rounded font-bold text-label-caps font-data-mono">
                              {entry.kind.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-data-mono">
                            {entry.kind === "buy" || entry.kind === "sell" ? entry.outcome.toUpperCase() : "—"}
                          </td>
                          <td className="px-6 py-4 font-data-mono text-on-surface-variant whitespace-nowrap">
                            {new Date(entry.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className={`px-6 py-4 font-data-mono text-right ${flow >= 0n ? "text-secondary" : "text-error"}`}>
                            {usdcSigned(flow)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <a
                              href={explorerTx(entry.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary font-data-mono text-xs hover:underline"
                            >
                              {entry.txHash.slice(0, 8)}…
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
