"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMarket } from "@/lib/hooks/useMarkets";

export default function MarketQuickViewPage() {
  const searchParams = useSearchParams();
  const marketId = searchParams.get("marketId");
  const side = searchParams.get("side"); // YES or NO

  const { data: market, isLoading, error } = useMarket(marketId ?? undefined);
  const [showModal, setShowModal] = useState(true);

  // Sparkline path simulation
  const sparklinePath = "M0 25 L10 22 L20 28 L30 18 L40 20 L50 15 L60 17 L70 10 L80 12 L90 5 L100 8";

  const yesProb = useMemo(() => {
    if (!market) return 50;
    const rawProb = market.currentYesProb ?? market.initialYesProb;
    return Math.round(rawProb <= 1 ? rawProb * 100 : rawProb);
  }, [market]);

  const noProb = 100 - yesProb;

  if (isLoading) {
    return (
      <main className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </main>
    );
  }

  if (error || !market) {
    return (
      <main className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-surface flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-error text-6xl mb-4">error</span>
        <h2 className="text-headline-md mb-2">Market Not Found</h2>
        <p className="text-on-surface-variant mb-6">The market you are looking for does not exist or could not be loaded.</p>
        <Link href="/markets" className="bg-primary text-white px-6 py-2 rounded-lg font-label-caps">
          BACK TO MARKETS
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-surface">
      {/* Background decoration for terminal feel */}
      <div className="fixed bottom-4 left-4 font-data-mono text-[10px] text-outline opacity-50 z-0 pointer-events-none">
        CONNECTED :: ORACLE_NODE_492 // LATENCY: 14ms // REAL-TIME_STREAM: ACTIVE
      </div>

      {/* Main Content Background (Simulated/Blurred) */}
      <div className={`max-w-container-max-width mx-auto p-gutter grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-700 ${showModal ? "opacity-40 select-none pointer-events-none blur-sm" : "opacity-100"}`}>
        <div className="md:col-span-2 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl">
            <div className="h-4 w-24 bg-surface-container rounded mb-4"></div>
            <div className="h-8 w-full bg-surface-container rounded mb-6"></div>
            <div className="h-64 w-full bg-surface-container rounded"></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-surface-container-lowest border border-outline-variant rounded-xl"></div>
            <div className="h-32 bg-surface-container-lowest border border-outline-variant rounded-xl"></div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl h-[500px]"></div>
        </div>
      </div>

      {/* Market Details Quick View Modal Overlay */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-on-background/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-[560px] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-outline-variant overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-bright">
                <div className="flex items-center gap-2">
                  <span className={`bg-${market.status === 'ACTIVE' ? 'secondary' : 'outline'}-container text-on-${market.status === 'ACTIVE' ? 'secondary' : 'outline'}-container font-label-caps text-[10px] px-2 py-0.5 rounded-full font-bold`}>
                    {market.status}
                  </span>
                  <span className="font-label-caps text-label-caps text-outline uppercase font-bold tracking-wider">{market.category}</span>
                </div>
                <Link 
                  href="/markets"
                  className="text-outline hover:text-on-surface transition-colors p-1"
                >
                  <span className="material-symbols-outlined">close</span>
                </Link>
              </div>

              {/* Content Area */}
              <div className="p-6 space-y-6">
                {/* Market Question */}
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                    {market.question}
                  </h2>
                </div>

                {/* 24h Performance & Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display-lg text-display-lg text-on-surface text-4xl">{yesProb}%</span>
                      <span className="text-secondary font-label-caps text-label-caps flex items-center gap-0.5 font-bold">
                        <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                        0.0%
                      </span>
                    </div>
                    <p className="font-label-caps text-label-caps text-outline uppercase font-bold tracking-wider">Current Probability</p>
                  </div>
                  {/* Sparkline Simulation */}
                  <div className="h-16 relative w-full">
                    <svg className="w-full h-full text-secondary stroke-2 fill-none" viewBox="0 0 100 30" preserveAspectRatio="none">
                      <path 
                        d={sparklinePath} 
                        stroke="currentColor" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth="2"
                      />
                      <defs>
                        <linearGradient id="sparkline-gradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
                          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path 
                        d={`${sparklinePath} L100 30 L0 30 Z`} 
                        fill="url(#sparkline-gradient)" 
                        stroke="none"
                      />
                    </svg>
                  </div>
                </div>

                {/* Trading Module */}
                <div className="grid grid-cols-2 gap-3">
                  <button className={`group relative bg-surface-container-lowest border ${side === 'YES' ? 'border-secondary border-2' : 'border-secondary/30'} hover:border-secondary hover:bg-secondary-container/10 p-4 rounded-lg transition-all duration-200`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-label-caps text-label-caps text-secondary font-bold">YES</span>
                      <span className="font-data-mono text-data-mono text-on-surface">${(yesProb/100).toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                      <div className="bg-secondary h-full transition-all duration-500" style={{ width: `${yesProb}%` }}></div>
                    </div>
                  </button>
                  <button className={`group relative bg-surface-container-lowest border ${side === 'NO' ? 'border-tertiary border-2' : 'border-tertiary/30'} hover:border-tertiary hover:bg-tertiary-container/10 p-4 rounded-lg transition-all duration-200`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-label-caps text-label-caps text-tertiary font-bold">NO</span>
                      <span className="font-data-mono text-data-mono text-on-surface">${(noProb/100).toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                      <div className="bg-tertiary h-full transition-all duration-500" style={{ width: `${noProb}%` }}></div>
                    </div>
                  </button>
                </div>

                {/* AI Reasoning Snippet */}
                <div className="bg-[#f0f9fa] border border-primary-container/20 p-4 rounded-lg space-y-2 relative overflow-hidden">
                  <div className="flex items-center gap-2 text-primary z-10 relative">
                    <span className="material-symbols-outlined text-[18px]">psychology</span>
                    <span className="font-label-caps text-label-caps uppercase font-bold tracking-wider">Oracle AI Insights</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant italic z-10 relative leading-relaxed">
                    {market.reasoningTraces?.[0]?.probabilityEstimate 
                      ? `AI Reasoning suggests a ${Math.round(market.reasoningTraces[0].probabilityEstimate * 100)}% probability based on multi-model consensus. Edge detected: ${Math.round(market.reasoningTraces[0].edge * 100)}%.`
                      : "Market sentiment analysis suggests shifting probabilities following recent data. Multi-model consensus is currently evaluating historical correlations."
                    }
                  </p>
                  <div className="absolute right-0 bottom-0 opacity-5 translate-x-4 translate-y-4">
                    <span className="material-symbols-outlined text-6xl">neurology</span>
                  </div>
                </div>
              </div>

              {/* Footer Action */}
              <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col items-center sm:items-start">
                  <span className="font-data-mono text-data-mono text-on-surface font-bold">${(market.totalLiquidity / 1000).toFixed(1)}K Vol</span>
                  <span className="text-[10px] text-outline font-label-caps uppercase font-bold tracking-wider">Total Liquidity</span>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Link href={`/markets/terminal?marketId=${market.id}`} className="flex-1 sm:flex-none font-label-caps text-label-caps text-primary hover:underline px-4 transition-all font-bold text-center">View Full Terminal</Link>
                  <Link href={`/execution-terminal?marketId=${market.id}&side=${side || 'YES'}`} className="flex-1 sm:flex-none bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-label-caps text-label-caps hover:bg-primary-container active:scale-95 transition-all shadow-sm font-bold uppercase text-center">Trade Now</Link>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
