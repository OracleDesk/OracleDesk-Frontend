"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const TerminalLog = () => {
  const [logs, setLogs] = useState([
    { text: "[2024-05-14 09:32:11] INITIALIZING ORACLE PROTOCOL...", color: "opacity-50" },
    { text: "[SUCCESS] Market Resolution Detected: ETH_PRICE_JUN_24 -> YES (100.00%)", color: "text-secondary-fixed" },
    { text: "[INFO] Wallet 0x8a1...f3e claimed 820.00 USDC in rewards.", color: "" },
    { text: "[ALERT] High Volatility detected in 'US_ELECTION_2024'. Slippage settings adjusted.", color: "text-tertiary-fixed-dim" },
    { text: "[TRADE] Order Executed: SELL 500 'NO' Contracts on 'SpaceX_Mars_2025' at $0.42.", color: "" },
    { text: "[PNL] Portfolio unrealized profit increased by 1.2% in last 60 minutes.", color: "" },
    { text: "[SYSTEM] Syncing with Polymarket API... Node latency 14ms.", color: "text-surface-dim opacity-70" },
    { text: "[SUCCESS] Limit order filled: 10,000 YES contracts @ $0.62.", color: "text-secondary-fixed" },
  ]);

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
      const newLogOptions = [
        `[${time}] [HEARTBEAT] Pinged primary oracle cluster... 8ms`,
        `[${time}] [UPDATE] Price Feed updated for BTC/USD: $64,210.04`,
        `[${time}] [SECURE] Wallet session verified via ECDSA signature.`,
        `[${time}] [INFO] New liquidity detected in Election markets.`
      ];
      const randomLog = newLogOptions[Math.floor(Math.random() * newLogOptions.length)];
      setLogs(prev => [...prev.slice(-19), { text: randomLog, color: "text-surface-dim opacity-40 animate-pulse" }]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="lg:col-span-2 bg-on-background rounded shadow-lg overflow-hidden border border-outline">
      <div className="px-4 py-3 border-b border-outline/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-error"></div>
          <div className="w-3 h-3 rounded-full bg-secondary-fixed"></div>
          <div className="w-3 h-3 rounded-full bg-primary-fixed"></div>
          <span className="font-data-mono text-[11px] text-surface-variant ml-4 uppercase tracking-widest">Transaction & Performance Log</span>
        </div>
        <span className="material-symbols-outlined text-surface-variant text-[18px]">terminal</span>
      </div>
      <div 
        ref={terminalRef}
        className="p-6 h-[400px] overflow-y-auto font-data-mono text-[12px] text-primary-fixed-dim leading-relaxed scrollbar-hide scroll-smooth"
      >
        {logs.map((log, i) => (
          <div key={i} className={`mb-2 ${log.color}`}>
            {log.text}
          </div>
        ))}
        <div className="text-surface-dim opacity-40">... streaming real-time events ...</div>
      </div>
    </section>
  );
};

const PositionRow = ({ market, category, platform, side, sideColor, entry, prob, yesNo, size, pnl, pnlPercent, pnlColor, status, resolved, claimable }: any) => {
  return (
    <tr className={`transition-colors border-b border-outline-variant hover:bg-surface-container/50 ${resolved ? 'bg-surface-container-highest' : ''}`}>
      <td className="px-6 py-4 font-body-md text-on-surface max-w-xs">
        <span className="block truncate font-semibold">{market}</span>
        <span className="text-[11px] text-outline uppercase">{category} • {platform}</span>
      </td>
      <td className="px-4 py-4">
        <span className={`${sideColor} px-2 py-0.5 rounded text-[11px] font-bold`}>{side}</span>
      </td>
      <td className="px-4 py-4 text-right font-data-mono">{entry}</td>
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1 w-32 mx-auto">
          <div className="flex justify-between text-[10px] text-outline font-bold">
            <span>{prob}%</span>
            <span>{yesNo}</span>
          </div>
          <div className="h-1 bg-outline-variant rounded-full overflow-hidden relative">
            <div 
              className={`h-full absolute left-0 top-0 ${side === 'YES' ? 'bg-secondary' : 'bg-tertiary'}`} 
              style={{ width: `${prob}%` }}
            ></div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-right font-data-mono">{size}</td>
      <td className="px-4 py-4 text-right font-data-mono">
        <div className={`${pnlColor} font-bold`}>{pnl}</div>
        <div className={`text-[11px] ${pnlColor === 'text-secondary' ? 'text-secondary-container bg-on-secondary-fixed-variant' : 'text-tertiary-container bg-error-container'} px-1 rounded inline-block`}>
          {pnlPercent}
        </div>
      </td>
      <td className="px-4 py-4 text-center">
        <span className={`text-[10px] ${resolved ? 'bg-on-background text-surface' : 'bg-primary-container text-on-primary-container'} px-2 py-0.5 rounded-full uppercase`}>
          {status}
        </span>
      </td>
      <td className="px-6 py-4 text-right space-x-2">
        {claimable ? (
          <button className="bg-secondary text-primary-foreground px-3 py-1 rounded font-label-caps text-[10px] uppercase shadow-sm active:scale-95 transition-transform">
            Claim Rewards
          </button>
        ) : (
          <>
            <button className="text-primary hover:underline font-label-caps text-label-caps">Manage</button>
            <button className="text-tertiary hover:underline font-label-caps text-label-caps">Close</button>
          </>
        )}
      </td>
    </tr>
  );
};

export default function PortfolioPage() {
  return (
    <main className="max-w-container-max-width mx-auto px-gutter py-8">
      {/* Portfolio Header / Summary */}
      <section className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-background mb-1">Portfolio Performance</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Institutional grade overview of your prediction market exposure.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white border border-outline-variant p-4 rounded min-w-[160px] shadow-sm">
            <div className="font-label-caps text-label-caps text-outline mb-1">EQUITY</div>
            <div className="font-headline-sm text-headline-sm text-on-background">$142,502.81</div>
            <div className="text-[12px] font-bold text-secondary flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span> 4.2%
            </div>
          </div>
          <div className="bg-white border border-outline-variant p-4 rounded min-w-[160px] shadow-sm">
            <div className="font-label-caps text-label-caps text-outline mb-1">ACTIVE POSITIONS</div>
            <div className="font-headline-sm text-headline-sm text-on-background">12</div>
            <div className="text-[12px] font-medium text-on-surface-variant mt-1">8 Yes / 4 No</div>
          </div>
        </div>
      </section>

      {/* Detailed Positions Table */}
      <section className="bg-white border border-outline-variant rounded shadow-sm overflow-hidden mb-12">
        <div className="px-6 py-4 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-container-low gap-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Open Positions</h2>
          <div className="flex items-center gap-2">
            <span className="font-label-caps text-label-caps text-outline whitespace-nowrap">FILTER BY:</span>
            <select className="bg-transparent border-none font-label-caps text-label-caps text-primary cursor-pointer focus:ring-0 outline-none">
              <option>ALL ASSETS</option>
              <option>POLITICS</option>
              <option>MACRO</option>
              <option>TECH</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[1000px]">
            <thead>
              <tr className="bg-surface font-label-caps text-label-caps text-outline border-b border-outline-variant">
                <th className="px-6 py-4 font-semibold">MARKET</th>
                <th className="px-4 py-4 font-semibold">SIDE</th>
                <th className="px-4 py-4 font-semibold text-right">ENTRY</th>
                <th className="px-4 py-4 font-semibold text-center">PROBABILITY</th>
                <th className="px-4 py-4 font-semibold text-right">SIZE</th>
                <th className="px-4 py-4 font-semibold text-right">PNL</th>
                <th className="px-4 py-4 font-semibold text-center">STATUS</th>
                <th className="px-6 py-4 font-semibold text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              <PositionRow 
                market="US Fed Rate Cut in Sept 2024?"
                category="MACRO"
                platform="POLYMARKET"
                side="YES"
                sideColor="bg-secondary-container text-on-secondary-container"
                entry="$0.62"
                prob={74}
                yesNo="YES"
                size="15,000.00"
                pnl="+$1,800.00"
                pnlPercent="+19.3%"
                pnlColor="text-secondary"
                status="OPEN"
              />
              <PositionRow 
                market="OpenAI releases GPT-5 before Oct?"
                category="TECH"
                platform="KALSHI"
                side="NO"
                sideColor="bg-tertiary-container text-on-tertiary-container"
                entry="$0.45"
                prob={32}
                yesNo="NO"
                size="5,250.00"
                pnl="-$682.50"
                pnlPercent="-13.0%"
                pnlColor="text-tertiary"
                status="OPEN"
              />
              <PositionRow 
                market="ETH Price Above $4k (Monthly)"
                category="CRYPTO"
                platform="MANIFOLD"
                side="YES"
                sideColor="bg-secondary-container text-on-secondary-container"
                entry="$0.18"
                prob={100}
                yesNo="RESOLVED"
                size="1,000.00"
                pnl="+$820.00"
                pnlPercent="+455.5%"
                pnlColor="text-secondary"
                status="RESOLVED"
                resolved
                claimable
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Performance Log & Reasoning Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <TerminalLog />

        {/* AI Reasoning Sidebar (Oracle Insights) */}
        <aside className="flex flex-col gap-6">
          <div className="bg-surface-container-low border border-outline-variant rounded p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              <h3 className="font-headline-sm text-headline-sm">Oracle Insight</h3>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4 leading-relaxed">
              The current exposure to &quot;US Fed Rate Cut&quot; represents 42% of active portfolio risk. Sentiment analysis indicates a bullish divergence on Polymarket vs. prediction on Kalshi.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[12px] p-2 bg-white rounded border border-outline-variant">
                <span className="font-bold text-on-surface">Alpha Score</span>
                <span className="text-secondary font-black">8.4/10</span>
              </div>
              <div className="flex justify-between items-center text-[12px] p-2 bg-white rounded border border-outline-variant">
                <span className="font-bold text-on-surface">Risk Level</span>
                <span className="text-tertiary font-black">Moderate</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-outline-variant rounded overflow-hidden shadow-sm group">
            <div className="relative h-40 overflow-hidden">
              <img 
                className="w-full h-full object-cover opacity-80 grayscale group-hover:grayscale-0 transition-all duration-500 scale-110 group-hover:scale-100" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIfXfpCgcHi-S6CFNFgowutv9eQEhbRd79uxk01snpGOAwscguX-zeCmV2O-0VDuoe0kPxq4GhJZHd1aMQUiu7ynX_Z3YJ74dBcMELQUHHgz3TR1m5x4NzM4somHr7lEX25EPIdl29O7-PF_0H7j-DzRz097OXqF4qTU_yRdliTCCC41rhMEcbnSx3u7KRxlBI82fit-puTgI03Cic7ISGtKUSqrptzKYSySHB16a5L9sKiBotuMHHOl3icKb8JW8WBlRuQrpUDg"
                alt="Market Visualization"
              />
            </div>
            <div className="p-4">
              <h4 className="font-label-caps text-label-caps text-outline mb-2">NETWORK ACTIVITY</h4>
              <div className="flex items-center justify-between">
                <span className="font-body-md text-body-md font-bold">Mainnet Congestion</span>
                <span className="text-secondary font-bold">Low (12 Gwei)</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
