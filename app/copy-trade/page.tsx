"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSignTypedData } from "wagmi";
import { useWallet } from "@/lib/contexts/WalletContext";
import { buildPolymarketOrderPayload, submitPolymarketOrder, POLYMARKET_EIP712_DOMAIN, POLYMARKET_ORDER_TYPES } from "@/lib/web3/polymarket";
import { getTrace, ReasoningTrace } from "@/lib/api/traces";

const COPY_TRADE_BUILDER_CODE = "ORACLE_COPY_AI";
const COPY_TRADE_TOKEN_ID = "1";

function CopyTradeContent() {
  const { address, isConnected, chainId, openModal } = useWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const traceId = searchParams.get("traceId");
  const marketId = searchParams.get("marketId");

  const [trace, setTrace] = useState<ReasoningTrace | null>(null);
  const [allocation, setAllocation] = useState(12.5);
  const [isMevProtected, setIsMevProtected] = useState(true);
  const [slippage, setSlippage] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (traceId) {
      getTrace(traceId)
        .then(setTrace)
        .catch(err => {
          console.error("Failed to fetch trace:", err);
          setStatusMessage("Note: Using simulated data. Trace ID not found on server.");
        });
    }
  }, [traceId]);

  const totalBankroll = 42000; // Example total bankroll
  const allocatedAmount = (totalBankroll * allocation) / 100;
  const usdcAmount = Math.max(1, Math.round(allocatedAmount));

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

  const handleConfirm = async () => {
    if (!isConnected || !address) {
      setStatusMessage("Connect your wallet to confirm the copy trade.");
      openModal();
      return;
    }

    if (chainId && chainId !== 137) {
      setStatusMessage("Switch your wallet to Polygon mainnet to execute this trade.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const price = trace?.probabilityEstimate ?? 0.682;
      const direction = trace?.edge && trace.edge >= 0 ? "BUY" : "BUY"; // Simplified for hackathon

      const payload = buildPolymarketOrderPayload(
        {
          tokenId: COPY_TRADE_TOKEN_ID,
          usdcAmount,
          price: price,
          side: "BUY",
          builderCode: COPY_TRADE_BUILDER_CODE,
        },
        address
      );

      const typedOrder = {
        ...payload.order,
        salt: BigInt(payload.order.salt),
        maker: payload.order.maker as `0x${string}`,
        signer: payload.order.signer as `0x${string}`,
        taker: payload.order.taker as `0x${string}`,
        tokenId: BigInt(payload.order.tokenId),
        makerAmount: BigInt(payload.order.makerAmount),
        takerAmount: BigInt(payload.order.takerAmount),
        expiration: BigInt(payload.order.expiration),
        nonce: BigInt(payload.order.nonce),
        feeRateBps: BigInt(payload.order.feeRateBps),
      };

      const signature = await signTypedDataAsync({
        domain: POLYMARKET_EIP712_DOMAIN,
        types: POLYMARKET_ORDER_TYPES,
        primaryType: "Order",
        message: typedOrder,
      });

      const result = await submitPolymarketOrder({ ...payload, signature });

      setStatusMessage(`Copy trade submitted. Order ID: ${result.orderId || "unknown"}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Trade failed: ${error.message}` : "Trade failed. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
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
        <div className="fixed inset-0 bg-on-background/10 backdrop-blur-sm z-[55]"></div>

        <div className="relative bg-surface border border-outline-variant w-full max-w-[640px] shadow-xl rounded-xl overflow-hidden z-[60] animate-in fade-in zoom-in duration-300">
          <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-white">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Confirm Copy Trade</h2>
              <p className="font-body-md text-body-md text-on-surface-variant text-sm">Execution through OracleDesk Institutional Routing</p>
            </div>
            <button 
              className="material-symbols-outlined p-2 hover:bg-surface-container rounded-full transition-colors" 
              type="button"
              onClick={() => router.back()}
            >
              close
            </button>
          </div>

          <div className="bg-[#f0f9fa] border-b border-outline-variant p-6 relative overflow-hidden ai-shimmer text-xs sm:text-sm">
            <div className="flex items-start gap-4">
              <div className="bg-primary-container p-2 rounded-lg flex-shrink-0">
                <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-primary-container mb-1 block">
                  ORACLE INSIGHTS • {trace?.probabilityEstimate ? Math.round(trace.probabilityEstimate * 100) : 94}% CONFIDENCE
                </span>
                <p className="font-body-md text-body-md text-on-primary-fixed-variant leading-relaxed">
                  {trace?.market?.question ? (
                    <>Market analysis for <span className="font-bold">{trace.market.question}</span> indicates significant edge. OracleDesk institutional signals suggest a trade opportunity.</>
                  ) : (
                    <>Market sentiment for <span className="font-bold">US-CPI-NOV-24</span> shows aggressive hedging in decentralized prediction markets. Bayesian modeling suggests a 68.2% probability of &quot;Yes&quot; exceeding the 2.4% threshold, diverging from Bloomberg consensus by +14bps.</>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Proposed Side</span>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${trace?.edge && trace.edge < 0 ? 'bg-tertiary' : 'bg-secondary'}`}></span>
                  <span className={`font-headline-sm text-headline-sm text-base sm:text-lg ${trace?.edge && trace.edge < 0 ? 'text-tertiary' : 'text-secondary'}`}>
                    {trace?.edge && trace.edge < 0 ? 'NO / SHORT' : 'YES / LONG'}
                  </span>
                </div>
              </div>
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Probability</span>
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface text-base sm:text-lg">
                    {trace?.probabilityEstimate ? (trace.probabilityEstimate * 100).toFixed(1) : "68.2"}%
                  </span>
                  <span className="text-[10px] text-secondary font-bold px-1 bg-secondary-container rounded">
                    {trace?.edge ? `${(trace.edge * 100).toFixed(1)}% Δ` : "+2.4% Δ"}
                  </span>
                </div>
              </div>
            </div>

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
                <div className="absolute inset-y-0 left-0 bg-primary-container rounded-full" style={{ width: `${allocation}%` }}></div>
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary border-2 border-white rounded-full shadow-md" style={{ left: `calc(${allocation}% - 8px)` }}></div>
              </div>
              <div className="flex justify-between text-[10px] font-medium text-on-surface-variant px-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

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

            <div className="space-y-3">
              {statusMessage ? (
                <div className="rounded-2xl border border-outline-variant bg-surface p-4 text-sm text-on-surface-variant">
                  {statusMessage}
                </div>
              ) : null}
              <div className="flex gap-3">
                <button
                  className="flex-1 border border-outline text-on-surface py-4 rounded-lg font-headline-sm text-headline-sm hover:bg-surface-variant transition-all"
                  onClick={() => router.back()}
                  type="button"
                >
                  Go Back
                </button>
                <button
                  className="flex-[2] bg-[#005f73] text-primary-foreground py-4 rounded-lg font-headline-sm text-headline-sm shadow-lg shadow-primary-container/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirm}
                  type="button"
                  disabled={isSubmitting}
                >
                  <span className="material-symbols-outlined text-xl">bolt</span>
                  {isSubmitting ? "Submitting..." : "Confirm Copy Trade"}
                </button>
              </div>
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

export default function CopyTradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Copy Trade...</div>}>
      <CopyTradeContent />
    </Suspense>
  );
}
