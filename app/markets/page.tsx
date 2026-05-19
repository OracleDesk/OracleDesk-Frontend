"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const FilterBar = () => {
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
          <select className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-label-caps font-label-caps outline-none focus:ring-2 focus:ring-primary">
            <option>All Categories</option>
            <option>Crypto</option>
            <option>Economics</option>
            <option>Geopolitics</option>
            <option>Tech</option>
          </select>
          <select className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-label-caps font-label-caps outline-none focus:ring-2 focus:ring-primary">
            <option>Sort: Liquidity</option>
            <option>Sort: Expiry</option>
            <option>Sort: Probability</option>
            <option>Sort: Volume</option>
          </select>
        </div>
        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant">
            <button className="px-4 py-1.5 text-label-caps font-label-caps bg-surface shadow-sm rounded-md text-primary font-bold">Live</button>
            <button className="px-4 py-1.5 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors">Resolved</button>
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

const MarketCard = ({ category, aiSignal, aiStatus, expiry, title, yesProb, liquidity, volume24h }: any) => {
  const noProb = 100 - yesProb;
  
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="group bg-surface border border-outline-variant rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all flex flex-col"
    >
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-2">
            <span className="bg-primary-container/10 text-primary-container px-2 py-1 rounded text-label-caps font-bold uppercase tracking-wider">{category}</span>
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${aiSignal === 'NEUTRAL' ? 'bg-surface-container-highest' : 'bg-tertiary-fixed/30'}`}>
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {aiSignal === 'VOLATILE' ? 'warning' : aiSignal === 'NEUTRAL' ? 'psychology' : 'bolt'}
              </span>
              <span className={`${aiSignal === 'NEUTRAL' ? 'text-on-surface-variant' : 'text-tertiary'} text-label-caps font-bold uppercase`}>
                AI {aiSignal}: {aiStatus}
              </span>
            </div>
          </div>
          <span className="font-data-mono text-label-caps text-on-surface-variant">EXP: {expiry}</span>
        </div>
        <Link href="/markets/quick-view" className="block">
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
        <Link href="/markets/quick-view" className="bg-secondary text-on-secondary py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet Yes</Link>
        <Link href="/markets/quick-view" className="bg-tertiary text-on-tertiary py-2.5 rounded-lg font-label-caps text-label-caps font-bold hover:brightness-110 active:opacity-80 transition-all uppercase text-center">Bet No</Link>
      </div>
    </motion.div>
  );
};

const TradingFeed = () => {
  const [feed, setFeed] = useState([
    { time: "12:45:12", market: "US Elections 2024", size: "$50,000", bet: "YES", prob: "51% → 51.2%", color: "text-secondary" },
    { time: "12:44:58", market: "Fed Rate Cut Sept", size: "$12,400", bet: "YES", prob: "63.8% → 64%", color: "text-secondary" },
    { time: "12:44:20", market: "ETH ATH 2024", size: "$8,200", bet: "NO", prob: "22.4% → 22%", color: "text-tertiary" },
    { time: "12:43:55", market: "SpaceX Tower Catch", size: "$100,000", bet: "YES", prob: "72% → 74%", color: "text-secondary" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { hour12: false });
      const markets = ["US Elections 2024", "Fed Rate Cut Sept", "ETH ATH 2024", "SpaceX Tower Catch", "Gold $2.7k", "Ceasefire Sept"];
      const market = markets[Math.floor(Math.random() * markets.length)];
      const bet = Math.random() > 0.5 ? "YES" : "NO";
      const size = "$" + (Math.floor(Math.random() * 90) + 10) + ",000";
      
      const newEntry = {
        time,
        market,
        size,
        bet,
        prob: "64% → 64.2%", // simplified
        color: bet === "YES" ? "text-secondary" : "text-tertiary"
      };
      
      setFeed(prev => [newEntry, ...prev.slice(0, 7)]);
    }, 5000);
    return () => clearInterval(interval);
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
  const markets = [
    {
      category: "Economics",
      aiSignal: "SIGNAL",
      aiStatus: "BULLISH",
      expiry: "OCT 24",
      title: "Will the Federal Reserve announce a rate cut of 50bps or more at the September FOMC meeting?",
      yesProb: 64,
      liquidity: "$1.24M",
      volume24h: "+$242.5K"
    },
    {
      category: "Crypto",
      aiSignal: "NEUTRAL",
      aiStatus: "STABLE",
      expiry: "DEC 31",
      title: "Will Ethereum (ETH) reach a new all-time high above $4,878 before January 1st, 2025?",
      yesProb: 22,
      liquidity: "$892.1K",
      volume24h: "-$12.8K"
    },
    {
      category: "Geopolitics",
      aiSignal: "VOLATILE",
      aiStatus: "UNSTABLE",
      expiry: "NOV 05",
      title: "Who will win the 2024 United States Presidential Election according to official AP certification?",
      yesProb: 51,
      liquidity: "$14.2M",
      volume24h: "+$1.1M"
    },
    {
      category: "Tech",
      aiSignal: "SIGNAL",
      aiStatus: "POSITIVE",
      expiry: "OCT 10",
      title: "Will SpaceX successfully land the Starship booster on the launch tower in its next flight attempt?",
      yesProb: 74,
      liquidity: "$455.0K",
      volume24h: "+$62.1K"
    },
    {
      category: "Economics",
      aiSignal: "NEUTRAL",
      aiStatus: "STABLE",
      expiry: "NOV 30",
      title: "Will the price of Gold (XAU) reach $2,700/oz before November 30th?",
      yesProb: 41,
      liquidity: "$1.1M",
      volume24h: "-$4.2K"
    },
    {
      category: "Geopolitics",
      aiSignal: "SIGNAL",
      aiStatus: "BEARISH",
      expiry: "SEP 30",
      title: "Will a ceasefire be signed between Israel and Hezbollah by the end of September?",
      yesProb: 8,
      liquidity: "$630.0K",
      volume24h: "+$31.4K"
    }
  ];

  return (
    <div className="min-h-screen bg-surface">
      <main className="pt-24 pb-12 px-gutter max-w-container-max-width mx-auto">
        <FilterBar />
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {markets.map((m, i) => (
            <MarketCard key={i} {...m} />
          ))}
        </div>

        <TradingFeed />
      </main>
    </div>
  );
}
