"use client";

import React, { useState, useRef } from "react";

export default function CopyTradePage() {
  const [allocation, setAllocation] = useState(12.5);
  const [isMevProtected, setIsMevProtected] = useState(true);
  const [slippage, setSlippage] = useState(1.0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const totalBankroll = 42000; // Example total bankroll
  const allocatedAmount = (totalBankroll * allocation) / 100;

  const handleSliderInteraction = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setAllocation(percentage);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    handleSliderInteraction(e.clientX);
    const onMouseMove = (moveEvent: MouseEvent) => handleSliderInteraction(moveEvent.clientX);
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleSliderInteraction(e.touches[0].clientX);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col">
      <style jsx global>{`
        .ai-shimmer {
          background: linear-gradient(
            90deg,
            rgba(145, 215, 238, 0.1) 0%,
            rgba(145, 215, 238, 0.2) 50%,
            rgba(145, 215, 238, 0.1) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 3s infinite linear;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <main className="flex-grow flex items-center justify-center p-4 sm:p-margin relative">
        {/* Fixed Backdrop - Blurs everything including the global Navbar (z-50) */}
        <div className="fixed inset-0 bg-on-background/10 backdrop-blur-sm z-[55]"></div>

        {/* Copy Trade Modal Canvas */}
        <div className="relative bg-surface border border-outline-variant w-full max-w-[640px] shadow-xl rounded-xl overflow-hidden z-[60] animate-in fade-in zoom-in duration-300">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-white">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Confirm Copy Trade</h2>
              <p className="font-body-md text-body-md text-on-surface-variant text-sm">Execution through OracleDesk Institutional Routing</p>
            </div>
            <button className="material-symbols-outlined p-2 hover:bg-surface-container rounded-full transition-colors">close</button>
          </div>

          {/* AI Reasoning Section */}
          <div className="bg-[#f0f9fa] border-b border-outline-variant p-6 relative overflow-hidden ai-shimmer text-xs sm:text-sm">
            <div className="flex items-start gap-4">
              <div className="bg-primary-container p-2 rounded-lg flex-shrink-0">
                <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-primary-container mb-1 block">ORACLE INSIGHTS • 94% CONFIDENCE</span>
                <p className="font-body-md text-body-md text-on-primary-fixed-variant leading-relaxed">
                  Market sentiment for <span className="font-bold">US-CPI-NOV-24</span> shows aggressive hedging in decentralized prediction markets. Bayesian modeling suggests a 68.2% probability of &quot;Yes&quot; exceeding the 2.4% threshold, diverging from Bloomberg consensus by +14bps.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Market Context & Proposed Side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Proposed Side</span>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-secondary"></span>
                  <span className="font-headline-sm text-headline-sm text-secondary text-base sm:text-lg">YES / LONG</span>
                </div>
              </div>
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Probability</span>
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface text-base sm:text-lg">68.2%</span>
                  <span className="text-[10px] text-secondary font-bold px-1 bg-secondary-container rounded">+2.4% Δ</span>
                </div>
              </div>
            </div>

            {/* Bankroll Allocation */}
            <div className="space-y-3">
              <div className="flex justify-between items-end flex-wrap gap-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">Bankroll Allocation (%)</label>
                <span className="font-data-mono text-data-mono text-primary font-bold text-xs sm:text-sm">
                  {allocation.toFixed(2)}% (${allocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </span>
              </div>
              <div 
                ref={sliderRef}
                className="relative h-2 bg-surface-container rounded-full cursor-pointer touch-none"
                onMouseDown={onMouseDown}
                onTouchStart={(e) => handleSliderInteraction(e.touches[0].clientX)}
                onTouchMove={onTouchMove}
              >
                <div 
                  className="absolute inset-y-0 left-0 bg-primary-container rounded-full"
                  style={{ width: `${allocation}%` }}
                ></div>
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary border-2 border-white rounded-full shadow-md"
                  style={{ left: `calc(${allocation}% - 8px)` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] font-medium text-on-surface-variant px-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Advanced Settings Section */}
            <div className="p-4 bg-surface-container-low rounded-lg space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline text-sm">settings</span>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">Slippage Tolerance</span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {[0.5, 1.0, 3.0].map((val) => (
                    <button
                      key={val}
                      onClick={() => setSlippage(val)}
                      className={`flex-1 sm:flex-none px-3 py-1 text-[11px] font-bold border rounded transition-all ${
                        slippage === val
                          ? "border-primary border-2 bg-white text-primary"
                          : "border-outline-variant bg-white hover:border-primary text-on-surface-variant"
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-4 border-t border-outline-variant flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline text-sm">security</span>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">MEV Protection</span>
                </div>
                <button 
                  onClick={() => setIsMevProtected(!isMevProtected)}
                  className="relative inline-flex items-center cursor-pointer focus:outline-none"
                >
                  <div className={`w-8 h-4 rounded-full transition-colors ${isMevProtected ? 'bg-secondary' : 'bg-outline-variant'}`}></div>
                  <div className={`absolute left-[2px] top-[2px] bg-white rounded-full h-3 w-3 transition-transform ${isMevProtected ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>

            {/* Confirm Action */}
            <div className="space-y-3">
              <button className="w-full bg-[#005f73] text-primary-foreground py-4 rounded-lg font-headline-sm text-headline-sm shadow-lg shadow-primary-container/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer">
                <span className="material-symbols-outlined text-xl">bolt</span>
                Confirm Copy Trade
              </button>
              <p className="text-center font-body-md text-body-md text-on-surface-variant text-xs">
                By confirming, you authorize execution on <span className="underline decoration-dotted cursor-help">Polymarket</span> and <span className="underline decoration-dotted cursor-help">Kalshi</span>.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
