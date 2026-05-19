"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const initialLogs = [
  { time: "14:22:01", type: "INFO", text: "Initializing reasoning matrix for contract ID #882..." },
  { time: "14:22:02", type: "INFO", text: "Weights recalculated via Bayesian inference module." },
  { time: "14:22:03", type: "WARN", text: "Liquidity skew detected on Uniswap v3 YES/NO pair." },
  { time: "14:22:04", type: "INFO", text: "Signal verification complete. Confidence at 92.41%." },
  { time: "14:22:05", type: "INFO", text: "Awaiting user execution..." },
];

const randomLogTexts = [
  "FETCHING REAL-TIME FED DOT PLOT...",
  "RE-INDEXING S&P 500 VOLATILITY INDEX...",
  "CROSS-REFERENCING BLOOMBERG DATA FLOW...",
  "NEURAL WEIGHTS STABILIZED.",
  "OPTIMIZING TRANSACTION GAS ESTIMATES...",
];

export default function ReasoningDetail() {
  const [logs, setLogs] = useState(initialLogs);
  const logStreamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.toLocaleTimeString([], { hour12: false });
      const newLog = {
        time,
        type: "INFO",
        text: randomLogTexts[Math.floor(Math.random() * randomLogTexts.length)],
      };
      setLogs((prev) => [...prev.slice(-19), newLog]);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logStreamRef.current) {
      logStreamRef.current.scrollTop = logStreamRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
      {/* Detail Container */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row h-auto md:h-[calc(100vh-160px)] min-h-[600px]">
        
        {/* Left Panel: Reasoning Trace */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-outline-variant bg-white min-w-0">
          <div className="p-6 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="font-headline-md text-headline-md text-on-surface mb-1 uppercase tracking-tight">Reasoning Trace: TRD-7724</h1>
              <p className="font-body-md text-on-surface-variant italic">&quot;Will Fed cut rates by &gt;25bps in September?&quot;</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="bg-surface-container-high text-primary px-3 py-1 rounded-full text-label-caps font-label-caps text-[10px] font-bold">STABLE_DIFFUSION_4.0</span>
              <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-caps font-label-caps text-[10px] font-bold">92% CONFIDENCE</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-8 pl-6 relative">
              {/* Vertical Line */}
              <div className="absolute left-[7px] top-2 bottom-8 w-[1px] bg-outline-variant"></div>

              {/* Step 1 */}
              <div className="relative">
                <div className="absolute -left-[23px] top-2 w-4 h-4 rounded-full bg-primary border-4 border-white z-10"></div>
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-surface-container-low p-4 rounded-lg border border-outline-variant"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-label-caps text-label-caps text-primary font-bold">STEP 01: INITIAL CORPUS INGESTION</span>
                    <span className="font-data-mono text-data-mono text-on-surface-variant text-[12px]">1.4ms</span>
                  </div>
                  <p className="font-body-md text-on-surface leading-relaxed">
                    Parsed 14,200 data points from Bloomberg Terminal, FOMC minutes, and CME FedWatch tool. Identified conflicting signals between inflation trajectory and labor market softening.
                  </p>
                </motion.div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="absolute -left-[23px] top-2 w-4 h-4 rounded-full bg-primary border-4 border-white z-10"></div>
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-surface-container-low p-4 rounded-lg border border-outline-variant"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-label-caps text-label-caps text-primary font-bold">STEP 02: CROSS-SOURCE WEIGHTING</span>
                    <span className="font-data-mono text-data-mono text-on-surface-variant text-[12px]">0.8ms</span>
                  </div>
                  <div className="space-y-3">
                    <p className="font-body-md text-on-surface leading-relaxed">
                      Applying source credibility multipliers. Fed Official statements weighted at 0.85. Yield curve inversion analysis weighted at 0.62.
                    </p>
                    <div className="grid grid-cols-3 gap-2 py-2">
                      <div className="h-1 bg-primary rounded-full"></div>
                      <div className="h-1 bg-primary rounded-full"></div>
                      <div className="h-1 bg-outline-variant rounded-full"></div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="absolute -left-[23px] top-2 w-4 h-4 rounded-full bg-primary border-4 border-white z-10"></div>
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-[#f0f9fa] p-4 rounded-lg border border-primary-container/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary text-lg">psychology</span>
                    <span className="font-label-caps text-label-caps text-primary font-bold uppercase tracking-wider">Step 03: Oracle Insight (Sentiment)</span>
                  </div>
                  <p className="font-body-md text-on-surface italic leading-relaxed">
                    &quot;The consensus narrative is currently anchored in a 25bps cut. However, historical volatility analysis during election years suggests a 42% higher probability of aggressive dovishness than the market is currently pricing in.&quot;
                  </p>
                </motion.div>
              </div>

              {/* Step 4 */}
              <div className="relative">
                <div className="absolute -left-[23px] top-2 w-4 h-4 rounded-full bg-primary border-4 border-white z-10"></div>
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-surface-container-low p-4 rounded-lg border border-outline-variant"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-label-caps text-label-caps text-primary font-bold">STEP 04: FINAL PROBABILITY SYNTHESIS</span>
                    <span className="font-data-mono text-data-mono text-on-surface-variant text-[12px]">2.1ms</span>
                  </div>
                  <p className="font-body-md text-on-surface mb-4 leading-relaxed">
                    Monte Carlo simulation (n=1,000,000) yields a skew toward the &apos;YES&apos; outcome based on tail-risk events in regional banking sectors.
                  </p>
                  <div className="mt-4">
                    <div className="flex justify-between font-label-caps text-[10px] mb-1 font-bold">
                      <span className="text-secondary">YES (72%)</span>
                      <span className="text-tertiary">NO (28%)</span>
                    </div>
                    <div className="w-full h-4 flex rounded-full overflow-hidden bg-outline-variant">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "72%" }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="bg-secondary"
                      />
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "28%" }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="bg-tertiary"
                      />
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Data Analysis & Actions */}
        <div className="w-full md:w-[320px] lg:w-[400px] flex flex-col bg-surface-container-low">
          {/* Source Weighting Card */}
          <div className="p-6 border-b border-outline-variant bg-white/50">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-6 font-bold uppercase tracking-widest">Source Weighting</h3>
            <div className="space-y-6">
              {[
                { name: "Macro Indicators", val: 0.92, icon: "terminal" },
                { name: "Social Sentiment", val: 0.44, icon: "public" },
                { name: "Historical Bias", val: 0.78, icon: "history_edu" },
              ].map((source, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded bg-white border border-outline-variant flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-on-surface-variant">{source.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="font-body-md font-bold truncate">{source.name}</span>
                      <span className="font-data-mono text-primary font-bold">{source.val}</span>
                    </div>
                    <div className="w-full h-1 bg-outline-variant rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${source.val * 100}%` }}
                        className="h-full bg-primary"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confidence Interval Graph Area */}
          <div className="p-6 flex-1 flex flex-col min-h-0">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 font-bold uppercase tracking-widest">Confidence Interval</h3>
            <div className="flex-1 min-h-[140px] w-full bg-white border border-outline-variant rounded-lg relative overflow-hidden flex items-end p-2 gap-1 group">
              {[20, 35, 50, 75, 90, 60, 40, 20].map((h, i) => (
                <motion.div 
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex-1 rounded-sm transition-colors duration-300 ${i === 4 ? 'bg-primary' : 'bg-surface-container hover:bg-primary-fixed-dim'}`}
                />
              ))}
              <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none select-none">
                <span className="font-display-lg text-primary opacity-20 text-4xl">σ 2.4</span>
              </div>
            </div>
            <p className="font-label-caps text-[10px] text-on-surface-variant mt-3 uppercase tracking-[0.2em] text-center font-bold">Projected Value Distribution</p>
          </div>

          {/* Primary CTA Section */}
          <div className="p-6 bg-white border-t border-outline-variant space-y-4 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-end">
              <div>
                <span className="font-label-caps text-on-surface-variant text-[10px] font-bold uppercase">Current Price</span>
                <div className="font-headline-md text-headline-md font-black text-primary">0.68¢</div>
              </div>
              <div className="text-right">
                <span className="font-label-caps text-secondary text-[10px] font-bold uppercase">Potential ROI</span>
                <div className="font-headline-md text-headline-md font-black text-secondary">+47.1%</div>
              </div>
            </div>
            <button className="w-full bg-secondary text-on-secondary font-headline-sm text-headline-sm py-4 rounded-xl flex items-center justify-center gap-3 hover:brightness-110 transition-all active:scale-[0.98] shadow-lg shadow-secondary/20">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              COPY TRADE (YES)
            </button>
            <p className="font-label-caps text-[10px] text-center text-on-surface-variant font-bold uppercase tracking-tight">Protocol execution fee: 0.05%</p>
          </div>
        </div>
      </div>

      {/* System Logs Footer (Terminal Style) */}
      <div className="mt-6 bg-on-background text-[#6ffbbe] p-4 rounded-lg font-data-mono text-data-mono border border-outline overflow-hidden shadow-2xl terminal-glow">
        <div className="flex gap-4 items-center mb-3 border-b border-[#005236] pb-2">
          <span className="flex h-2 w-2 rounded-full bg-[#6ffbbe] animate-pulse"></span>
          <span className="text-white font-bold tracking-widest text-[11px]">ORACLE_LOG_STREAM</span>
          <span className="ml-auto text-on-secondary-fixed-variant opacity-50 text-[10px]">v2.0.4-LATEST</span>
        </div>
        <div 
          ref={logStreamRef}
          className="space-y-1.5 opacity-90 h-32 overflow-y-auto custom-scrollbar scroll-smooth"
        >
          {logs.map((log, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[12px] leading-relaxed"
            >
              <span className="opacity-50">[{log.time}]</span>{" "}
              <span className={log.type === 'WARN' ? 'text-tertiary-fixed' : 'text-white'}>{log.type}:</span>{" "}
              {log.text}
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
