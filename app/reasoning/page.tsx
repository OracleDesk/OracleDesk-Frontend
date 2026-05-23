"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

const extraLogs = [
  "> [08:27:01] Processing L3 cross-chain events...",
  "> [08:27:05] Liquidity pools re-balanced (WETH/USDC)",
  "> [08:27:12] Inference Node #44 responding within 12ms",
  "> [08:27:20] Signal strength: 9.4/10",
  "> [08:27:31] Market ID_9921 updated with news delta",
  "> [08:27:44] REASONING TRACE COMMIT: SUCCESS",
];

const TerminalLogSidebar = () => {
  const [logs, setLogs] = useState([
    { text: "> [08:24:12] Fetching market data: ID_882", color: "" },
    { text: "> [08:24:13] Running inference model V4.2", color: "" },
    { text: "> [08:24:15] Source verified via Oracles", color: "" },
    { text: "> [08:24:16] NEW REASONING COMMITTED", color: "text-secondary" },
    { text: "> [08:25:01] Re-weighting sentiment nodes", color: "" },
    { text: "> [08:25:05] Liquidity check: $4.2M depth", color: "" },
    { text: "> [08:25:09] Polling news aggregators...", color: "" },
    { text: "> [08:25:12] Processing macro volatility", color: "" },
    { text: "> [08:25:14] Model divergence: < 0.2%", color: "" },
    { text: "> [08:26:01] Node heartbeat: ACTIVE", color: "" },
    { text: "> [08:26:10] Syncing global state", color: "" },
    { text: "> [08:26:12] TRACE_ID: 0x9f...a23 GENERATED", color: "text-secondary" },
  ]);

  const terminalRef = useRef<HTMLDivElement>(null);
  const logIndex = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextLog = extraLogs[logIndex.current % extraLogs.length];
      setLogs((prev) => [...prev.slice(-49), { text: nextLog, color: nextLog.includes("SUCCESS") || nextLog.includes("COMMIT") ? "text-secondary" : "" }]);
      logIndex.current++;
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="lg:col-span-3 hidden lg:block">
      <div className="bg-surface-container-high border border-outline-variant rounded-lg overflow-hidden h-[calc(100vh-14rem)] sticky top-28 flex flex-col shadow-inner">
        <div className="px-4 py-3 border-b border-outline-variant bg-surface-container flex items-center justify-between">
          <span className="font-label-caps text-[10px] text-on-surface-variant font-bold tracking-widest uppercase">Inference Logs</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-outline-variant"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-outline-variant"></div>
          </div>
        </div>
        <div 
          ref={terminalRef}
          className="flex-1 p-4 font-data-mono text-[10px] leading-relaxed overflow-y-auto terminal-scroll space-y-1"
        >
          {logs.map((log, i) => (
            <div key={i} className={log.color}>{log.text}</div>
          ))}
          <div className="animate-pulse">_</div>
        </div>
      </div>
    </div>
  );
};

interface ReasoningCardProps {
  id: string;
  status: "Verified" | "Unverified";
  title: string;
  description: string;
  confidence: number;
  edge: string;
  synthesis: string;
  matchFound?: string;
  probShift?: string;
  sourceWeighting: { name: string; value: number }[];
  yesProb: number;
  noProb: number;
  unverified?: boolean;
}

const ReasoningCard = ({ 
  id, 
  status, 
  title, 
  description, 
  confidence, 
  edge, 
  synthesis, 
  matchFound, 
  probShift, 
  sourceWeighting, 
  yesProb, 
  noProb,
  unverified 
}: ReasoningCardProps) => {
  const [isExpanded, setIsExpanded] = useState(!unverified);

  return (
    <div className={`reasoning-card rounded-lg overflow-hidden flex flex-col ${unverified ? 'opacity-90 grayscale-[0.2]' : ''}`}>
      <div className="p-6 border-b border-outline-variant flex flex-col md:flex-row justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-surface-container-high px-2 py-0.5 rounded font-label-caps text-[10px] text-primary">ID: {id}</span>
            <div className={`flex items-center gap-1 ${status === 'Verified' ? 'text-secondary' : 'text-on-surface-variant'} font-bold`}>
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: status === 'Verified' ? "'FILL' 1" : "" }}>
                {status === 'Verified' ? 'verified' : 'pending'}
              </span>
              <span className="font-label-caps text-label-caps">{status}</span>
            </div>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1 uppercase tracking-tight">{title}</h2>
          <p className="font-body-md text-on-surface-variant italic">&quot;{description}&quot;</p>
        </div>
        <div className="flex items-center gap-6 md:border-l md:pl-6 border-outline-variant">
          <div className="text-center">
            <div className="font-label-caps text-[10px] text-outline uppercase mb-1">Confidence</div>
            <div className="font-data-mono text-headline-sm text-primary">{confidence}%</div>
          </div>
          <div className="text-center">
            <div className="font-label-caps text-[10px] text-outline uppercase mb-1">Edge</div>
            <div className="font-data-mono text-headline-sm text-secondary">{edge}</div>
          </div>
        </div>
      </div>

      {unverified && !isExpanded && (
        <div className="p-6 bg-surface-container-low flex justify-center border-t border-outline-variant">
          <button 
            className="text-primary font-label-caps text-label-caps flex items-center gap-2 hover:underline"
            onClick={() => setIsExpanded(true)}
          >
            <span className="material-symbols-outlined">expand_more</span>
            Show Analysis Details
          </button>
        </div>
      )}

      {isExpanded && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="ai-tint p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">analytics</span> Reasoning Synthesis
              </h3>
              <div className="space-y-3 font-body-md text-on-surface leading-relaxed">
                <p>{synthesis}</p>
                {(matchFound || probShift) && (
                  <div className="p-3 bg-surface rounded border border-outline-variant text-[13px] font-data-mono">
                    {matchFound && <div dangerouslySetInnerHTML={{ __html: matchFound }} />}
                    {probShift && <div>{probShift}</div>}
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">balance</span> Source Weighting
              </h3>
              <div className="space-y-2">
                {sourceWeighting.map((source, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs font-label-caps mt-3 first:mt-0">
                      <span>{source.name}</span>
                      <span className="font-data-mono">{source.value}%</span>
                    </div>
                    <div className="h-1 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${source.value}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-8">
            <div className="flex justify-between mb-2">
              <span className="font-label-caps text-label-caps text-secondary uppercase">Yes: {yesProb}%</span>
              <span className="font-label-caps text-label-caps text-tertiary uppercase">No: {noProb}%</span>
            </div>
            <div className="h-4 w-full flex rounded-full overflow-hidden bg-surface-container">
              <div className="probability-yes h-full" style={{ width: `${yesProb}%` }}></div>
              <div className="probability-no h-full" style={{ width: `${noProb}%` }}></div>
            </div>
          </div>
        </motion.div>
      )}

      {isExpanded && (
        <div className="p-6 bg-surface border-t border-outline-variant flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <Link href="/reasoning/verify" className="px-4 py-2 bg-surface-container-low border border-outline text-on-surface rounded font-label-caps text-label-caps hover:bg-surface-variant transition-all">Verify</Link>
            <button className="px-4 py-2 bg-primary-container text-white rounded font-label-caps text-label-caps hover:opacity-90 active:opacity-80 transition-all">Copy Trade</button>
          </div>
          <Link href="/premium/trace" className="flex items-center gap-2 text-primary font-bold font-label-caps text-label-caps border border-primary px-4 py-2 rounded hover:bg-primary-fixed-dim/10">
            <span className="material-symbols-outlined">lock_open</span>
            Unlock Premium Trace
          </Link>
        </div>
      )}
    </div>
  );
};

export default function ReasoningFeedPage() {
  return (
    <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
      {/* Header Section */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">AI Reasoning Feed</h1>
          <p className="text-on-surface-variant mt-2 max-w-2xl font-body-lg text-body-lg">
            Real-time inference logs and predictive analysis for global prediction markets. 
            Verifiable trust through on-chain reasoning traces.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-surface-container rounded border border-outline-variant">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-data-mono text-data-mono text-on-surface">LIVE FEED: 124 TPS</span>
          </div>
        </div>
      </div>

      {/* Main Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <TerminalLogSidebar />

        {/* Main Feed Content */}
        <div className="lg:col-span-9 space-y-6">
          <ReasoningCard 
            id="8944-TX"
            status="Verified"
            title="Fed Funds Rate: 50bps Cut in September?"
            description="Macro sentiment shifting toward aggressive easing following latest payroll divergence."
            confidence={84}
            edge="+12.4%"
            synthesis="Primary driver is the sustained cooling in core inflation metrics paired with a softening labor market. Historical precedence for 50bps cuts occurs when unemployment exceeds the natural rate by >0.4% in a single quarter."
            matchFound="MATCH_FOUND: [1998_EASING, 2007_EASING, 2020_EASING]<br/>PROBABILITY_SHIFT: YES (+4.2%)"
            sourceWeighting={[
              { name: "CPI Forecast Aggregates", value: 42 },
              { name: "Futures Market Implieds", value: 35 },
              { name: "Institutional Flow Data", value: 23 }
            ]}
            yesProb={68}
            noProb={32}
          />

          <ReasoningCard 
            id="9021-TX"
            status="Unverified"
            unverified
            title="Ethereum Layer 2 TVL to exceed $50B?"
            description="Consolidation phases in Arbitrum/Optimism suggest imminent breakout volume."
            confidence={52}
            edge="+2.1%"
            synthesis="Inference models suggest a delayed reaction to EIP-4844 throughput capacity. Current growth rate projects a $50B milestone by Q1 2025 if transaction costs remain below $0.01."
            yesProb={45}
            noProb={55}
            sourceWeighting={[
              { name: "L2 Throughput Stats", value: 55 },
              { name: "DeFiLlama TVL Aggregates", value: 30 },
              { name: "Network Fee Projections", value: 15 }
            ]}
          />

          <ReasoningCard 
            id="9110-TX"
            status="Verified"
            title="Brent Crude: Above $90 by Year End?"
            description="Supply constraints in Middle East offset by increasing US production output."
            confidence={71}
            edge="+7.8%"
            synthesis="Geopolitical risk premiums are undervalued by 15% according to regional volatility clustering algorithms. Market assumes 'Status Quo' but inference indicates a 22% chance of localized supply shock."
            sourceWeighting={[
              { name: "Satellite Tanker Count", value: 45 },
              { name: "EIA Inventory Reports", value: 40 },
              { name: "Sentiment Parsing (X/News)", value: 15 }
            ]}
            yesProb={32}
            noProb={68}
          />
        </div>
      </div>
    </main>
  );
}
