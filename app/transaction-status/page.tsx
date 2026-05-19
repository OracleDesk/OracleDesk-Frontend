"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function TransactionStatusPage() {
  const [step, setStep] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  const simulateNextStep = () => {
    if (step === 1) {
      setStep(2);
    } else {
      closeModal();
    }
  };

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
        .loading-spinner {
          animation: rotate 2s linear infinite;
        }
        @keyframes rotate {
          100% { transform: rotate(360deg); }
        }
        .loading-spinner circle {
          stroke-dasharray: 1, 200;
          stroke-dashoffset: 0;
          animation: dash 1.5s ease-in-out infinite;
          stroke-linecap: round;
        }
        @keyframes dash {
          0% { stroke-dasharray: 1, 200; stroke-dashoffset: 0; }
          50% { stroke-dasharray: 89, 200; stroke-dashoffset: -35px; }
          100% { stroke-dasharray: 89, 200; stroke-dashoffset: -124px; }
        }
        .step-transition {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .status-dot-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
      `}</style>

      {/* Main Content Canvas (Background behind modal) */}
      <main className={`flex-grow max-w-container-max-width mx-auto w-full p-gutter grid grid-cols-12 gap-gutter transition-all duration-500 pt-24 ${isVisible ? 'opacity-30 blur-sm pointer-events-none' : 'opacity-100'}`}>
        <aside className="col-span-12 lg:col-span-3 space-y-gutter">
          <div className="bg-surface-container-lowest border border-outline-variant p-margin rounded-xl shadow-sm">
            <h3 className="font-headline-sm text-headline-sm mb-4">Account Overview</h3>
            <div className="h-4 w-3/4 bg-surface-container mb-2 rounded"></div>
            <div className="h-4 w-1/2 bg-surface-container mb-6 rounded"></div>
            <div className="space-y-3">
              <div className="flex justify-between h-8 bg-surface-container-low rounded-lg px-2 items-center"></div>
              <div className="flex justify-between h-8 bg-surface-container-low rounded-lg px-2 items-center"></div>
            </div>
          </div>
        </aside>
        <section className="col-span-12 lg:col-span-9">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-margin border-b border-outline-variant bg-surface-container-low">
              <h2 className="font-headline-md text-headline-md">Active Positions</h2>
            </div>
            <div className="p-margin space-y-4">
              <div className="grid grid-cols-4 gap-4 pb-4 border-b border-outline-variant">
                <div className="h-4 bg-surface-container rounded"></div>
                <div className="h-4 bg-surface-container rounded"></div>
                <div className="h-4 bg-surface-container rounded"></div>
                <div className="h-4 bg-surface-container rounded"></div>
              </div>
              <div className="h-16 bg-surface-container-low rounded-lg"></div>
              <div className="h-16 bg-surface-container-low rounded-lg"></div>
              <div className="h-16 bg-surface-container-low rounded-lg"></div>
            </div>
          </div>
        </section>
      </main>

      {/* Modal Overlay */}
      {isVisible && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Fixed Backdrop - Blurs everything including the global Navbar (z-50) */}
          <div className="fixed inset-0 bg-on-background/10 backdrop-blur-sm z-[55]" onClick={closeModal}></div>
          
          <div className="relative bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl w-full max-w-[440px] overflow-hidden step-transition animate-in fade-in zoom-in duration-300 z-[60]">
            {/* Modal Header */}
            <div className="p-6 flex justify-between items-center border-b border-outline-variant bg-white">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                {step === 1 ? "Confirm Transaction" : "Transaction Submitted"}
              </h2>
              <button 
                onClick={closeModal}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-8 flex flex-col items-center text-center">
              {step === 1 ? (
                /* Step 1: Confirm in Wallet */
                <div className="w-full flex flex-col items-center animate-in fade-in duration-500">
                  <div className="relative w-24 h-24 mb-6">
                    <svg className="loading-spinner w-full h-full" viewBox="0 0 50 50">
                      <circle className="path stroke-primary" cx="25" cy="25" fill="none" r="20" strokeWidth="2"></circle>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                    </div>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm mb-2 text-on-surface">Confirm in Wallet</h3>
                  <p className="font-body-md text-on-surface-variant max-w-[280px] text-sm sm:text-base">Please check your wallet extension to authorize this trade on the Oracle Network.</p>
                </div>
              ) : (
                /* Step 2: Transaction Submitted */
                <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="w-20 h-20 mb-6 bg-secondary-container rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-secondary-container text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm mb-2 text-on-surface">Transaction Submitted</h3>
                  <p className="font-body-md text-on-surface-variant mb-6 text-sm sm:text-base">Your trade has been broadcast to the network. Processing times may vary.</p>
                  
                  {/* Info Card */}
                  <div className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-4 text-left space-y-3 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="font-label-caps text-label-caps text-on-surface-variant text-[10px]">Status</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-secondary status-dot-pulse"></span>
                        <span className="font-label-caps text-label-caps text-secondary text-[10px] font-bold">Broadcasting</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-label-caps text-label-caps text-on-surface-variant text-[10px]">TX Hash</span>
                      <div className="flex items-center gap-1 overflow-hidden">
                        <span className="font-data-mono text-data-mono text-on-surface truncate max-w-[140px] text-[11px]">0x72a...83d2</span>
                        <span className="material-symbols-outlined text-sm text-primary cursor-pointer active:opacity-50">content_copy</span>
                      </div>
                    </div>
                  </div>
                  <Link className="flex items-center gap-2 text-primary font-label-caps text-label-caps hover:underline text-[11px] font-bold" href="#" target="_blank">
                    View on Explorer
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex flex-col sm:flex-row gap-3">
              {step === 1 && (
                <button 
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-outline text-on-surface font-label-caps text-label-caps rounded hover:bg-surface-variant transition-colors"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={simulateNextStep}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground font-label-caps text-label-caps rounded hover:opacity-90 transition-opacity font-bold shadow-sm"
              >
                {step === 1 ? "Simulate Wallet Confirm" : "Return to Market"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Log (Fixed Bottom Right) */}
      <div className="fixed bottom-6 right-6 z-40 hidden md:block">
        <div className="bg-on-background text-surface p-4 rounded-lg shadow-2xl border border-outline-variant w-80 font-data-mono text-[11px] leading-relaxed">
          <div className="flex justify-between items-center mb-2 border-b border-outline-variant pb-1">
            <span className="text-secondary-fixed font-bold tracking-tight">ORACLE_SYSTEM_LOGS</span>
            <span className="opacity-50">v2.4.1</span>
          </div>
          <p className="opacity-70">[14:22:10] Connection established: RPC_NODE_04</p>
          <p className="opacity-70">[14:22:11] Market: "BTC_PROB_75K_EOY" price feed synced</p>
          <p className="text-secondary-fixed">[14:23:45] Pending Transaction Detected: User_ID:0x...a1</p>
          <p className="animate-pulse">_</p>
        </div>
      </div>
    </div>
  );
}
