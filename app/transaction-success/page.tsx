"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function TransactionSuccessPage() {
  const [isVisible, setIsVisible] = useState(true);

  const closeModal = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-body-md overflow-x-hidden relative">
      <style jsx global>{`
        .success-glow {
          box-shadow: 0 0 30px rgba(0, 108, 73, 0.15);
        }
        .modal-blur {
          backdrop-filter: blur(8px);
          background-color: rgba(11, 28, 48, 0.4);
        }
      `}</style>

      {/* Main Content Canvas (Blurred Background behind modal) */}
      <main className={`flex-grow max-w-container-max-width mx-auto w-full p-gutter grid grid-cols-12 gap-6 transition-all duration-500 pt-24 ${isVisible ? 'opacity-30 blur-md pointer-events-none' : 'opacity-100'}`}>
        {/* Mock Portfolio Content */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm">
            <div className="font-headline-md text-headline-md mb-6">Portfolio Performance</div>
            <div className="h-64 bg-surface-container rounded-xl flex items-end p-6 gap-3 sm:gap-4">
              <div className="w-full bg-secondary h-1/2 rounded-t-lg opacity-40"></div>
              <div className="w-full bg-secondary h-2/3 rounded-t-lg opacity-60"></div>
              <div className="w-full bg-secondary h-3/4 rounded-t-lg opacity-80"></div>
              <div className="w-full bg-secondary h-1/2 rounded-t-lg opacity-40"></div>
              <div className="w-full bg-secondary h-2/3 rounded-t-lg opacity-60"></div>
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm h-full">
            <div className="font-headline-sm text-headline-sm mb-6">Recent Activity</div>
            <div className="space-y-6">
              <div className="h-4 bg-surface-container w-3/4 rounded"></div>
              <div className="h-4 bg-surface-container w-full rounded"></div>
              <div className="h-4 bg-surface-container w-2/3 rounded"></div>
              <div className="h-4 bg-surface-container w-1/2 rounded"></div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Overlay */}
      {isVisible && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop - Blurs global Navbar (z-50) and background content */}
          <div className="fixed inset-0 bg-on-background/30 backdrop-blur-sm z-[55]" onClick={closeModal}></div>
          
          {/* Transaction Success Modal */}
          <div className="relative bg-surface-container-lowest border border-outline-variant rounded-2xl w-full max-w-[480px] overflow-hidden success-glow animate-in fade-in zoom-in duration-300 z-[60] shadow-2xl">
            {/* Header/Icon Section */}
            <div className="relative pt-10 sm:pt-12 pb-6 sm:pb-8 flex flex-col items-center bg-white">
              <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-6 animate-bounce transition-all duration-1000">
                <span className="material-symbols-outlined text-on-secondary-container text-[48px]" style={{ fontVariationSettings: "'wght' 600, 'FILL' 1" }}>check_circle</span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface text-xl sm:text-2xl">Transaction Successful</h2>
              <p className="font-body-md text-on-surface-variant mt-2 text-center px-6 sm:px-8 text-sm sm:text-base">Your trade has been executed and confirmed on the blockchain.</p>
            </div>

            {/* Trade Summary Card */}
            <div className="px-6 sm:px-8 pb-8">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 sm:p-5 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-label-caps text-label-caps text-on-surface-variant text-[10px]">MARKET</span>
                  <span className="font-body-md font-semibold text-primary text-xs sm:text-sm">US Presidential Election 2029</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block font-label-caps text-label-caps text-on-surface-variant mb-1 text-[10px]">POSITION</span>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      <span className="font-body-lg text-body-lg font-bold text-sm sm:text-base">YES</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant mb-1 text-[10px]">CONTRACTS</span>
                    <span className="font-body-lg text-body-lg font-bold text-sm sm:text-base">1,250 Shares</span>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/30">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant mb-1 text-[10px]">AVG. PRICE</span>
                    <span className="font-data-mono font-bold text-sm sm:text-base">$0.62</span>
                  </div>
                  <div className="text-right pt-2 border-t border-outline-variant/30">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant mb-1 text-[10px]">TOTAL COST</span>
                    <span className="font-data-mono font-bold text-on-surface text-sm sm:text-base">$775.00 USDC</span>
                  </div>
                </div>
              </div>

              {/* TX Hash & Details */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-body-md text-on-surface-variant">Transaction Hash</span>
                  <div className="flex items-center gap-2 font-data-mono text-primary cursor-pointer hover:underline">
                    <span>0x8a2b...f91c</span>
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-body-md text-on-surface-variant">Network Fee</span>
                  <span className="font-data-mono text-on-surface">0.00042 ETH (~$1.24)</span>
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="font-body-md text-on-surface-variant">Execution Time</span>
                  <span className="font-data-mono text-on-surface">1.8s</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button className="w-full bg-primary text-primary-foreground h-12 rounded-lg font-headline-sm text-sm sm:text-base font-bold hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10">
                  View Portfolio
                </button>
                <button className="w-full bg-white border border-outline text-on-surface h-12 rounded-lg font-headline-sm text-sm sm:text-base hover:bg-surface transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">share</span>
                  Share Trade
                </button>
              </div>
            </div>

            {/* Footer Meta */}
            <div className="bg-surface-container px-8 py-4 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="text-[10px] font-label-caps text-on-surface-variant font-bold tracking-tight">Secured by OracleDesk Settlement Layer</span>
            </div>
          </div>
        </div>
      )}

      {/* Background Decoration (AI Reasoning Card Style) */}
      <div className="fixed bottom-10 right-10 w-64 p-4 rounded-xl border border-primary/20 bg-[#f0f9fa] shadow-xl pointer-events-none opacity-40 hidden md:block z-40">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
          <span className="font-label-caps text-label-caps text-primary text-[10px] font-bold uppercase tracking-wider">Oracle Insight</span>
        </div>
        <p className="text-[12px] leading-relaxed italic text-on-primary-container">
          &quot;Whale accumulation detected in the YES direction over the last 4h. Sentiment remains bullish.&quot;
        </p>
      </div>
    </div>
  );
}
