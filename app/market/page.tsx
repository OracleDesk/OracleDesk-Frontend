"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/layout/Navbar";

const MarketHeader = () => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-label-caps text-[10px] rounded">POLITICS</span>
          <span className="text-on-surface-variant font-data-mono text-label-caps">#MKT-9204</span>
        </div>
        <h1 className="font-display-lg text-display-lg text-on-background max-w-3xl">Will the US Federal Reserve lower rates by 50bps in Q4?</h1>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 border-l border-outline-variant pl-8">
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">PROBABILITY</p>
          <p className="font-headline-md text-headline-md text-secondary">64.2%</p>
        </div>
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">VOLUME 24H</p>
          <p className="font-headline-md text-headline-md text-on-surface">$2.4M</p>
        </div>
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">LIQUIDITY</p>
          <p className="font-headline-md text-headline-md text-on-surface">$14.1M</p>
        </div>
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">END DATE</p>
          <p className="font-headline-md text-headline-md text-on-surface">DEC 31</p>
        </div>
      </div>
    </div>
  );
};

const ProbabilityChart = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex gap-4">
          <button className="font-label-caps text-label-caps text-primary border-b-2 border-primary pb-1">PROBABILITY</button>
          <button className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors pb-1">VOLUME</button>
        </div>
        <div className="flex gap-2">
          {["1H", "1D", "1W", "ALL"].map((period) => (
            <button
              key={period}
              className={`px-3 py-1 rounded text-label-caps font-medium ${
                period === "1D" ? "bg-primary text-on-primary" : "bg-surface-container"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[400px] w-full flex items-end gap-1 relative pt-10">
        <div className="absolute inset-0 flex flex-col justify-between py-10 pointer-events-none opacity-20">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`border-t border-outline ${i === 2 ? "border-primary border-dashed opacity-50" : ""}`}></div>
          ))}
        </div>
        <div className="absolute inset-0 top-20 flex items-center justify-center overflow-hidden">
          <img 
            className="w-full h-64 object-cover opacity-80" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAP_l4FAKT0Kqb8o_EkCiEIa2g4uCDQB2695J46KJVykByhzokDPO8u-r0dlZCwkWuKc4DYsc7wR_xtYkcpnqGUb9DbkH2M3MK4EAylgJEFzCpBHD8AIO6H7tvWUeGQnfh8ziJM3MZXXQ2dh9Le3iKUZpR5LJktwcYdDf0PzKxGkNJomjdbEH-zCTRVcq_4-dVtwPVi98DIZVtDUKgUU-Wu2H94SyvylWE2t57VdV-Z8eG8HP50LXvSkJ9a1vP9RtZbYGRpvPVKuA"
            alt="Chart"
          />
        </div>
        <div className="absolute bottom-4 right-4 bg-surface-container-highest px-3 py-1 rounded-full border border-primary/20">
          <span className="text-label-caps text-primary font-bold">LIVE: 64.21%</span>
        </div>
      </div>
    </div>
  );
};

const MarketDepth = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded h-full">
      <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-4 uppercase tracking-widest">Market Depth</h3>
      <div className="h-48 flex items-end gap-[2px]">
        <div className="flex-1 bg-secondary opacity-20 h-[30%]"></div>
        <div className="flex-1 bg-secondary opacity-30 h-[45%]"></div>
        <div className="flex-1 bg-secondary opacity-50 h-[60%]"></div>
        <div className="flex-1 bg-secondary opacity-80 h-[85%]"></div>
        <div className="w-[1px] bg-outline mx-2 h-full opacity-30"></div>
        <div className="flex-1 bg-tertiary opacity-80 h-[75%]"></div>
        <div className="flex-1 bg-tertiary opacity-50 h-[50%]"></div>
        <div className="flex-1 bg-tertiary opacity-30 h-[35%]"></div>
        <div className="flex-1 bg-tertiary opacity-20 h-[20%]"></div>
      </div>
      <div className="flex justify-between mt-4 font-data-mono text-[10px] text-on-surface-variant">
        <span>$0.62</span>
        <span>$0.64</span>
        <span>$0.66</span>
      </div>
    </div>
  );
};

const AIConfidenceInterval = () => {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-6 rounded flex flex-col justify-center h-full">
      <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-6 uppercase tracking-widest">AI Confidence Interval</h3>
      <div className="relative py-4">
        <div className="h-1 bg-outline-variant w-full rounded-full"></div>
        <div className="absolute top-1/2 -translate-y-1/2 left-[58%] right-[32%] h-3 bg-primary-container/40 rounded-full border-x-2 border-primary"></div>
        <div className="absolute top-1/2 -translate-y-1/2 left-[64%] w-4 h-4 bg-primary rounded-full border-2 border-white shadow-sm"></div>
      </div>
      <div className="flex justify-between mt-4">
        <div className="text-center">
          <p className="text-label-caps text-on-surface-variant">LOW (95% CI)</p>
          <p className="font-data-mono text-on-background font-bold">58.2%</p>
        </div>
        <div className="text-center">
          <p className="text-label-caps text-on-surface-variant">MEAN</p>
          <p className="font-data-mono text-primary font-bold">64.2%</p>
        </div>
        <div className="text-center">
          <p className="text-label-caps text-on-surface-variant">HIGH (95% CI)</p>
          <p className="font-data-mono text-on-background font-bold">68.5%</p>
        </div>
      </div>
    </div>
  );
};

const RecentActivity = () => {
  const activities = [
    { side: "YES", price: "$0.642", shares: "12,500", total: "$8,025.00", time: "12s ago", color: "text-secondary" },
    { side: "NO", price: "$0.358", shares: "4,200", total: "$1,503.60", time: "45s ago", color: "text-tertiary" },
    { side: "YES", price: "$0.641", shares: "1,100", total: "$705.10", time: "1m ago", color: "text-secondary" },
  ];

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Recent Activity</h3>
        <div className="flex gap-4">
          <span className="text-label-caps text-on-surface-variant">24H Trades: <span className="text-on-surface font-bold">12,402</span></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-data-mono text-body-md">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-6 py-3 font-label-caps text-on-surface-variant">SIDE</th>
              <th className="px-6 py-3 font-label-caps text-on-surface-variant">PRICE</th>
              <th className="px-6 py-3 font-label-caps text-on-surface-variant">SHARES</th>
              <th className="px-6 py-3 font-label-caps text-on-surface-variant">TOTAL</th>
              <th className="px-6 py-3 font-label-caps text-on-surface-variant text-right">TIME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {activities.map((activity, i) => (
              <tr key={i} className="hover:bg-surface-container transition-colors">
                <td className={`px-6 py-4 ${activity.color} font-bold`}>{activity.side}</td>
                <td className="px-6 py-4">{activity.price}</td>
                <td className="px-6 py-4">{activity.shares}</td>
                <td className="px-6 py-4 font-bold text-on-surface">{activity.total}</td>
                <td className="px-6 py-4 text-right text-on-surface-variant">{activity.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TradeExecution = () => {
  const [amount, setAmount] = useState(1000);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded shadow-sm">
      <h3 className="font-headline-sm text-headline-sm mb-6 text-on-background">Execute Trade</h3>
      <div className="flex gap-2 p-1 bg-surface-container rounded-lg mb-6">
        <button className="flex-1 py-2 bg-white shadow-sm border border-outline-variant rounded font-label-caps text-label-caps text-on-surface">MARKET</button>
        <button className="flex-1 py-2 font-label-caps text-label-caps text-on-surface-variant hover:bg-white/50 transition-colors">LIMIT</button>
      </div>
      <div className="space-y-4 mb-6">
        <div>
          <label className="font-label-caps text-[10px] text-on-surface-variant mb-1 block">INVESTMENT (USDC)</label>
          <div className="relative">
            <input 
              className="w-full bg-surface-container border-outline-variant focus:ring-primary focus:border-primary rounded px-4 py-3 font-data-mono text-lg outline-none" 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold cursor-pointer">MAX</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button className="py-4 border-2 border-secondary bg-secondary-container/10 rounded flex flex-col items-center hover:bg-secondary-container/20 transition-all cursor-pointer">
            <span className="text-secondary font-black font-headline-sm">YES</span>
            <span className="text-on-surface-variant text-label-caps">$0.642</span>
          </button>
          <button className="py-4 border-2 border-tertiary bg-tertiary-container/5 rounded flex flex-col items-center hover:bg-tertiary-container/10 transition-all cursor-pointer">
            <span className="text-tertiary font-black font-headline-sm">NO</span>
            <span className="text-on-surface-variant text-label-caps">$0.358</span>
          </button>
        </div>
      </div>
      <div className="bg-surface-container-low p-4 rounded mb-6 space-y-2 border border-outline-variant">
        <div className="flex justify-between text-label-caps">
          <span className="text-on-surface-variant">Est. Payout</span>
          <span className="text-secondary font-bold">${(amount * 1.557).toFixed(2)} (+55.7%)</span>
        </div>
        <div className="flex justify-between text-label-caps">
          <span className="text-on-surface-variant">Fee (0.25%)</span>
          <span className="text-on-surface">${(amount * 0.0025).toFixed(2)}</span>
        </div>
      </div>
      <div className="space-y-3">
        <button className="w-full bg-primary text-on-primary py-4 rounded-xl font-headline-sm hover:opacity-90 transition-opacity">BUY YES</button>
        <button className="w-full bg-primary-container text-on-primary-container py-3 rounded-xl font-label-caps text-label-caps flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-[18px]">content_copy</span>
          COPY AI TRADE
        </button>
      </div>
    </div>
  );
};

const OracleInsights = () => {
  return (
    <div className="bg-[#f0f9fa] border border-primary/20 rounded-xl overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b border-primary/10 flex items-center gap-3">
        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        <h3 className="font-headline-sm text-headline-sm text-primary">Oracle Insights</h3>
      </div>
      <div className="p-6 space-y-8 relative">
        <div className="absolute left-[33px] top-8 bottom-8 w-[2px] bg-primary/10"></div>
        <div className="relative pl-10">
          <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-primary border-4 border-[#f0f9fa] z-10"></div>
          <p className="font-label-caps text-[10px] text-primary/70 mb-1">RECENT • 2H AGO</p>
          <h4 className="font-body-lg font-bold text-on-background mb-2">Hawkish Sentiment Surge</h4>
          <p className="text-on-surface-variant leading-relaxed">
            Natural language processing of latest FOMC minutes indicates a 12% shift toward hawkish positioning. Market is underpricing persistent inflation data.
          </p>
        </div>
        <div className="relative pl-10">
          <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-outline-variant border-4 border-[#f0f9fa] z-10"></div>
          <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">STABLE • 1D AGO</p>
          <h4 className="font-body-lg font-bold text-on-background mb-2">Whale Accumulation</h4>
          <p className="text-on-surface-variant leading-relaxed">
            Three institutional-grade wallets have entered large &apos;YES&apos; positions totaling $1.2M. Historically, this signature precedes a 5% price appreciation.
          </p>
        </div>
        <div className="relative pl-10">
          <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-outline-variant border-4 border-[#f0f9fa] z-10"></div>
          <p className="font-label-caps text-[10px] text-on-surface-variant mb-1">LEGACY • 3D AGO</p>
          <h4 className="font-body-lg font-bold text-on-background mb-2">Initial Market Seeding</h4>
          <p className="text-on-surface-variant leading-relaxed">
            Correlation analysis with Treasury yields suggests a market fair value of 58%. Current 64% reflects a risk premium for upcoming labor data.
          </p>
        </div>
        <button className="w-full py-2 text-primary font-label-caps text-label-caps hover:bg-primary/5 transition-colors rounded">VIEW FULL MODEL ARCHITECTURE</button>
      </div>
    </div>
  );
};

const TerminalLogs = () => {
  const [logs, setLogs] = useState([
    { text: "[14:22:01] INBOUND: Transaction 0x72...9a41 validated", color: "text-secondary-fixed-dim" },
    { text: "[14:22:04] ANALYSIS: Correlation coefficient updated (0.84)", color: "text-on-primary-container" },
    { text: "[14:22:09] LIQUIDITY: Depth rebalance on NO contracts", color: "text-tertiary-fixed-dim" },
    { text: "[14:22:15] MONITOR: Polling 12 external oracle sources...", color: "" },
    { text: "[14:22:18] SIGNAL: Sentiment outlier detected in Bloomberg Terminal stream", color: "text-secondary-fixed-dim" },
    { text: "[14:22:25] EXEC: OracleDesk automated market maker recalibrating spreads", color: "" },
    { text: "[14:22:31] DATA: FedWatch tool update ingested (25bps delta)", color: "text-on-primary-container" },
  ]);
  
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
      const newLogOptions = [
        { text: `[${time}] SYNC: Block ${Math.floor(Math.random() * 10000000)} confirmed`, color: "" },
        { text: `[${time}] WARN: Slippage tolerance threshold (0.5%)`, color: "text-tertiary-fixed-dim" },
        { text: `[${time}] INFO: Peer 0x${Math.random().toString(16).slice(2, 6)}...ff connected`, color: "" },
        { text: `[${time}] FEED: Sentiment score delta +0.02`, color: "text-on-primary-container" }
      ];
      setLogs(prev => [...prev.slice(-15), newLogOptions[Math.floor(Math.random() * newLogOptions.length)]]);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      ref={terminalRef}
      className="bg-on-background text-primary-fixed-dim p-4 rounded border border-outline font-data-mono text-[11px] h-48 overflow-y-auto custom-scrollbar terminal-glow scroll-smooth"
    >
      <div className="flex items-center justify-between mb-2 opacity-50 sticky top-0 bg-on-background py-1">
        <span>SYSTEM LOG v4.2.1</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span> LIVE</span>
      </div>
      {logs.map((log, i) => (
        <p key={i} className={`mb-1 ${log.color} opacity-80`}>{log.text}</p>
      ))}
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="bg-surface-container-low border-t border-outline-variant mt-12">
      <div className="flex flex-col md:flex-row justify-between items-center w-full py-8 px-gutter max-w-container-max-width mx-auto gap-4">
        <span className="font-label-caps text-label-caps font-black text-on-surface-variant">OracleDesk</span>
        <div className="flex flex-wrap justify-center gap-8">
          <a className="text-on-surface-variant font-medium hover:text-primary transition-colors text-body-md" href="#">System Status</a>
          <a className="text-on-surface-variant font-medium hover:text-primary transition-colors text-body-md" href="#">API Docs</a>
          <a className="text-on-surface-variant font-medium hover:text-primary transition-colors text-body-md" href="#">Legal</a>
          <a className="text-on-surface-variant font-medium hover:text-primary transition-colors text-body-md" href="#">Privacy Policy</a>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant opacity-60">© 2024 OracleDesk Institutional. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default function MarketDetail() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-container-max-width mx-auto px-gutter py-6">
        <MarketHeader />
        
        <div className="grid grid-cols-12 gap-gutter">
          {/* Left Column */}
          <div className="col-span-12 lg:col-span-8 space-y-gutter">
            <ProbabilityChart />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <MarketDepth />
              <AIConfidenceInterval />
            </div>
            
            <RecentActivity />
          </div>

          {/* Right Column */}
          <div className="col-span-12 lg:col-span-4 space-y-gutter">
            <TradeExecution />
            <OracleInsights />
            <TerminalLogs />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
