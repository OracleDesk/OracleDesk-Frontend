"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function UnlockPremiumTracePage() {
  const [selectedPass, setSelectedPass] = useState<"single" | "daily">("single");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showModal, setShowModal] = useState(true);

  const handlePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsConfirmed(true);
      setTimeout(() => {
        setShowModal(false);
      }, 1500);
    }, 2000);
  };

  return (
    <main className="relative min-h-[calc(100vh-64px)] overflow-hidden">
      {/* Background Pattern */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(#e5eeff_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>

      {/* Main Content Simulation (Blurred Background) */}
      <div className={`pt-24 pb-12 px-gutter max-w-container-max-width mx-auto transition-all duration-700 ${showModal ? "opacity-40 select-none pointer-events-none blur-sm" : "opacity-100"}`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {/* Market Overview */}
          <div className="col-span-12 lg:col-span-8 bg-white border border-outline-variant p-6 md:p-8 rounded-xl shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <div>
                <h1 className="font-headline-md text-headline-md mb-2">2029 Election: Pennsylvania Electoral Votes</h1>
                <div className="flex flex-wrap items-center gap-3 text-on-surface-variant text-sm">
                  <div className="flex items-center gap-1 font-data-mono">
                    <span className="material-symbols-outlined text-[18px]">monitoring</span>
                    VOL: $14.2M
                  </div>
                  <span className="hidden md:inline text-outline-variant">•</span>
                  <div className="flex items-center gap-1 font-data-mono">
                    <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                    EXPIRY: NOV 5, 2029
                  </div>
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="font-display-lg text-display-lg text-primary leading-none">54.2%</div>
                <div className="font-label-caps text-label-caps text-secondary mt-1">YES PROBABILITY</div>
              </div>
            </div>
            {/* Mock Chart Area */}
            <div className="h-64 md:h-80 bg-surface-container-low border border-outline-variant flex items-center justify-center rounded-lg">
              <span className="material-symbols-outlined text-outline-variant text-6xl opacity-30">show_chart</span>
            </div>
          </div>

          {/* Terminal Stream */}
          <div className="col-span-12 lg:col-span-4 bg-white border border-outline-variant p-6 rounded-xl shadow-sm h-fit">
            <div className="flex items-center gap-2 mb-6 border-b border-outline-variant pb-3">
              <span className="material-symbols-outlined text-primary text-[20px]">terminal</span>
              <span className="font-label-caps text-label-caps font-bold">LIVE TRACE LOGS</span>
            </div>
            <div className="space-y-4 font-data-mono text-data-mono opacity-60 text-sm">
              <div className="flex gap-2"><span className="text-secondary">[09:21:44]</span> TRACE_INIT: AGENT_7</div>
              <div className="flex gap-2"><span className="text-secondary">[09:21:45]</span> FETCH: POLL_DATA_PA</div>
              <div className="flex gap-2"><span className="text-secondary">[09:21:48]</span> COMPUTE: REGRESSION_V3</div>
              <div className="flex gap-2"><span className="text-secondary">[09:21:50]</span> SIGNAL: BUY_YES</div>
              <div className="flex gap-2"><span className="text-secondary">[09:21:55]</span> PENDING: PREMIUM_ACCESS...</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Overlay */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-gutter bg-on-background/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-[560px] bg-white border border-outline shadow-2xl overflow-hidden flex flex-col rounded-xl"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-container flex items-center justify-center rounded-lg">
                    <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>lock_open</span>
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Unlock Premium Trace</h2>
                    <p className="font-body-md text-on-surface-variant text-xs">Access institutional AI reasoning & real-time agent logs.</p>
                  </div>
                </div>
                <Link href="/reasoning" className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
                  <span className="material-symbols-outlined">close</span>
                </Link>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                {/* Teaser Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-surface-container-low border border-outline-variant relative overflow-hidden rounded-lg">
                    <span className="material-symbols-outlined text-primary mb-2">psychology</span>
                    <div className="font-label-caps text-label-caps mb-1 font-bold">Deep Reasoning</div>
                    <div className="font-body-md text-xs text-on-surface-variant">Step-by-step logic behind every probability shift.</div>
                    <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 pointer-events-none">
                      <span className="material-symbols-outlined text-6xl">neurology</span>
                    </div>
                  </div>
                  <div className="p-4 bg-surface-container-low border border-outline-variant relative overflow-hidden rounded-lg">
                    <span className="material-symbols-outlined text-secondary mb-2">database</span>
                    <div className="font-label-caps text-label-caps mb-1 font-bold">Raw Data Feed</div>
                    <div className="font-body-md text-xs text-on-surface-variant">Unfiltered access to the underlying 40+ API sources.</div>
                    <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 pointer-events-none">
                      <span className="material-symbols-outlined text-6xl">stream</span>
                    </div>
                  </div>
                </div>

                {/* Pricing Selector */}
                <div className="space-y-4">
                  <div className="font-label-caps text-label-caps text-on-surface-variant font-bold">SELECT ACCESS DURATION</div>
                  
                  {/* Single Trace Option */}
                  <label 
                    className={`group relative flex items-center justify-between p-4 border transition-all cursor-pointer rounded-lg ${selectedPass === 'single' ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-outline-variant bg-white hover:border-primary/50"}`}
                    onClick={() => setSelectedPass('single')}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPass === 'single' ? "border-primary" : "border-outline-variant"}`}>
                        {selectedPass === 'single' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                      </div>
                      <div>
                        <div className="font-headline-sm text-headline-sm">Single Trace</div>
                        <div className="font-body-md text-xs text-on-surface-variant">Unlock this specific market's reasoning.</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-mono text-headline-sm text-primary">$2.00</div>
                      <div className="font-label-caps text-[10px] text-on-surface-variant font-bold">USDC / ON-CHAIN</div>
                    </div>
                  </label>

                  {/* Daily Pass Option */}
                  <label 
                    className={`group relative flex items-center justify-between p-4 border transition-all cursor-pointer rounded-lg ${selectedPass === 'daily' ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-outline-variant bg-white hover:border-primary/50"}`}
                    onClick={() => setSelectedPass('daily')}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPass === 'daily' ? "border-primary" : "border-outline-variant"}`}>
                        {selectedPass === 'daily' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                      </div>
                      <div>
                        <div className="font-headline-sm text-headline-sm flex items-center gap-2">
                          24-Hour Pass
                          <span className="bg-secondary-container text-on-secondary-container text-[10px] px-1.5 py-0.5 font-bold font-label-caps rounded">POPULAR</span>
                        </div>
                        <div className="font-body-md text-xs text-on-surface-variant">Unlimited traces across all markets.</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-data-mono text-headline-sm text-primary">$5.00</div>
                      <div className="font-label-caps text-[10px] text-on-surface-variant font-bold">USDC / ON-CHAIN</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Modal Footer / Action */}
              <div className="p-6 bg-surface border-t border-outline-variant space-y-4">
                <button 
                  className={`w-full h-14 text-headline-sm font-bold flex items-center justify-center gap-3 transition-all rounded-lg ${isConfirmed ? "bg-secondary text-white" : "bg-primary-container text-primary-foreground hover:bg-primary"} ${isProcessing ? "opacity-70 cursor-wait" : "active:scale-[0.99]"}`}
                  disabled={isProcessing || isConfirmed}
                  onClick={handlePayment}
                >
                  {isProcessing ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      Authorizing Wallet...
                    </>
                  ) : isConfirmed ? (
                    <>
                      <span className="material-symbols-outlined">check_circle</span>
                      Payment Confirmed
                    </>
                  ) : (
                    <>
                      <img alt="USDC Logo" className="w-6 h-6" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBBvpQJwosd2Frufdsjv33xmFEaqtUyhsE7FZ71B5HnGDdKxuZG6lxUBHLUN_72b5kg8Agl5q3-hEH2fEuAb-_pLcvFyXnM2K9saaM5DGU8S2lDvNZOLVEDFLm5SZ9m-oysbN474n7-m_f-fQPvR6m4aDDh2HeL4e_wKmfjwe5QkDRKk08h6N-QM6DBGHrMYIomFLujEFtdcTyccMq0i3ccnRBg7U4tC0Ig0D_KgAfB-bt_2ZdSeXk_I5gkzYAQszAvYnfg5lpgPA" />
                      Pay with USDC
                    </>
                  )}
                </button>
                
                <div className="flex flex-wrap items-center justify-center gap-6 opacity-60">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">verified_user</span>
                    <span className="font-label-caps text-[10px] font-bold">SECURE ON-CHAIN PAY</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">bolt</span>
                    <span className="font-label-caps text-[10px] font-bold">INSTANT UNLOCK</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
