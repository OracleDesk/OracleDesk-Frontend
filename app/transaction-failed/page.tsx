"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function TransactionFailedPage() {
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
      {/* Main Content Canvas (Blurred Background behind modal) */}
      <main className={`flex-grow max-w-container-max-width mx-auto w-full p-gutter grid grid-cols-12 gap-margin transition-all duration-500 pt-24 ${isVisible ? 'opacity-30 blur-md pointer-events-none' : 'opacity-100'}`}>
        
        {/* Institutional Grid Layout Mockup */}
        <div className="col-span-12 lg:col-span-8 space-y-margin">
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-headline-sm text-headline-sm">Open Positions</h2>
              <div className="flex gap-2">
                <span className="bg-surface-container-low px-2 py-1 rounded font-data-mono text-[10px] border border-outline-variant">Live Feed</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[500px]">
                <thead>
                  <tr className="text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant text-left text-[10px]">
                    <th className="pb-3 uppercase tracking-wider">Market</th>
                    <th className="pb-3 uppercase tracking-wider">Position</th>
                    <th className="pb-3 text-right uppercase tracking-wider">Entry</th>
                    <th className="pb-3 text-right uppercase tracking-wider">Probability</th>
                    <th className="pb-3 text-right uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  <tr className="hover:bg-surface-container-low transition-colors group">
                    <td className="py-4 font-medium text-sm">BTC ETF Approval Q1</td>
                    <td className="py-4"><span className="text-secondary font-bold text-xs">YES</span></td>
                    <td className="py-4 text-right font-data-mono text-sm">$0.42</td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden flex">
                          <div className="h-full bg-secondary" style={{ width: '72%' }}></div>
                          <div className="h-full bg-tertiary" style={{ width: '28%' }}></div>
                        </div>
                        <span className="text-xs font-data-mono">72%</span>
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <button className="text-primary font-label-caps text-[11px] font-bold hover:underline">Trade</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors group">
                    <td className="py-4 font-medium text-sm">Fed Rate Cut - March</td>
                    <td className="py-4"><span className="text-tertiary font-bold text-xs">NO</span></td>
                    <td className="py-4 text-right font-data-mono text-sm">$0.18</td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden flex">
                          <div className="h-full bg-secondary" style={{ width: '12%' }}></div>
                          <div className="h-full bg-tertiary" style={{ width: '88%' }}></div>
                        </div>
                        <span className="text-xs font-data-mono">88%</span>
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <button className="text-primary font-label-caps text-[11px] font-bold hover:underline">Trade</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* AI Reasoning Sidebar Mockup */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-surface-container-low border border-primary-container/20 rounded-xl p-6 sticky top-24 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              <h3 className="font-headline-sm text-headline-sm text-primary">Oracle Insights</h3>
            </div>
            <p className="text-on-surface-variant font-body-md mb-6 leading-relaxed text-sm sm:text-base">
              High-frequency volatility detected in the &quot;Electoral Outcome&quot; markets. Institutional liquidity flow suggests a 4.2% shift towards the &apos;No&apos; outcome within the last 15 minutes.
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-white border border-outline-variant rounded-lg">
                <span className="font-label-caps text-label-caps text-tertiary mb-1 block text-[10px] font-bold">Risk Warning</span>
                <p className="text-[11px] text-on-surface leading-snug">Liquidity depth for &apos;March Fed&apos; is below standard thresholds for large orders.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Overlay */}
      {isVisible && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Fixed Backdrop - Blurs everything including global Navbar */}
          <div className="fixed inset-0 bg-on-background/10 backdrop-blur-sm z-[55]" onClick={closeModal}></div>
          
          {/* Transaction Failed Modal */}
          <div className="relative bg-white w-full max-w-[440px] rounded-2xl border border-outline-variant shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 z-[60]">
            {/* Modal Header */}
            <div className="p-6 text-center border-b border-outline-variant">
              <div className="mx-auto w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'wght' 600" }}>error</span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-1 text-xl sm:text-2xl">Transaction Failed</h2>
              <p className="text-on-surface-variant font-body-md text-sm sm:text-base">Your trade could not be processed on the blockchain.</p>
            </div>

            {/* Modal Content (Error Details) */}
            <div className="p-6 space-y-4">
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-tertiary text-[20px] mt-0.5">warning</span>
                  <div className="flex-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant mb-1 block text-[10px] font-bold tracking-tight">Error Code: GAS_INSUFFICIENT_OR_SLIPPAGE</span>
                    <p className="text-on-surface font-body-md leading-relaxed text-[13px]">
                      Execution failed due to <strong className="font-bold">slippage exceeding 0.5%</strong> or insufficient gas for the current network congestion levels.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-data-mono text-on-surface-variant">
                  <span>Gas Used (Estimated)</span>
                  <span className="text-on-surface font-bold">0.00241 ETH</span>
                </div>
                <div className="flex justify-between text-[11px] font-data-mono text-on-surface-variant">
                  <span>Network Status</span>
                  <span className="text-tertiary flex items-center gap-1 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                    Congested
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 flex flex-col gap-3 bg-surface-container-low/50">
              <button 
                onClick={closeModal}
                className="w-full bg-primary text-primary-foreground font-headline-sm h-12 rounded-xl hover:bg-primary-container transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10 font-bold"
              >
                <span className="material-symbols-outlined">refresh</span>
                Retry Transaction
              </button>
              <button 
                onClick={closeModal}
                className="w-full border border-outline text-on-surface-variant font-label-caps text-label-caps h-10 rounded-xl hover:bg-white transition-all font-bold text-[11px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Footer (Simplified for fail state) */}
      <footer className="bg-surface-container-low border-t border-outline-variant mt-auto z-10 relative">
        <div className="flex flex-col md:flex-row justify-between items-center w-full py-8 px-gutter max-w-container-max-width mx-auto gap-4 text-center sm:text-left">
          <span className="font-label-caps text-label-caps font-black text-on-surface-variant">OracleDesk Institutional</span>
          <div className="flex flex-wrap justify-center gap-6">
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-label-caps text-[10px]" href="#">System Status</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-label-caps text-[10px]" href="#">Legal</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-label-caps text-[10px]" href="#">Privacy Policy</Link>
          </div>
          <p className="font-body-md text-[11px] text-on-surface-variant opacity-70">© 2026 OracleDesk Institutional. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
