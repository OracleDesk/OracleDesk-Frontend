"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const logs = [
  ">> [INIT] Requesting trace manifest from IPFS...",
  ">> [CONN] Established peer-to-peer connection with shard-cluster-7",
  ">> [DATA] Downloading shard 1/4 [Reasoning Engine Output]",
  ">> [DATA] Shard 1 received. (Size: 1.2MB)",
  ">> [DATA] Downloading shard 2/4 [Knowledge Graph Reference]",
  ">> [DATA] Shard 2 received. (Size: 0.8MB)",
  ">> [DATA] Downloading shard 3/4 [Probabilistic Calculation Matrix]",
  ">> [DATA] Shard 3 received. (Size: 4.5MB)",
  ">> [DATA] Downloading shard 4/4 [Final Commitment Signature]",
  ">> [DATA] Shard 4 received. (Size: 0.1MB)",
  ">> [AUDIT] Executing Merkle Proof verification...",
  ">> [AUDIT] Validating leaf node: 0x77...2a1",
  ">> [AUDIT] Validating leaf node: 0xbc...f92",
  ">> [AUDIT] Root hash match confirmed.",
  ">> [FINAL] Reconstructing full reasoning trace...",
];

export default function VerifyTracePage() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Initializing cryptographic audit...");
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const startVerification = () => {
    if (isVerifying || isComplete) return;

    setIsVerifying(true);
    setTerminalLogs([">> [INIT] Connecting to decentralized reasoning shard..."]);
    
    let step = 0;
    const interval = setInterval(() => {
      if (step < logs.length) {
        setTerminalLogs((prev) => [...prev, logs[step]]);
        step++;
        const percent = Math.floor((step / logs.length) * 100);
        setProgress(percent);

        if (step === Math.floor(logs.length / 2)) {
          setStatusLabel("Reconstructing cryptographic shards...");
        }
      } else {
        clearInterval(interval);
        completeVerification();
      }
    }, 250);
  };

  const completeVerification = () => {
    setStatusLabel("Verification Complete");
    setTerminalLogs((prev) => [...prev, ">> [SUCCESS] Integrity Verified: All Shards Intact."]);
    setIsComplete(true);
    setIsVerifying(false);
  };

  return (
    <main className="relative min-h-[calc(100vh-64px)] pt-24 pb-16 px-gutter max-w-container-max-width mx-auto overflow-hidden">
      {/* Custom Styles for scanline and pulse */}
      <style jsx global>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(1000%); opacity: 0; }
        }
        .scan-effect {
          position: relative;
          overflow: hidden;
        }
        .scan-effect::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(to right, transparent, #005f73, transparent);
          animation: scanline 3s linear infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 108, 73, 0.4); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 108, 73, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 108, 73, 0); }
        }
        .success-pulse {
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* Dashboard Background Content (Simulated) */}
      <div className="grid grid-cols-12 gap-6 opacity-40 pointer-events-none filter blur-sm transition-all duration-700">
        <div className="col-span-12 md:col-span-8 bg-surface-container-lowest border border-outline-variant p-6 rounded-xl">
          <div className="h-6 w-48 bg-surface-container rounded mb-4"></div>
          <div className="h-32 bg-surface-container rounded mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 w-full bg-surface-container rounded"></div>
            <div className="h-4 w-5/6 bg-surface-container rounded"></div>
            <div className="h-4 w-4/6 bg-surface-container rounded"></div>
          </div>
        </div>
        <div className="col-span-12 md:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl">
            <div className="h-6 w-24 bg-surface-container rounded mb-4"></div>
            <div className="h-20 bg-surface-container rounded"></div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl">
            <div className="h-40 bg-surface-container rounded"></div>
          </div>
        </div>
      </div>

      {/* Verify Trace Modal Overlay */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-on-background/10 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white w-full max-w-2xl rounded-xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Modal Header */}
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Verify Trace Integrity</h2>
                <p className="font-label-caps text-label-caps text-on-surface-variant">NODE-ID: OD-7729-ALPHA</p>
              </div>
            </div>
            <Link href="/reasoning" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </Link>
          </div>

          {/* Modal Content */}
          <div className="p-8 space-y-8">
            {/* Progress Visualization */}
            <div className="relative">
              <div className="flex justify-between mb-2">
                <span className={`font-label-caps text-label-caps ${isComplete ? 'text-on-secondary-container' : 'text-primary'}`}>{statusLabel}</span>
                <span className="font-data-mono text-data-mono text-primary">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Terminal Logs */}
            <div className="bg-on-background rounded-lg p-6 font-data-mono text-data-mono h-64 overflow-y-auto scan-effect shadow-inner custom-scrollbar" ref={terminalRef}>
              <div className="space-y-1 text-secondary-fixed">
                {terminalLogs.map((log, i) => (
                  <motion.p 
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={log && log.includes("[SUCCESS]") ? "text-secondary-fixed font-bold" : "text-secondary-fixed"}
                  >
                    {log}
                  </motion.p>
                ))}
                {!isVerifying && !isComplete && (
                  <p className="text-surface-variant opacity-50">&gt;&gt; Ready to begin cryptographic audit...</p>
                )}
              </div>
            </div>

            {/* Hash Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg">
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">LOCAL HASH (EXPECTED)</label>
                <code className="text-xs break-all text-on-surface font-data-mono">f8a2...3e91b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8</code>
              </div>
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg relative overflow-hidden">
                {!isComplete && (
                  <div className="absolute inset-0 bg-surface-container-low/80 flex items-center justify-center backdrop-blur-[1px]">
                    <span className={`${isVerifying ? 'animate-pulse' : ''} text-primary font-label-caps`}>
                      {isVerifying ? 'COMPUTING...' : 'AWAITING START'}
                    </span>
                  </div>
                )}
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">ON-CHAIN HASH (IPFS)</label>
                <code className={`text-xs break-all font-data-mono ${isComplete ? 'text-secondary font-bold' : 'text-on-surface'}`}>
                  {isComplete ? 'f8a2...3e91b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8' : '****************************************'}
                </code>
              </div>
            </div>

            {/* Result Banner */}
            <AnimatePresence>
              {isComplete && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="transform bg-secondary-container/20 border border-secondary text-on-secondary-container p-4 rounded-lg flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center success-pulse">
                    <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-headline-sm text-headline-sm">Verified Reasoning Trace Integrity: 100%</h3>
                    <p className="text-sm opacity-80">All reasoning shards matched the cryptographic commitment stored on-chain.</p>
                  </div>
                  <a className="flex items-center gap-2 px-4 py-2 bg-white border border-secondary text-secondary font-label-caps rounded hover:bg-secondary-container transition-colors" href="https://ipfs.io" target="_blank" rel="noopener noreferrer">
                    <span className="material-symbols-outlined text-sm">link</span>
                    View on IPFS
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Action */}
          <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
            <Link href="/reasoning" className="px-6 py-2 font-label-caps text-on-surface-variant hover:text-on-surface transition-colors uppercase">
              {isComplete ? "BACK TO FEED" : "CANCEL AUDIT"}
            </Link>
            <button 
              className={`px-8 py-2 text-primary-foreground font-label-caps rounded transition-all active:scale-95 ${isComplete ? 'bg-secondary' : 'bg-primary hover:bg-primary-container'} ${(isVerifying && !isComplete) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={startVerification}
              disabled={isVerifying || isComplete}
            >
              {isComplete ? "DONE" : isVerifying ? "VERIFYING..." : "BEGIN VERIFICATION"}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
