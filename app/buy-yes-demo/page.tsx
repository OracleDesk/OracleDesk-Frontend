"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function BuyYesDemoPage() {
  const [amount, setAmount] = useState<string>("1000.00");
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isFlickering, setIsFlickering] = useState(false);

  const price = 0.64;
  const shares = (parseFloat(amount) || 0) / price;
  const potentialPayout = shares; // Usually 1 USDC per share on success
  const maxProfit = potentialPayout - (parseFloat(amount) || 0);
  const profitPercentage = ((maxProfit / (parseFloat(amount) || 1)) * 100).toFixed(1);

  // Micro-interaction: flicker effect when amount changes
  useEffect(() => {
    setIsFlickering(true);
    const timer = setTimeout(() => setIsFlickering(false), 40);
    return () => clearTimeout(timer);
  }, [amount]);

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased overflow-x-hidden">
      {/* Header Navigation Shell */}
      <header className="bg-surface dark:bg-on-background border-b border-outline-variant dark:border-outline h-16 w-full fixed top-0 z-50">
        <div className="flex justify-between items-center w-full h-16 px-gutter max-w-container-max-width mx-auto">
          <div className="flex items-center gap-8">
            <span className="font-headline-md text-headline-md font-bold text-on-surface dark:text-surface-bright underline decoration-primary decoration-4 underline-offset-8">OracleDesk</span>
            <nav className="hidden md:flex items-center gap-6 h-full pt-1">
              <Link className="text-primary dark:text-primary-fixed-dim border-b-2 border-primary dark:border-primary-fixed-dim pb-1 font-bold font-label-caps text-label-caps" href="#">Markets</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium font-label-caps text-label-caps hover:text-primary transition-colors duration-200" href="#">Reasoning</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium font-label-caps text-label-caps hover:text-primary transition-colors duration-200" href="#">Portfolio</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium font-label-caps text-label-caps hover:text-primary transition-colors duration-200" href="#">Stats</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-container-low rounded-lg border border-outline-variant">
              <span className="material-symbols-outlined text-[20px] text-primary">account_balance_wallet</span>
              <span className="font-data-mono text-data-mono text-sm">14,250.40 USDC</span>
            </div>
            <button className="bg-primary text-on-primary px-4 py-2 font-label-caps text-label-caps font-bold hover:bg-primary-container transition-all cursor-pointer active:opacity-80 rounded">Connect Wallet</button>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary hidden xs:inline">notifications</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary">expand_more</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="min-h-screen pt-16 flex items-center justify-center relative overflow-hidden bg-surface">
        {/* Ambient Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(#004655 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>

        {/* Background Market View (Blurred Overlay) */}
        <div className={`container max-w-container-max-width mx-auto p-gutter transition-all duration-500 ${isModalOpen ? 'opacity-30 blur-md grayscale-[0.3] scale-105' : 'opacity-100 blur-0'}`}>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8 space-y-6">
              <div className="bg-white border border-outline-variant p-6 h-64 rounded-xl shadow-sm"></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-outline-variant p-6 h-40 rounded-xl shadow-sm"></div>
                <div className="bg-white border border-outline-variant p-6 h-40 rounded-xl shadow-sm"></div>
              </div>
            </div>
            <div className="hidden lg:block lg:col-span-4 bg-white border border-outline-variant p-6 h-[500px] rounded-xl shadow-sm"></div>
          </div>
        </div>

        {/* Buy YES Modal Overlay */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-on-background/20 backdrop-blur-md p-4">
            <div className="bg-white border border-outline shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col transition-all transform animate-in fade-in zoom-in duration-300 rounded-xl">
              {/* Modal Header */}
              <div className="p-6 border-b border-outline-variant flex justify-between items-start bg-white">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-secondary-container text-on-secondary-container text-[10px] px-1.5 py-0.5 font-bold rounded uppercase tracking-wider">Active Market</span>
                    <span className="text-on-surface-variant font-data-mono text-[12px]">ID: OD-US-FED-249</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-background lg:text-xl">US GDP Growth exceeds 3.0% in Q4 2026?</h2>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-on-surface-variant hover:text-on-background p-1 active:opacity-60 transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Probability Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between font-label-caps text-label-caps uppercase text-on-surface-variant text-[10px] sm:text-xs font-bold">
                    <span className="text-secondary">YES (64%)</span>
                    <span className="text-tertiary">NO (36%)</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
                    <div className="h-full bg-secondary transition-all duration-1000" style={{ width: '64%' }}></div>
                    <div className="h-full bg-tertiary/20" style={{ width: '36%' }}></div>
                  </div>
                  <div className="flex justify-center">
                    <div className="w-px h-2 bg-outline-variant"></div>
                  </div>
                </div>

                {/* Balance Row */}
                <div className="flex justify-between items-center bg-surface-container-low px-4 py-3 border border-outline-variant rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
                    <span className="text-on-surface-variant font-medium text-sm sm:text-base">Available Balance</span>
                  </div>
                  <span className="font-data-mono font-bold text-on-surface text-sm sm:text-base">14,250.40 USDC</span>
                </div>

                {/* Trading Input Area */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px] sm:text-xs">Investment Amount</label>
                    <div className="relative group">
                      <input 
                        className="w-full bg-white border-2 border-outline-variant group-hover:border-primary-container focus:border-primary focus:ring-2 focus:ring-primary/10 p-4 font-data-mono text-[24px] font-bold outline-none transition-all pr-24 rounded-lg" 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                        <button className="text-[12px] font-bold text-primary hover:underline uppercase tracking-tight">Max</button>
                        <span className="text-on-surface-variant font-bold font-data-mono">USDC</span>
                      </div>
                    </div>
                  </div>

                  {/* Data Grid */}
                  <div className="grid grid-cols-2 gap-px bg-outline-variant border border-outline-variant rounded-lg overflow-hidden">
                    <div className="bg-white p-4 space-y-1">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Estimated Shares</span>
                      <div className={`font-data-mono text-headline-sm text-on-surface transition-opacity duration-75 ${isFlickering ? 'opacity-50' : 'opacity-100'}`}>
                        {shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-white p-4 space-y-1">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Potential Payout</span>
                      <div className={`font-data-mono text-headline-sm text-secondary transition-opacity duration-75 ${isFlickering ? 'opacity-50' : 'opacity-100'}`}>
                        {potentialPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                      </div>
                    </div>
                    <div className="bg-white p-4 space-y-1">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Avg Price</span>
                      <div className="font-data-mono text-body-lg text-sm sm:text-base">{price} USDC</div>
                    </div>
                    <div className="bg-white p-4 space-y-1">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Max Profit</span>
                      <div className={`font-data-mono text-body-lg text-secondary text-sm sm:text-base transition-opacity duration-75 ${isFlickering ? 'opacity-50' : 'opacity-100'}`}>
                        +{maxProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({profitPercentage}%)
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Insight Hook */}
                <div className="bg-primary/5 p-4 border border-primary/20 flex gap-4 rounded-lg">
                  <span className="material-symbols-outlined text-primary flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                  <div className="space-y-1">
                    <span className="font-label-caps text-[10px] text-primary uppercase font-bold">Oracle Insights</span>
                    <p className="text-sm text-on-surface-variant leading-relaxed">Recent labor market data suggest a 12% increase in probability for &quot;Yes&quot; within the last 4 hours.</p>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 bg-surface-container-lowest border-t border-outline-variant space-y-4">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <input defaultChecked className="rounded-sm text-primary border-outline-variant focus:ring-primary h-4 w-4" type="checkbox" id="agree"/>
                  <label htmlFor="agree" className="text-[12px] cursor-pointer">I agree to the <span className="underline">Market Rules</span> and institutional trading terms.</label>
                </div>
                <button className="w-full bg-gradient-to-r from-secondary to-on-secondary-container text-white py-4 rounded-lg font-headline-sm text-headline-sm uppercase tracking-wider shadow-lg shadow-secondary/20 hover:brightness-105 active:scale-[0.98] transition-all">
                  BUY YES
                </button>
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant">Execution: &lt; 50ms</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">verified_user</span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant">Slippage Protection: 0.1%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-low dark:bg-on-background border-t border-outline-variant dark:border-outline z-10 relative">
        <div className="flex flex-col md:flex-row justify-between items-center w-full py-8 px-gutter max-w-container-max-width mx-auto gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className="font-label-caps text-label-caps font-black text-on-surface-variant">OracleDesk Institutional</span>
            <span className="hidden sm:inline text-on-surface-variant font-body-md opacity-30">|</span>
            <span className="text-on-surface-variant font-body-md text-[12px] opacity-70">© 2026. All rights reserved.</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <Link className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-colors font-label-caps text-label-caps text-[10px] sm:text-xs" href="#">System Status</Link>
            <Link className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-colors font-label-caps text-label-caps text-[10px] sm:text-xs" href="#">API Docs</Link>
            <Link className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-colors font-label-caps text-label-caps text-[10px] sm:text-xs" href="#">Legal</Link>
            <Link className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-colors font-label-caps text-label-caps text-[10px] sm:text-xs" href="#">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
