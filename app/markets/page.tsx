"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { io } from "socket.io-client";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { formatUsdc } from "@/lib/web3/contracts";

const FilterBar = ({ 
  status, 
  setStatus, 
  category, 
  setCategory 
}: { 
  status: string; 
  setStatus: (s: string) => void;
  category: string;
  setCategory: (c: string) => void;
}) => {
  return (
    <section className="mb-8 bg-surface-container-low p-4 rounded-xl border border-outline-variant">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-grow min-w-[240px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
            <input 
              className="w-full pl-10 pr-4 py-2 bg-surface border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all" 
              placeholder="Search markets, assets, or events..." 
              type="text"
            />
          </div>
          <select 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-label-caps font-label-caps outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="CRYPTO">Crypto</option>
            <option value="MACRO">Macro</option>
            <option value="ELECTION">Election</option>
            <option value="FED">Fed</option>
            <option value="ECB">ECB</option>
            <option value="GEOPOLITICAL">Geopolitical</option>
            <option value="POLITICS">Politics</option>
            <option value="SPORTS">Sports</option>
            <option value="ENTERTAINMENT">Entertainment</option>
          </select>
        </div>
        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant">
            <button 
              onClick={() => setStatus("ACTIVE")}
              className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "ACTIVE" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
            >
              Live
            </button>
            <button 
              onClick={() => setStatus("RESOLVED")}
              className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "RESOLVED" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
            >
              Resolved
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-data-mono text-label-caps text-secondary uppercase">Feed Live</span>
          </div>
        </div>
      </div>
    </section>
  );
};

const MarketCard = ({ id, category, platform, reasoningTraces, expiry, title, yesProb, liquidity, volume24h }: any) => {
  const noProb = 100 - yesProb;
  const latestTrace = reasoningTraces?.[0];
  const aiSignal = latestTrace ? (latestTrace.edge > 0.05 ? "BULLISH" : latestTrace.edge < -0.05 ? "BEARISH" : "NEUTRAL") : "ANALYZING";
  const aiStatus = latestTrace ? `${Math.abs(latestTrace.edge * 100).toFixed(1)}% EDGE` : "STABLE";
  
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="group bg-surface border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all flex flex-col"
    >
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-label-caps font-bold uppercase tracking-wider ${platform === 'ARC' ? 'bg-primary-container text-on-primary-container border border-primary/20' : 'bg-secondary-container text-on-secondary-container'}`}>
              {platform === 'ARC' ? 'Arc Native' : 'Polygon/Poly'}
            </span>
            <span className="bg-surface-container-highest text-on-surface-variant px-2 py-1 rounded text-label-caps font-bold uppercase tracking-wider">{category}</span>
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${aiSignal === 'NEUTRAL' || aiSignal === 'ANALYZING' ? 'bg-surface-container-highest' : aiSignal === 'BEARISH' ? 'bg-tertiary-fixed/30' : 'bg-secondary-fixed/30'}`}>
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {aiSignal === 'ANALYZING' ? 'sync' : aiSignal === 'NEUTRAL' ? 'psychology' : aiSignal === 'BULLISH' ? 'trending_up' : 'trending_down'}
              </span>
              <span className={`${aiSignal === 'NEUTRAL' || aiSignal === 'ANALYZING' ? 'text-on-surface-variant' : aiSignal === 'BEARISH' ? 'text-tertiary' : 'text-secondary'} text-label-caps font-bold uppercase`}>
                AI {aiSignal}: {aiStatus}
              </span>
            </div>
          </div>
          <span className="font-data-mono text-label-caps text-on-surface-variant">EXP: {expiry}</span>
        </div>
        <Link href={`/markets/quick-view?marketId=${id}`} className="block">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-6 group-hover:text-primary transition-colors line-clamp-3">
            {title}
          </h3>
        </Link>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-label-caps font-label-caps mb-2">
              <span className="text-secondary">YES {yesProb}%</span>
              <span className="text-tertiary">NO {noProb}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-outline-variant overflow-hidden flex">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${yesProb}%` }}
                className="h-full bg-secondary transition-all duration-700" 
              />
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${noProb}%` }}
                className="h-full bg-tertiary transition-all duration-700" 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/30 pt-4">
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">Liquidity</p>
              <p className="font-data-mono text-body-md">{liquidity}</p>
            </div>
            <div>
              <p className="text-label-caps text-on-surface-variant uppercase mb-1">Volume 24h</p>
              <p className={`font-data-mono text-body-md ${volume24h.startsWith('+') ? 'text-secondary' : 'text-tertiary'}`}>
                {volume24h}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2 bg-surface-container-low border-t border-outline-variant">
        <Link href={`/markets/quick-view?marketId=${id}&side=YES`} className="bg-secondary text-primary-foreground py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet Yes</Link>
        <Link href={`/markets/quick-view?marketId=${id}&side=NO`} className="bg-tertiary text-primary-foreground py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet No</Link>
      </div>    </motion.div>
  );
};

const TradingFeed = () => {
  const [feed, setFeed] = useState([
    { time: "12:45:12", market: "US Elections 2029", size: "$50,000", bet: "YES", prob: "51% → 51.2%", color: "text-secondary" },
    { time: "12:44:58", market: "Fed Rate Cut Sept", size: "$12,400", bet: "YES", prob: "63.8% → 64%", color: "text-secondary" },
    { time: "12:44:20", market: "ETH ATH 2026", size: "$8,200", bet: "NO", prob: "22.4% → 22%", color: "text-tertiary" },
    { time: "12:43:55", market: "SpaceX Tower Catch", size: "$100,000", bet: "YES", prob: "72% → 74%", color: "text-secondary" },
  ]);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://oracledesk-backend.onrender.com";
    const socket = io(API_URL.replace("/api/v1", ""));

    socket.on("connect", () => {
      console.log("Connected to Trading Feed socket");
    });

    socket.on("TRADE_EXECUTED", (data: any) => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { hour12: false });
      
      const newEntry = {
        time,
        market: data.marketQuestion || "Market Trade",
        size: "$" + data.amount.toLocaleString(),
        bet: data.direction,
        prob: data.probChange || "---",
        color: data.direction === "YES" ? "text-secondary" : "text-tertiary"
      };
      
      setFeed(prev => [newEntry, ...prev.slice(0, 7)]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary">analytics</span>
        <h2 className="font-headline-sm text-headline-sm uppercase tracking-tight">Real-time Trading Feed</h2>
      </div>
      <div className="terminal-log-flow border border-outline-variant rounded-xl overflow-hidden bg-white">
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="pb-3 text-label-caps text-on-surface-variant">Time</th>
                <th className="pb-3 text-label-caps text-on-surface-variant">Market</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-right">Size</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-right">Bet</th>
                <th className="pb-3 text-label-caps text-on-surface-variant text-right">Probability</th>
              </tr>
            </thead>
            <tbody className="font-data-mono text-body-md">
              <AnimatePresence initial={false}>
                {feed.map((row, i) => (
                  <motion.tr 
                    key={row.time + row.market}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="hover:bg-surface-container transition-colors border-b border-outline-variant/30"
                  >
                    <td className="py-3 text-on-surface-variant">{row.time}</td>
                    <td className="py-3">{row.market}</td>
                    <td className="py-3 text-right">{row.size}</td>
                    <td className={`py-3 text-right ${row.color} font-bold`}>{row.bet}</td>
                    <td className="py-3 text-right">{row.prob}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default function Markets() {
  const [status, setStatus] = useState<any>("ACTIVE");
  const [category, setCategory] = useState<string>("");
  const { data, isLoading, error } = useMarkets({ 
    status, 
    category: category as any || undefined 
  });
  const marketsData = data?.markets ?? [];

  useEffect(() => {
    if (error) {
      console.error("Market data fetch error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-surface">
      <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
        <FilterBar 
          status={status} 
          setStatus={setStatus} 
          category={category} 
          setCategory={setCategory} 
        />
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-surface-container-low animate-pulse rounded-xl border border-outline-variant"></div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-surface-container-low rounded-xl border border-error/20">
            <span className="material-symbols-outlined text-error text-4xl mb-4">error</span>
            <p className="text-on-surface-variant font-medium">Failed to load markets.</p>
            <p className="text-on-surface-variant/70 text-sm mt-2">
              {error instanceof Error ? error.message : "Please check if the backend is running and accessible."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-primary text-white rounded-lg font-label-caps text-label-caps"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {marketsData.map((m) => {
              const rawProb = m.currentYesProb ?? m.initialYesProb;
              // Backend returns 0-1, UI expects 0-100
              const yesProb = Math.round(rawProb <= 1 ? rawProb * 100 : rawProb);
              
              return (
                <MarketCard 
                  key={m.id} 
                  id={m.id}
                  category={m.category}
                  platform={m.marketUrl ? 'POLYMARKET' : 'ARC'}
                  reasoningTraces={m.reasoningTraces}
                  expiry={new Date(m.expiryTimestamp).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase()}
                  title={m.question}
                  yesProb={yesProb}
                  liquidity={`$${(m.totalLiquidity).toLocaleString()}`}
                  volume24h="+$0.0K"
                />
              );
            })}
          </div>
        )}

        <TradingFeed />
      </main>
    </div>
  );
}
