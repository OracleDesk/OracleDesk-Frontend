"use client";
import { Icon, type IconName } from "@/components/ui/icon";

import React, { useState, useEffect, useRef } from "react";
import { usePlatformStats } from "@/lib/hooks/usePortfolio";
import { DemoBadge } from "@/components/ui/demo-badge";
import { CalibrationChart } from "@/components/charts/calibration-chart";
import { handleMessage } from "@/lib/analytics/calibration.worker";
import type { GroupStats } from "@/lib/analytics/calibration";
import { useCalibrationData, useInView, type Policy } from "@/lib/analytics/useCalibrationData";

const KPIStats = () => {
  const { data: statsData, isLoading } = usePlatformStats();
  
  const show = (v: string | undefined) => (isLoading ? "..." : v ?? "—");
  const stats: Array<{ label: string; value: string; change?: string; status?: string }> = [
    { label: "Subscriber Count", value: show(statsData?.subscriberCount.toLocaleString()) },
    { label: "Total Copy Volume", value: show(statsData ? `$${statsData.totalCopyVolume.toLocaleString()}` : undefined) },
    { label: "Markets", value: show(statsData?.marketCount.toLocaleString()), status: statsData ? `${statsData.onChainMarketCount} on-chain` : undefined },
    { label: "Reasoning Traces", value: show(statsData?.traceCount.toLocaleString()) },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white p-6 border border-outline-variant rounded-lg flex flex-col justify-between h-32 hover:shadow-md transition-all">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{stat.label}</span>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-md text-headline-md">{stat.value}</span>
            {stat.change && (
              <span className="text-secondary font-label-caps text-label-caps flex items-center">
                <Icon name="arrow_upward" className="text-[14px]" /> {stat.change}
              </span>
            )}
            {stat.status && (
              <span className="text-secondary font-label-caps text-label-caps flex items-center gap-1">
                <Icon name="check_circle" className="text-[14px]" /> {stat.status}
              </span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
};

const VolumeChart = () => {
  return (
    <div className="lg:col-span-2 bg-white border border-outline-variant rounded-lg p-6 flex flex-col gap-6 hover:shadow-md transition-all">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">Copy Volume Over Time <DemoBadge /></h3>
          <p className="text-on-surface-variant font-label-caps text-label-caps">CUMULATIVE TRANSACTION THROUGHPUT (USD)</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-primary"></span>
            <span className="font-label-caps text-label-caps text-on-surface-variant">Volume</span>
          </div>
        </div>
      </div>
      <div className="h-64 relative overflow-hidden bg-surface-container-lowest border border-surface-container rounded flex items-end px-2">
        <div className="absolute inset-0 chart-gradient"></div>
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 200">
          <path d="M0 180 Q 50 170, 100 150 T 200 120 T 300 140 T 400 90 T 500 110 T 600 60 T 700 80 T 800 40 L 800 200 L 0 200 Z" fill="rgba(0, 70, 85, 0.05)"></path>
          <path d="M0 180 Q 50 170, 100 150 T 200 120 T 300 140 T 400 90 T 500 110 T 600 60 T 700 80 T 800 40" fill="none" stroke="#004655" strokeWidth="2" vectorEffect="non-scaling-stroke"></path>
        </svg>
        <div className="absolute left-2 top-2 bottom-2 flex flex-col justify-between font-label-caps text-[10px] text-outline">
          <span>200M</span>
          <span>150M</span>
          <span>100M</span>
          <span>50M</span>
          <span>0</span>
        </div>
      </div>
      <div className="flex justify-between px-2 font-label-caps text-label-caps text-outline">
        <span>JAN 01</span>
        <span>JAN 10</span>
        <span>JAN 20</span>
        <span>JAN 30</span>
      </div>
    </div>
  );
};

const TopTrades = () => {
  const trades = [
    { icon: "trending_up", title: "ETH Long 25x", builder: "AlphaQuants", volume: "+$1.2M", copies: "2.4k", iconBg: "bg-primary-container", iconColor: "text-on-primary-container" },
    { icon: "shield", title: "BTC Delta Neutral", builder: "Delta_Force", volume: "+$840k", copies: "1.8k", iconBg: "bg-surface-container-highest", iconColor: "text-primary" },
    { icon: "token", title: "SOL Accumulation", builder: "SolanaWhale", volume: "+$612k", copies: "940", iconBg: "bg-tertiary-fixed", iconColor: "text-tertiary" },
  ];

  return (
    <div className="bg-white border border-outline-variant rounded-lg overflow-hidden flex flex-col hover:shadow-md transition-all">
      <div className="p-6 border-b border-outline-variant">
        <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">Top Copied Trades <DemoBadge /></h3>
        <p className="text-on-surface-variant font-label-caps text-label-caps uppercase">HIGHEST 24H VELOCITY</p>
      </div>
      <div className="flex-1 divide-y divide-outline-variant overflow-y-auto">
        {trades.map((trade, i) => (
          <div key={i} className="p-4 hover:bg-surface-container-low transition-colors flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${trade.iconBg} rounded flex items-center justify-center ${trade.iconColor}`}>
                <Icon name={trade.icon as IconName} />
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface font-bold">{trade.title}</p>
                <p className="text-[11px] text-on-surface-variant">Builder: {trade.builder}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-data-mono text-data-mono text-secondary">{trade.volume}</p>
              <p className="text-[11px] text-on-surface-variant">{trade.copies} copies</p>
            </div>
          </div>
        ))}
      </div>
      <button className="w-full p-4 font-label-caps text-label-caps text-primary border-t border-outline-variant hover:bg-surface-container-low transition-all">View All Leaders</button>
    </div>
  );
};

const ProtocolReliability = () => {
  const stats = [
    { label: "Active Nodes", value: "1,024 / 1,024" },
    { label: "Network Uptime", value: "99.998%" },
    { label: "Consensus Latency", value: "42ms" },
    { label: "Message Thruput", value: "14.2k tx/s" },
  ];

  return (
    <div className="bg-white border border-outline-variant rounded-lg p-6 hover:shadow-md transition-all">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">Protocol Reliability <DemoBadge /></h3>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary"></span>
          <span className="font-label-caps text-label-caps text-secondary">Operational</span>
        </div>
      </div>
      <div className="space-y-4">
        {stats.map((stat, i) => (
          <div key={i} className="flex justify-between items-end border-b border-outline-variant pb-2">
            <span className="text-on-surface-variant font-label-caps text-label-caps">{stat.label}</span>
            <span className="font-data-mono text-data-mono">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const LiveTerminal = () => {
  const [logs, setLogs] = useState([
    { time: "14:22:01", type: "INFO", message: "New swap sequence initiated by node 0x7E...42", typeColor: "text-primary" },
    { time: "14:22:02", type: "INFO", message: "Copy trade executed: 2,400 USDC on YES", typeColor: "text-primary" },
    { time: "14:22:05", type: "EVENT", message: "Block 19,420,112 validated in 1.1s", typeColor: "text-secondary" },
    { time: "14:22:09", type: "INFO", message: "Oracle price sync complete (BTC/USD: $42,104.20)", typeColor: "text-primary" },
    { time: "14:22:11", type: "WARN", message: "Slight latency increase in Region: EU-WEST", typeColor: "text-destructive" },
    { time: "14:22:14", type: "INFO", message: "Fee distribution cycle triggered: $12,402 to builders", typeColor: "text-primary" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.getHours().toString().padStart(2, '0') + ':' + 
                   now.getMinutes().toString().padStart(2, '0') + ':' + 
                   now.getSeconds().toString().padStart(2, '0');
      
      const newLogs = [
        { time, type: "INFO", message: `Node 0x${Math.random().toString(16).slice(2, 6)} synchronized successfully`, typeColor: "text-primary" },
        { time, type: "EVENT", message: `New consensus reached on block ${Math.floor(Math.random() * 20000000)}`, typeColor: "text-secondary" },
        { time, type: "INFO", message: `Transaction verified: ${ (Math.random() * 10).toFixed(2) } USDC`, typeColor: "text-primary" }
      ];
      
      setLogs(prev => [...prev.slice(-6), newLogs[Math.floor(Math.random() * newLogs.length)]]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-on-background text-primary p-6 rounded-lg font-data-mono text-[11px] h-[320px] overflow-hidden flex flex-col shadow-2xl">
      <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
          <span className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Network Trace (demo data)</span>
        </div>
        <span className="text-white/30 text-[9px]">v4.2.1-STABLE</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left duration-500">
            <span className="text-white/20 whitespace-nowrap">[{log.time}]</span>
            <span className={`font-bold whitespace-nowrap ${log.typeColor}`}>{log.type}</span>
            <span className="text-white/80">{log.message}</span>
          </div>
        ))}
        <div className="text-white/50 animate-pulse">_</div>
      </div>
    </div>
  );
};

const POLICIES: Array<{ value: Policy; label: string }> = [
  { value: "lastPreClose", label: "Last pre-close trace" },
  { value: "all", label: "All traces" },
];

const agentLabel = (group: string) =>
  group
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");

const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(4) : "—");

const CalibrationPanel = () => {
  const [policy, setPolicy] = useState<Policy>("lastPreClose");
  const { forecasts, counts, nMarkets, isLoading, error } = useCalibrationData(policy);
  const [result, setResult] = useState<{ forecasts: typeof forecasts; perGroup: Record<string, GroupStats> } | null>(null);
  const requestId = useRef(0);
  const stats = result && result.forecasts === forecasts ? result.perGroup : null;

  useEffect(() => {
    const id = ++requestId.current;
    if (forecasts.length === 0) return;
    const accept = (perGroup: Record<string, GroupStats>) => {
      if (id === requestId.current) setResult({ forecasts, perGroup });
    };
    let worker: Worker | null = null;
    try {
      if (typeof Worker === "undefined") throw new Error("Worker unavailable");
      worker = new Worker(new URL("../../lib/analytics/calibration.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id?: number; perGroup?: Record<string, GroupStats> }>) => {
        if (event.data?.id === id && event.data.perGroup) accept(event.data.perGroup);
      };
      worker.postMessage({ id, forecasts, policy, seed: 42 });
    } catch {
      queueMicrotask(() => accept(handleMessage({ id, forecasts, policy, seed: 42 }).perGroup));
    }
    return () => {
      requestId.current += 1;
      worker?.terminate();
    };
  }, [forecasts, policy]);

  const marketsByGroup = React.useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const f of forecasts) {
      const markets = seen.get(f.group) ?? new Set<string>();
      markets.add(f.marketId);
      seen.set(f.group, markets);
    }
    return Object.fromEntries([...seen].map(([group, markets]) => [group, markets.size]));
  }, [forecasts]);

  const excluded = counts.voided + counts.open + counts.rejected + counts.notOnChain;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant">
          {POLICIES.map((option) => (
            <button
              key={option.value}
              onClick={() => setPolicy(option.value)}
              className={`px-4 py-1.5 font-label-caps text-label-caps rounded transition-all ${
                policy === option.value ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:bg-white/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          {policy === "lastPreClose"
            ? "DEFAULT: LAST TRACE PER MARKET + AGENT PUBLISHED BEFORE close_time"
            : "EVERY TRACE PUBLISHED BEFORE close_time"}
        </p>
      </div>

      <p className="text-on-surface-variant font-body-md">
        Brier score is the mean squared error of the probability forecasts: lower is better, 0.25 is a coin flip. Log loss
        penalises confident wrong calls. Outcomes come only from the on-chain <span className="font-data-mono">get_market</span>{" "}
        status — voided and open markets are excluded and counted below; the backend status field is never used. Skill compares
        each agent against the backend opening price when available.
      </p>

      {!isLoading && excluded > 0 && (
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          EXCLUDED: {counts.voided} VOIDED, {counts.open} OPEN, {counts.rejected} REJECTED, {counts.notOnChain} NOT ON-CHAIN
        </p>
      )}

      {isLoading ? (
        <p className="text-on-surface-variant font-body-md">Loading calibration…</p>
      ) : error ? (
        <p className="text-destructive font-body-md">Couldn&apos;t load calibration data.</p>
      ) : nMarkets === 0 ? (
        <p className="text-on-surface-variant font-body-md">No resolved markets with traces yet.</p>
      ) : !stats ? (
        <p className="text-on-surface-variant font-body-md">Scoring forecasts…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(stats).map(([group, groupStats]) => {
              const markets = marketsByGroup[group] ?? 0;
              return (
                <div key={group} className="border border-outline-variant rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
                      {agentLabel(group)}
                    </span>
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      {markets} market{markets === 1 ? "" : "s"}
                    </span>
                  </div>
                  {markets < 20 ? (
                    <p className="text-on-surface-variant font-body-md">Not enough resolved markets yet (n = {markets})</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline gap-3 border-b border-outline-variant pb-2">
                        <span className="text-on-surface-variant font-label-caps text-label-caps">Brier (lower better)</span>
                        <span className="font-data-mono text-data-mono">
                          {fmt(groupStats.brier)}{" "}
                          <span className="text-on-surface-variant">
                            [{fmt(groupStats.brierCi.lo)}, {fmt(groupStats.brierCi.hi)}]
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline gap-3 border-b border-outline-variant pb-2">
                        <span className="text-on-surface-variant font-label-caps text-label-caps">Log loss (lower better)</span>
                        <span className="font-data-mono text-data-mono">
                          {fmt(groupStats.logLoss)}{" "}
                          <span className="text-on-surface-variant">
                            [{fmt(groupStats.logLossCi.lo)}, {fmt(groupStats.logLossCi.hi)}]
                          </span>
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline gap-3">
                        <span className="text-on-surface-variant font-label-caps text-label-caps">Skill vs opening price</span>
                        <span className="font-data-mono text-data-mono">{groupStats.skill === null ? "—" : groupStats.skill.toFixed(3)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {Object.values(stats).some((groupStats) => groupStats.n >= 1) && <CalibrationChart groups={stats} />}
        </>
      )}
    </div>
  );
};

const ForecastCalibration = () => {
  const containerRef = useRef<HTMLElement>(null);
  const inView = useInView(containerRef);
  return (
    <section
      ref={containerRef}
      className="bg-white border border-outline-variant rounded-lg p-6 hover:shadow-md transition-all"
    >
      <div className="mb-6">
        <h3 className="font-headline-sm text-headline-sm text-on-surface">Forecast calibration</h3>
        <p className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
          ARE AGENT PROBABILITIES ANY GOOD?
        </p>
      </div>
      {inView ? <CalibrationPanel /> : <p className="text-on-surface-variant font-body-md">Loading calibration…</p>}
    </section>
  );
};

export default function StatsPage() {
  return (
    <main className="mt-16 pt-8 pb-16 px-gutter max-w-container-max-width mx-auto space-y-8">
      {/* Dashboard Header */}
      <section className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div className="space-y-1">
          <h1 className="font-display-lg text-display-lg text-on-surface">Platform Intelligence</h1>
          <p className="text-on-surface-variant font-body-lg">Platform counts from the OracleDesk backend. Panels marked demo data are samples.</p>
        </div>
        <div className="flex gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant">
          {["24H", "7D", "30D", "ALL"].map((period) => (
            <button
              key={period}
              className={`px-4 py-1.5 font-label-caps text-label-caps rounded transition-all ${
                period === "24H" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:bg-white/50"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </section>

      <KPIStats />

      <ForecastCalibration />

      {/* Main Chart & Top Trades */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <VolumeChart />
        <TopTrades />
      </section>

      {/* Protocol Reliability & Terminal */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ProtocolReliability />
        <LiveTerminal />
      </section>

      {/* Institutional Transparency */}
      <section className="bg-surface-container-low border border-outline-variant rounded-lg p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto text-on-primary">
          <Icon name="verified_user" />
        </div>
        <div className="max-w-2xl mx-auto space-y-2">
          <h2 className="font-headline-md text-headline-md text-on-surface">Institutional-Grade Transparency</h2>
          <p className="text-on-surface-variant font-body-md">
            Every transaction, node operation, and fee distribution on OracleDesk is cryptographically verifiable. 
            Our analytics engine provides raw access to protocol events for maximum auditing capability.
          </p>
        </div>
        <div className="flex justify-center gap-4 pt-4">
          <button className="bg-white border border-outline-variant px-6 py-2 font-label-caps text-label-caps rounded-lg hover:shadow-sm transition-all flex items-center gap-2">
            <Icon name="download" className="text-[18px]" /> Download Report
          </button>
          <button className="bg-white border border-outline-variant px-6 py-2 font-label-caps text-label-caps rounded-lg hover:shadow-sm transition-all flex items-center gap-2">
            <Icon name="code" className="text-[18px]" /> View Explorer
          </button>
        </div>
      </section>
    </main>
  );
}
