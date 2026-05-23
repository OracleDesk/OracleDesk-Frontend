"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Ticker = () => {
  const tickerItems = [
    "BTC ETF APPROVAL: 92% (+2.4%)",
    "FED RATE CUT MAR: 41% (-5.1%)",
    "ETH LONDON UPGRADE: 78% (STABLE)",
    "US ELECTION 2024: TRUMP 52% / BIDEN 48%",
    "SOLANA BREAKPOINT ANNOUNCEMENT: 65% (+12%)",
  ];

  return (
    <div className="bg-on-background text-primary-fixed-dim py-2 border-b border-outline overflow-hidden">
      <div className="ticker-wrap w-full">
        <div className="ticker-content animate-ticker font-data-mono text-data-mono uppercase flex gap-8 whitespace-nowrap">
          {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i}>{item} •</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const Hero = () => {
  const [yesProb, setYesProb] = useState(84.2);

  useEffect(() => {
    const interval = setInterval(() => {
      setYesProb(70 + Math.random() * 20);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden bg-surface py-20 border-b border-outline-variant">
      <div className="max-w-container-max-width mx-auto px-gutter grid lg:grid-cols-2 gap-12 items-center">
        <div className="z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full mb-6"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: '"FILL" 1' }}>bolt</span>
            <span className="font-label-caps text-label-caps">Institutional Grade Intelligence</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display-lg text-display-lg text-on-background mb-6 max-w-xl"
          >
            The World&apos;s Most Accurate AI-Driven Prediction Terminal.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-body-lg text-body-lg text-on-surface-variant mb-10 max-w-lg"
          >
            OracleDesk combines deep-learning reasoning traces with real-time market liquidity to provide institutional-grade forecasting.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-4"
          >
            <a href="/markets" className="bg-primary text-on-primary px-8 py-4 rounded-lg font-label-caps text-label-caps tracking-widest hover:brightness-110 transition-all flex items-center gap-2">
              BROWSE MARKETS <span className="material-symbols-outlined">trending_up</span>
            </a>
            <button className="border border-outline text-primary px-8 py-4 rounded-lg font-label-caps text-label-caps tracking-widest hover:bg-surface-container-low transition-all">
              VIEW AI FORECASTS
            </button>
          </motion.div>
        </div>
        <div className="relative">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-panel p-6 rounded-xl shadow-sm border-outline-variant flex flex-col gap-6"
          >
            <div className="flex justify-between items-center">
              <span className="font-headline-sm text-headline-sm">Market Probability: US Fed Pivot</span>
              <span className="font-data-mono text-primary bg-primary-fixed px-2 py-1 rounded text-[12px]">LIVE SIGNAL</span>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="font-label-caps text-on-surface-variant">AI REASONING CONFIDENCE</span>
                <span className="font-data-mono text-secondary font-bold">{yesProb.toFixed(1)}% YES</span>
              </div>
              <div className="h-10 w-full bg-surface-container rounded-full flex overflow-hidden border border-outline-variant">
                <motion.div 
                  className="bg-secondary h-full"
                  animate={{ width: `${yesProb}%` }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                />
                <motion.div 
                  className="bg-tertiary h-full flex-1"
                />
              </div>
              <div className="flex justify-between text-label-caps font-bold">
                <span className="text-secondary">YES ${(yesProb/100).toFixed(2)}</span>
                <span className="text-tertiary">NO ${(1 - yesProb/100).toFixed(2)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-lg border border-outline-variant">
                <div className="text-label-caps text-on-surface-variant mb-1">24H VOLUME</div>
                <div className="font-headline-sm text-on-surface">$12.4M</div>
              </div>
              <div className="bg-surface-container-low p-4 rounded-lg border border-outline-variant">
                <div className="text-label-caps text-on-surface-variant mb-1">LIQUIDITY DEPTH</div>
                <div className="font-headline-sm text-on-surface">$4.1M</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface-container-highest rounded border-l-4 border-primary">
              <span className="material-symbols-outlined text-primary">auto_awesome</span>
              <p className="text-body-md italic text-on-surface-variant">&quot;Oracle Insight: Recent FOMC minutes suggest a dovish shift in sentiment, increasing the probability of a March cut.&quot;</p>
            </div>
          </motion.div>
          <div className="absolute -top-10 -right-10 -z-10 w-64 h-64 bg-primary-fixed-dim/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-10 -left-10 -z-10 w-64 h-64 bg-secondary-fixed/20 rounded-full blur-3xl"></div>
        </div>
      </div>
    </section>
  );
};

const MarketCard = ({ icon, category, change, title, prob, volume, color = "secondary" }: any) => {
  return (
    <a href="/market" className="bg-white border border-outline-variant p-6 rounded-lg hover:shadow-md transition-all group cursor-pointer block">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-${color}`}>{icon}</span>
          <span className="font-label-caps text-on-surface-variant">{category}</span>
        </div>
        <span className={`font-data-mono text-[12px] ${change.startsWith('+') ? 'text-secondary' : change.startsWith('-') ? 'text-tertiary' : 'text-on-surface-variant'}`}>{change}</span>
      </div>
      <h3 className="font-headline-sm mb-4 line-clamp-2 min-h-[3.5rem]">{title}</h3>
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
            <div className={`bg-${color} h-full`} style={{ width: `${prob}%` }}></div>
          </div>
        </div>
        <span className="font-data-mono font-bold text-on-surface">{prob}%</span>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-label-caps text-on-surface-variant">Vol: {volume}</div>
        <button className="bg-primary text-on-primary px-4 py-2 rounded font-label-caps text-[10px] uppercase group-hover:bg-primary-container transition-colors">Trade Now</button>
      </div>
    </a>
  );
};

const MarketsGrid = () => {
  return (
    <section className="py-20 max-w-container-max-width mx-auto px-gutter">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background">Live Prediction Markets</h2>
          <p className="text-on-surface-variant">Real-time betting on global outcomes verified by OracleDesk AI.</p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 border border-outline-variant rounded hover:bg-white transition-colors">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
          <button className="p-2 border border-outline-variant rounded hover:bg-white transition-colors">
            <span className="material-symbols-outlined">sort</span>
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MarketCard 
          icon="currency_bitcoin" 
          category="CRYPTO" 
          change="+4.2% 1H" 
          title="Will Bitcoin hit $100k by year-end 2024?" 
          prob={62} 
          volume="$45.2M" 
          color="primary"
        />
        <MarketCard 
          icon="policy" 
          category="GOVERNANCE" 
          change="-1.8% 1H" 
          title="Next UK General Election date in May 2024?" 
          prob={15} 
          volume="$8.9M" 
          color="secondary"
        />
        <MarketCard 
          icon="eco" 
          category="SCIENCE" 
          change="0.0% 1H" 
          title="LK-99 Room Temp Superconductor Replication?" 
          prob={3} 
          volume="$1.2M" 
          color="secondary"
        />
      </div>
    </section>
  );
};

const ReasoningSection = () => {
  return (
    <section className="bg-surface-container-low py-20">
      <div className="max-w-container-max-width mx-auto px-gutter grid lg:grid-cols-2 gap-16 items-center">
        <div className="order-1 lg:order-2">
          <div className="flex items-center gap-2 mb-4 text-primary">
            <span className="material-symbols-outlined">psychology</span>
            <span className="font-label-caps">TRANSPARENT REASONING</span>
          </div>
          <h2 className="font-display-lg text-display-lg text-on-background mb-6">Trust, but verify with Oracle Traces.</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-8">
            Every prediction made by our models is accompanied by a full reasoning trace. We don&apos;t just give you a number; we show you the evidence, the chain of thought, and the risk factors.
          </p>
          <ul className="space-y-6">
            <li className="flex items-start gap-4">
              <div className="bg-primary-fixed p-2 rounded">
                <span className="material-symbols-outlined text-primary">verified</span>
              </div>
              <div>
                <h4 className="font-headline-sm">Verifiable AI Chains</h4>
                <p className="text-body-md text-on-surface-variant">Each trace is anchored on-chain to ensure zero tampering post-event.</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="bg-secondary-fixed p-2 rounded">
                <span className="material-symbols-outlined text-secondary">hub</span>
              </div>
              <div>
                <h4 className="font-headline-sm">Multi-Model Consensus</h4>
                <p className="text-body-md text-on-surface-variant">Our engine aggregates results from three distinct reasoning architectures.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};

const PortfolioAnalyticsPreview = () => {
  return (
    <section className="py-24 max-w-container-max-width mx-auto px-gutter">
      <div className="text-center mb-16">
        <h2 className="font-display-lg text-display-lg mb-4">Precision Portfolio Tracking</h2>
        <p className="text-on-surface-variant max-w-2xl mx-auto">Track your prediction edge across multiple markets with terminal-grade analytics.</p>
      </div>
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded-xl p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <span className="font-label-caps text-on-surface-variant">EQUITY CURVE</span>
              <div className="font-headline-md text-secondary">+$14,204.12 (24.1%)</div>
            </div>
            <div className="flex gap-2 items-center">
              <button className="px-3 py-1 bg-surface-container rounded font-label-caps text-[10px]">1D</button>
              <button className="px-3 py-1 bg-primary text-on-primary rounded font-label-caps text-[10px]">1W</button>
              <button className="px-3 py-1 bg-surface-container rounded font-label-caps text-[10px]">1M</button>
              <button className="px-3 py-1 bg-surface-container rounded font-label-caps text-[10px]">ALL</button>
              <a href="/portfolio" className="ml-4 px-3 py-1 border border-primary text-primary rounded font-label-caps text-[10px] hover:bg-primary/5 transition-colors">VIEW FULL</a>
            </div>
          </div>
          <div className="h-64 flex items-end gap-2">
            <div className="flex-1 bg-surface-container h-[25%] rounded-t"></div>
            <div className="flex-1 bg-surface-container h-[33%] rounded-t"></div>
            <div className="flex-1 bg-surface-container h-[50%] rounded-t"></div>
            <div className="flex-1 bg-surface-container h-[40%] rounded-t"></div>
            <div className="flex-1 bg-primary h-[75%] rounded-t"></div>
            <div className="flex-1 bg-primary h-[66%] rounded-t"></div>
            <div className="flex-1 bg-primary h-[83%] rounded-t"></div>
            <div className="flex-1 bg-primary h-full rounded-t"></div>
            <div className="flex-1 bg-secondary h-[80%] rounded-t"></div>
            <div className="flex-1 bg-secondary h-full rounded-t"></div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white border border-outline-variant p-6 rounded-xl shadow-sm">
            <h4 className="font-label-caps mb-4 text-on-surface-variant">TOP POSITIONS</h4>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="font-body-md font-semibold">FED PIVOT MAY</span>
                <span className="text-secondary font-bold">+$4.2k</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body-md font-semibold">ETH SPOT APPROVAL</span>
                <span className="text-secondary font-bold">+$1.8k</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body-md font-semibold">UK ELECTION</span>
                <span className="text-tertiary font-bold">-$0.5k</span>
              </div>
            </div>
          </div>
          <div className="bg-primary-container text-on-primary-container p-6 rounded-xl shadow-sm flex flex-col justify-between h-full">
            <div>
              <span className="material-symbols-outlined text-[32px] mb-2">workspace_premium</span>
              <h4 className="font-headline-sm mb-2">Oracle Premium</h4>
              <p className="text-body-md text-on-primary-container/80 mb-4">Unlock advanced trace depth and lower trade fees with the Premium pass.</p>
            </div>
            <button className="w-full bg-primary-fixed text-on-primary-fixed py-3 rounded font-bold font-label-caps text-[12px] tracking-widest">UPGRADE NOW</button>
          </div>
        </div>
      </div>
    </section>
  );
};

const CTA = () => {
  return (
    <section className="py-20 bg-on-background text-surface">
      <div className="max-w-container-max-width mx-auto px-gutter text-center">
        <h2 className="font-display-lg text-display-lg mb-8">Ready to predict the future?</h2>
        <p className="text-surface-variant max-w-xl mx-auto mb-10 text-body-lg">Join 10,000+ institutional analysts and traders leveraging OracleDesk for superior market edges.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button className="bg-secondary-fixed text-on-secondary-fixed px-10 py-5 rounded-lg font-bold font-label-caps tracking-widest hover:scale-105 transition-transform">CONNECT WALLET</button>
          <button className="border border-outline-variant px-10 py-5 rounded-lg font-bold font-label-caps tracking-widest hover:bg-white/10 transition-colors">READ DOCUMENTATION</button>
        </div>
      </div>
    </section>
  );
};

export default function Home() {
  return (
    <main className="pt-16">
      <Ticker />
      <Hero />
      <MarketsGrid />
      <ReasoningSection />
      <PortfolioAnalyticsPreview />
      <CTA />
    </main>
  );
}
