"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/contexts/WalletContext";

export default function ExecutionTerminalPage() {
  const { openModal, isConnected } = useWallet();
  const [amount, setAmount] = useState<string>("1000.00");
  const [isModalOpen, setIsModalOpen] = useState(true);

  const price = 0.68;
  const shares = (parseFloat(amount) || 0) / price;
  const potentialPayout = shares; // usually 1 USDC per share on success

  const handleTrade = (side: 'YES' | 'NO') => {
    if (!isConnected) {
      alert("Please connect your wallet first.");
      openModal();
      return;
    }
    alert(`Trade executed: Buy ${side} shares for ${amount} USDC`);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased overflow-x-hidden pt-20">
      {/* Main Content Canvas (Blurred Background Context) */}
      <main className={`px-gutter max-w-container-max-width mx-auto min-h-[calc(100vh-200px)] transition-all duration-300 ${isModalOpen ? 'blur-sm grayscale-[0.1]' : ''}`}>
        <div className="grid grid-cols-12 gap-6 opacity-30 select-none pointer-events-none">
          {/* Background Mock UI */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-secondary-container text-on-secondary-container text-[10px] font-bold px-2 py-0.5 rounded uppercase">Politics</span>
                <h1 className="font-headline-md text-headline-md">Will the proposed tax bill pass before Q3?</h1>
              </div>
              <div className="h-64 bg-surface-container rounded-lg mb-4"></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-32 bg-surface-container-low border border-outline-variant rounded-xl"></div>
              <div className="h-32 bg-surface-container-low border border-outline-variant rounded-xl"></div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="h-96 bg-surface-container-lowest border border-outline-variant rounded-xl"></div>
          </div>
        </div>
      </main>

      {/* Modal Backdrop */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-on-background/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          {/* BUY NO Modal (Institutional Styling) */}
          <div className="bg-surface-container-lowest w-full max-w-[480px] rounded-xl shadow-2xl overflow-hidden border border-outline-variant animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <div>
                <span className="font-label-caps text-label-caps text-tertiary uppercase tracking-widest block mb-1">Execution Terminal</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Buy Shares</h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-2"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Probability Bar */}
            <div className="px-5 sm:px-6 py-4 bg-surface-container-lowest">
              <div className="flex justify-between font-label-caps text-label-caps mb-2 text-[10px] sm:text-xs font-bold">
                <span className="text-secondary">YES 32%</span>
                <span className="text-tertiary">NO 68%</span>
              </div>
              <div className="h-1.5 w-full bg-surface-container rounded-full flex overflow-hidden">
                <div className="h-full bg-secondary transition-all duration-700" style={{ width: '32%' }}></div>
                <div className="h-full bg-tertiary transition-all duration-700" style={{ width: '68%' }}></div>
              </div>
            </div>

            {/* Trade Form */}
            <div className="p-5 sm:p-6 space-y-6">
              {/* Input Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="font-label-caps text-label-caps text-on-surface-variant">Investment Amount</label>
                  <span className="text-[10px] sm:text-[11px] text-on-surface-variant">Available: <span className="font-data-mono font-bold text-on-surface">24,500.00 USDC</span></span>
                </div>
                <div className="relative">
                  <input 
                    className="w-full bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-lg px-4 py-3 sm:py-4 font-headline-md text-xl sm:text-headline-md text-on-surface outline-none transition-all placeholder:text-outline-variant" 
                    placeholder="0.00" 
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="font-label-caps text-label-caps text-on-surface-variant hidden xs:inline">USDC</span>
                    <button className="text-[10px] font-bold bg-surface-variant text-on-surface-variant px-2 py-1 rounded hover:bg-outline-variant transition-colors">MAX</button>
                  </div>
                </div>
              </div>

              {/* Transaction Details (High Density) */}
              <div className="bg-surface-container-low rounded-lg p-4 space-y-3 border border-outline-variant">
                <div className="flex justify-between items-center text-sm sm:text-base">
                  <span className="font-body-md text-on-surface-variant">Estimated Shares</span>
                  <span className="font-data-mono font-bold text-on-surface">{shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm sm:text-base">
                  <span className="font-body-md text-on-surface-variant">Avg. Purchase Price</span>
                  <span className="font-data-mono font-bold text-on-surface">0.68 USDC</span>
                </div>
                <div className="h-px bg-outline-variant/30"></div>
                <div className="flex justify-between items-center">
                  <span className="font-body-md text-sm sm:text-base text-on-surface-variant">Potential Payout</span>
                  <div className="text-right">
                    <span className="font-data-mono font-bold text-secondary text-sm sm:text-base">{potentialPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</span>
                    <span className="block text-[10px] text-secondary font-bold">+47.06% Return</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleTrade('YES')}
                  className="w-full bg-secondary text-white py-3 sm:py-4 rounded-lg font-headline-sm text-lg sm:text-headline-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-secondary/20 flex items-center justify-center gap-2"
                >
                  <span>BUY YES</span>
                  <span className="material-symbols-outlined text-xl">trending_up</span>
                </button>
                <button 
                  onClick={() => handleTrade('NO')}
                  className="w-full bg-tertiary text-white py-3 sm:py-4 rounded-lg font-headline-sm text-lg sm:text-headline-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-tertiary/20 flex items-center justify-center gap-2"
                >
                  <span>BUY NO</span>
                  <span className="material-symbols-outlined text-xl">trending_down</span>
                </button>
              </div>
              <p className="text-center font-label-caps text-[9px] sm:text-[10px] text-on-surface-variant uppercase tracking-tighter">
                Orders are final and cannot be cancelled once executed on-chain.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
