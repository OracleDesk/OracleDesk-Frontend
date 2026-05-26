"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useWallet } from "@/lib/contexts/WalletContext";
import { useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS, ERC20_ABI, parseUsdc } from "@/lib/web3/contracts";
import { arcTestnet } from "@/lib/web3/chains";
import { unlockTrace } from "@/lib/api/traces";

interface Tier {
  name: string;
  price: number;
  priceStr: string;
  description: string;
  features: { text: string; included: boolean }[];
  buttonText: string;
  featured?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: 0,
    priceStr: "$0",
    description: "Standard market access for retail observers.",
    buttonText: "CURRENT PLAN",
    features: [
      { text: "Basic Market View", included: true },
      { text: "100 Trace Depth", included: true },
      { text: "Priority Latency", included: false },
      { text: "Advanced API Access", included: false },
    ],
  },
  {
    name: "Pro",
    price: 20,
    priceStr: "$20",
    description: "Enhanced tools for professional day traders.",
    buttonText: "UPGRADE TO PRO",
    featured: true,
    features: [
      { text: "Full Market Depth", included: true },
      { text: "5,000 Trace Depth", included: true },
      { text: "Priority Data Routing", included: true },
      { text: "Read-Only API Access", included: true },
    ],
  },
  {
    name: "Institutional",
    price: 50,
    priceStr: "$50",
    description: "The terminal for firms and high-volume funds.",
    buttonText: "GET ENTERPRISE",
    features: [
      { text: "Unlimited Market Depth", included: true },
      { text: "50,000 Trace Depth", included: true },
      { text: "Zero-Latency Dedicated Relay", included: true },
      { text: "Full Read/Write API", included: true },
    ],
  },
];

const features = [
  { name: "Trace Depth (Nodes)", free: "100", pro: "5,000", institutional: "50,000" },
  { name: "Latency Priority", free: "Standard (Shared)", pro: "High (Priority Queue)", institutional: "Ultra (Dedicated Relay)" },
  { name: "API Endpoints", free: "None", pro: "Read-only (Standard)", institutional: "Read/Write (Websockets)" },
  { name: "AI Insights (Oracle)", free: "Daily Summaries", pro: "Real-time Reasoning", institutional: "Predictive Modeling" },
];

export default function PremiumPage() {
  const { address, isConnected, chainId, openModal } = useWallet();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"usdc" | "card">("usdc");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const openCheckout = (tier: Tier) => {
    if (tier.name === "Free") return;
    if (!isConnected) {
      openModal();
      return;
    }
    setSelectedTier(tier);
  };

  const handlePayment = async () => {
    if (!selectedTier) return;
    
    if (paymentMethod === 'card') {
      alert("Credit card processing is currently disabled. Please use USDC for the hackathon demo.");
      return;
    }

    if (chainId !== arcTestnet.id) {
      setStatusMessage(`Please switch your wallet to ${arcTestnet.name} to complete the purchase.`);
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Initiating institutional clearing...");

    try {
      const amountRaw = parseUsdc(selectedTier.price);
      
      setStatusMessage(`Requesting USDC transfer of ${selectedTier.price} to OracleDesk Treasury...`);
      
      const txHash = await writeContractAsync({
        address: CONTRACTS.arc.usdc,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [CONTRACTS.arc.treasuryManager, amountRaw],
      });

      setStatusMessage("Waiting for block confirmation...");
      
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      setStatusMessage("Provisioning access on OracleDesk Backend...");
      
      // Use a special ID or a first-trace fetch to register the subscription.
      // Since DAILY_PASS on the backend ignores traceId for the subscription itself, 
      // but requires a valid-looking UUID for the route, we use a constant.
      await unlockTrace(
        "00000000-0000-0000-0000-000000000000", 
        txHash, 
        selectedTier.price, 
        "DAILY_PASS"
      );

      setStatusMessage("Upgrade Successful! Your account is now provisioned.");
      setTimeout(() => setSelectedTier(null), 3000);
    } catch (error) {
      console.error("Payment failed:", error);
      setStatusMessage(error instanceof Error ? `Payment failed: ${error.message}` : "Payment failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-grow">
      {/* Hero Section */}
      <section className="py-16 bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-container-max-width mx-auto px-gutter text-center">
          <span className="font-label-caps text-label-caps text-primary tracking-widest bg-primary-container/10 px-3 py-1 rounded-full mb-6 inline-block">
            INSTITUTIONAL GRADE
          </span>
          <h1 className="font-display-lg text-display-lg mb-4 text-4xl md:text-5xl">Elevate Your Analytical Edge</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
            Access institutional-grade market prediction tools, sub-millisecond data latency, and advanced AI reasoning for high-stakes decision making.
          </p>
        </div>
      </section>

      {/* Pricing & Tier Selection */}
      <section className="py-12 px-gutter max-w-container-max-width mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 pt-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`bg-white border rounded-xl p-8 flex flex-col transition-all duration-300 relative ${
                tier.featured
                  ? "border-primary border-2 shadow-lg md:scale-105 z-10"
                  : "border-outline-variant hover:border-primary/50 shadow-sm"
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1 rounded-full font-label-caps text-label-caps text-[10px]">
                  MOST POPULAR
                </div>
              )}
              <div className="mb-8">
                <h3 className="font-headline-sm text-headline-sm mb-2">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="font-display-lg text-display-lg text-4xl">{tier.priceStr}</span>
                  <span className="text-on-surface-variant font-body-md">/month</span>
                </div>
                <p className="text-on-surface-variant font-body-md h-12">{tier.description}</p>
              </div>
              <ul className="space-y-4 flex-grow mb-8">
                {tier.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className={`flex items-center gap-3 font-body-md ${
                      !feature.included ? "opacity-40" : ""
                    }`}
                  >
                    <span className="material-symbols-outlined text-primary text-lg">
                      {feature.included ? "check_circle" : "cancel"}
                    </span>
                    {feature.text}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openCheckout(tier)}
                className={`w-full py-3 rounded-lg font-label-caps text-label-caps transition-all cursor-pointer ${
                  tier.name === "Free"
                    ? "border border-outline hover:bg-surface-container"
                    : tier.featured
                    ? "bg-primary text-on-primary hover:brightness-110"
                    : "border border-primary text-primary hover:bg-primary/5"
                }`}
              >
                {tier.buttonText}
              </button>
            </div>
          ))}
        </div>

        {/* Features Comparison Table */}
        <div className="mb-24">
          <h2 className="font-headline-md text-headline-md mb-8 text-center">Feature Breakdown</h2>
          <div className="overflow-x-auto border border-outline-variant rounded-xl bg-white shadow-sm">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="p-4 font-label-caps text-label-caps">Features</th>
                  <th className="p-4 font-label-caps text-label-caps text-center">Free</th>
                  <th className="p-4 font-label-caps text-label-caps text-center">Pro</th>
                  <th className="p-4 font-label-caps text-label-caps text-center">Institutional</th>
                </tr>
              </thead>
              <tbody className="font-body-md divide-y divide-outline-variant">
                {features.map((f, i) => (
                  <tr key={i} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 font-medium">{f.name}</td>
                    <td className="p-4 text-center text-on-surface-variant">{f.free}</td>
                    <td className="p-4 text-center text-on-surface-variant">{f.pro}</td>
                    <td className="p-4 text-center text-on-surface-variant">{f.institutional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Reasoning Section */}
        <div className="bg-white border border-outline-variant rounded-2xl overflow-hidden mb-24 flex flex-col md:flex-row shadow-sm">
          <div className="md:w-1/2 p-8 md:p-12 bg-surface-container-low flex flex-col justify-center">
            <h2 className="font-display-lg text-display-lg mb-6 leading-tight text-3xl md:text-4xl">
              Powered by Oracle AI Reasoning
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 leading-relaxed">
              Our proprietary reasoning engine analyzes billions of on-chain data points to provide "Oracle Insights"—AI-generated predictive narratives that distinguish raw data from market noise.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="bg-white p-4 border border-outline-variant rounded-lg flex-1 min-w-[140px]">
                <span className="font-label-caps text-label-caps text-primary block mb-2">ACCURACY</span>
                <span className="font-headline-sm text-headline-sm">94.2%</span>
              </div>
              <div className="bg-white p-4 border border-outline-variant rounded-lg flex-1 min-w-[140px]">
                <span className="font-label-caps text-label-caps text-primary block mb-2">UPTIME</span>
                <span className="font-headline-sm text-headline-sm">99.99%</span>
              </div>
            </div>
          </div>
          <div className="md:w-1/2 relative h-64 md:h-auto overflow-hidden">
            <img
              className="absolute inset-0 w-full h-full object-cover grayscale opacity-80"
              alt="AI Reasoning Visualization"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAa6_iBtnOn_m37HN9i8iSM2WGtLI2O7724tEV1Lwtbv-GGPQ23M_8Ng5x56bioNBpuHpLU5pnYBL3d8-em8tJDo4E1MGMdaCxefcsadvDMXYBr7fBmUYgX9aeZNQ_Hmx2d7KN57E8mUefZU9FDAW7Dprf7vIVrX3lK4CuZXz1njfkdn9pfaRe2ujTB9rsBD_BZUXUbRwNAkdVh9-cGODrXj8J5pggMpgxMrCUHFsylQTCEbzk7CM0sJVfddH4ugiek22UZ3yMKNA"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-container-low via-transparent to-transparent md:block hidden"></div>
          </div>
        </div>
      </section>

      {/* Checkout Modal */}
      <AnimatePresence>
        {selectedTier && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-background/40 backdrop-blur-sm"
              onClick={() => setSelectedTier(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 md:p-8 border-b border-outline-variant flex justify-between items-center">
                <h2 className="font-headline-md text-headline-md">Confirm Subscription</h2>
                <button
                  className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                  onClick={() => setSelectedTier(null)}
                >
                  close
                </button>
              </div>
              <div className="p-6 md:p-8">
                <div className="bg-surface-container-low p-4 rounded-xl mb-8 flex justify-between items-center border border-outline-variant">
                  <div>
                    <p className="font-label-caps text-label-caps text-primary font-bold">
                      {selectedTier.name.toUpperCase()} TIER
                    </p>
                    <p className="font-body-md text-on-surface-variant">Billed Monthly</p>
                  </div>
                  <p className="font-headline-md text-headline-md text-on-surface text-2xl">
                    {selectedTier.price}.00
                  </p>
                </div>

                <div className="space-y-6">
                  <h4 className="font-label-caps text-label-caps text-on-surface-variant border-b border-outline-variant pb-2">
                    PAYMENT METHOD
                  </h4>
                  
                  {/* USDC Option */}
                  <label 
                    className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentMethod === 'usdc' ? "border-primary bg-primary-container/5" : "border-outline-variant hover:bg-surface-container-low"
                    }`}
                    onClick={() => setPaymentMethod('usdc')}
                  >
                    <div className="w-10 h-10 bg-surface rounded-full flex items-center justify-center mr-4 border border-outline-variant overflow-hidden p-2">
                      <img
                        alt="USDC"
                        className="w-full h-full object-contain"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuBBvpQJwosd2Frufdsjv33xmFEaqtUyhsE7FZ71B5HnGDdKxuZG6lxUBHLUN_72b5kg8Agl5q3-hEH2fEuAb-_pLcvFyXnM2K9saaM5DGU8S2lDvNZOLVEDFLm5SZ9m-oysbN474n7-m_f-fQPvR6m4aDDh2HeL4e_wKmfjwe5QkDRKk08h6N-QM6DBGHrMYIomFLujEFtdcTyccMq0i3ccnRBg7U4tC0Ig0D_KgAfB-bt_2ZdSeXk_I5gkzYAQszAvYnfg5lpgPA"
                      />
                    </div>
                    <div className="flex-grow">
                      <p className="font-body-md font-bold">Pay with USDC</p>
                      <p className="text-xs text-on-surface-variant">Ethereum, Solana, or Polygon</p>
                    </div>
                    {paymentMethod === 'usdc' && (
                      <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                    )}
                  </label>

                  {/* Credit Card Option */}
                  <label 
                    className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentMethod === 'card' ? "border-primary bg-primary-container/5" : "border-outline-variant hover:bg-surface-container-low"
                    }`}
                    onClick={() => setPaymentMethod('card')}
                  >
                    <div className="w-10 h-10 bg-surface rounded-full flex items-center justify-center mr-4 border border-outline-variant">
                      <span className="material-symbols-outlined text-on-surface-variant">credit_card</span>
                    </div>
                    <div className="flex-grow">
                      <p className="font-body-md font-bold">Credit / Debit Card</p>
                      <p className="text-xs text-on-surface-variant">Secure checkout via Stripe</p>
                    </div>
                    {paymentMethod === 'card' && (
                      <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                    )}
                  </label>
                </div>

                <div className="mt-8 space-y-4">
                  <div className="flex justify-between font-body-md text-on-surface-variant">
                    <span>Transaction Fee</span>
                    <span className="font-data-mono">$0.00</span>
                  </div>
                  <div className="flex justify-between font-headline-sm text-headline-sm pt-4 border-t border-outline-variant">
                    <span>Total Due</span>
                    <span className="text-primary">${selectedTier.price}.00</span>
                  </div>
                  
                  {statusMessage && (
                    <div className="p-3 bg-primary-container/10 border border-primary/20 rounded text-primary text-xs font-bold animate-pulse">
                      {statusMessage}
                    </div>
                  )}

                  <button 
                    className="w-full py-4 bg-primary text-on-primary font-headline-sm text-headline-sm rounded-xl mt-4 hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                    onClick={handlePayment}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Processing..." : paymentMethod === 'usdc' ? "Pay with Wallet" : "Proceed to Payment"}
                  </button>
                  <p className="text-center text-[10px] text-on-surface-variant uppercase tracking-widest mt-4">
                    Secured by OracleDesk Institutional Clearing
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
