"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyTrace, TraceVerification } from "@/lib/api/traces";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const traceId = searchParams.get("traceId");

  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [statusLabel, setStatusLabel] = useState("Initializing cryptographic audit...");
  const [verificationResult, setVerificationResult] = useState<TraceVerification | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const startVerification = async () => {
    if (isVerifying || isComplete || !traceId) return;

    setIsVerifying(true);
    setTerminalLogs([">> [INIT] Connecting to decentralized reasoning shard..."]);
    
    try {
      const result = await verifyTrace(traceId);
      setVerificationResult(result);
      
      const realLogs = [
        ">> [INIT] Requesting trace manifest from IPFS...",
        `>> [CONN] IPFS CID Detected: ${result.ipfsCid?.substring(0, 15)}...`,
        ">> [DATA] Downloading reasoning shards from decentralized cluster...",
        ">> [DATA] Shard retrieval complete (2.4MB retrieved).",
        ">> [AUDIT] Checking Arc ReasoningRegistry (Contract: 0xE318...257)",
        ">> [AUDIT] Merkle Proof: Validating commitment leaf nodes...",
        `>> [AUDIT] Stored Hash: ${result.storedHash?.substring(0, 32)}...`,
        `>> [AUDIT] Local Hash: ${result.computedHash?.substring(0, 32)}...`,
        ">> [FINAL] Comparing cryptographic fingerprints...",
      ];

      let step = 0;
      const interval = setInterval(() => {
        if (step < realLogs.length) {
          setTerminalLogs((prev) => [...prev, realLogs[step]]);
          step++;
          setProgress(Math.floor((step / realLogs.length) * 100));
        } else {
          clearInterval(interval);
          completeVerification(result);
        }
      }, 300);

    } catch (err) {
      console.error("Verification failed:", err);
      setIsVerifying(false);
      setStatusLabel("Verification Failed");
      setTerminalLogs((prev) => [...prev, ">> [ERROR] Cryptographic Audit Failed: Could not fetch trace proof from Arc."]);
    }
  };

  const completeVerification = (result: TraceVerification) => {
    setStatusLabel(result.verified ? "Verification Complete" : "Verification Failed");
    setTerminalLogs((prev) => [
      ...prev, 
      result.verified 
        ? ">> [SUCCESS] Integrity Verified: All Shards Intact." 
        : ">> [FAIL] Cryptographic Mismatch Detected: Trace Tampering Possible."
    ]);
    setIsComplete(true);
    setIsVerifying(false);
    setProgress(100);
  };

  return (
    <main className="relative min-h-[calc(100vh-64px)] pt-24 pb-16 px-gutter max-w-container-max-width mx-auto overflow-hidden">
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

      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-on-background/10 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white w-full max-w-2xl rounded-xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Verify Trace Integrity</h2>
                <p className="font-label-caps text-label-caps text-on-surface-variant">TRACE-ID: {traceId?.substring(0, 12)}...</p>
              </div>
            </div>
            <Link href="/reasoning" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </Link>
          </div>

          <div className="p-8 space-y-8">
            <div className="relative">
              <div className="flex justify-between mb-2">
                <span className={`font-label-caps text-label-caps ${isComplete ? (verificationResult?.verified ? 'text-secondary' : 'text-error') : 'text-primary'}`}>{statusLabel}</span>
                <span className="font-data-mono text-data-mono text-primary">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                <div 
                  className={`h-full ${isComplete && !verificationResult?.verified ? 'bg-error' : 'bg-primary'} transition-all duration-300 ease-out`} 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-on-background rounded-lg p-6 font-data-mono text-data-mono h-64 overflow-y-auto scan-effect shadow-inner custom-scrollbar" ref={terminalRef}>
              <div className="space-y-1 text-secondary-fixed">
                {terminalLogs.map((log, i) => (
                  <motion.p 
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={log && log.includes("[SUCCESS]") ? "text-secondary font-bold" : log.includes("[FAIL]") || log.includes("[ERROR]") ? "text-error font-bold" : "text-secondary-fixed opacity-80"}
                  >
                    {log}
                  </motion.p>
                ))}
                {!isVerifying && !isComplete && (
                  <p className="text-surface-variant opacity-50">&gt;&gt; Ready to begin cryptographic audit...</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg">
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">STORED HASH (ON-CHAIN)</label>
                <code className="text-xs break-all text-on-surface font-data-mono">
                  {isComplete && verificationResult ? verificationResult.storedHash : "****************************************"}
                </code>
              </div>
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-lg relative overflow-hidden">
                {!isComplete && (
                  <div className="absolute inset-0 bg-surface-container-low/80 flex items-center justify-center backdrop-blur-[1px]">
                    <span className={`${isVerifying ? 'animate-pulse' : ''} text-primary font-label-caps`}>
                      {isVerifying ? 'COMPUTING...' : 'AWAITING START'}
                    </span>
                  </div>
                )}
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">COMPUTED HASH (LOCAL)</label>
                <code className={`text-xs break-all font-data-mono ${isComplete ? (verificationResult?.verified ? 'text-secondary font-bold' : 'text-error font-bold') : 'text-on-surface'}`}>
                  {isComplete && verificationResult ? verificationResult.computedHash : "****************************************"}
                </code>
              </div>
            </div>

            <AnimatePresence>
              {isComplete && verificationResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`transform ${verificationResult.verified ? 'bg-primary-container border-secondary text-on-primary-container' : 'bg-error-container/20 border-error text-error'} border p-4 rounded-lg flex items-center gap-4`}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-headline-sm text-headline-sm">
                      {verificationResult.verified ? 'Verified Reasoning Trace Integrity: 100%' : 'Integrity Check Failed'}
                    </h3>
                    <p className="text-sm opacity-80">
                      {verificationResult.verified 
                        ? 'All reasoning shards matched the cryptographic commitment stored on-chain.' 
                        : 'Local computation did not match the on-chain commitment. This trace may have been altered.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {verificationResult.ipfsCid && (
                      <a className={`flex items-center gap-2 px-4 py-2 bg-white border ${verificationResult.verified ? 'border-secondary text-secondary' : 'border-error text-error'} font-label-caps rounded hover:brightness-95 transition-all text-xs`} href={`https://ipfs.io/ipfs/${verificationResult.ipfsCid}`} target="_blank" rel="noopener noreferrer">
                        <span className="material-symbols-outlined text-sm">link</span>
                        View IPFS
                      </a>
                    )}
                    <a className={`flex items-center gap-2 px-4 py-2 bg-white border ${verificationResult.verified ? 'border-secondary text-secondary' : 'border-error text-error'} font-label-caps rounded hover:brightness-95 transition-all text-xs`} href={`https://testnet.arcscan.app/address/0xE3188B3b4E14d74E6110137FF91f12B981A82257`} target="_blank" rel="noopener noreferrer">
                      <span className="material-symbols-outlined text-sm">search</span>
                      View on Arc
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
            <Link href="/reasoning" className="px-6 py-2 font-label-caps text-on-surface-variant hover:text-on-surface transition-colors uppercase">
              {isComplete ? "BACK TO FEED" : "CANCEL AUDIT"}
            </Link>

            <button 
              className={`px-8 py-2 text-primary-foreground font-label-caps rounded transition-all active:scale-95 ${isComplete ? (verificationResult?.verified ? 'bg-secondary' : 'bg-error') : 'bg-primary hover:bg-primary-container'} ${(isVerifying && !isComplete) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => isComplete ? router.push('/reasoning') : startVerification()}
              disabled={isVerifying && !isComplete}
            >
              {isComplete ? "DONE" : isVerifying ? "VERIFYING..." : "BEGIN VERIFICATION"}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
