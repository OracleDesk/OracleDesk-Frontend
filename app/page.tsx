"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { io } from "socket.io-client";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useMarkets } from "@/lib/hooks/useMarkets";

const AgentActivityFeed = () => {
  const [feed, setFeed] = useState([
    { time: "12:45:12", agent: "Alpha-Centauri", action: "DEPLOY_MARKET", details: "US CPI Nov 2026", chain: "Arc", color: "text-primary" },
    { time: "12:44:58", agent: "Kelly-Bot-01", action: "OPEN_POSITION", details: "YES 5,000 USDC @ $0.64", chain: "Polygon", color: "text-secondary" },
    { time: "12:44:20", agent: "Reasoning-Node-7", action: "PUBLISH_TRACE", details: "Trace ID: 0x77AF...42", chain: "Arc", color: "text-primary-fixed" },
    { time: "12:43:55", agent: "Circle-Messenger", action: "CCTP_BURN", details: "20,000 USDC (Polygon)", chain: "Polygon", color: "text-on-primary-fixed-variant" },
  ]);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://oracledesk-backend.onrender.com";
    const socket = io(API_URL.replace("/api/v1", ""));

    socket.on("TRADE_EXECUTED", (data: any) => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { hour12: false });
      setFeed(prev => [{
        time,
        agent: "Autonomous-Agent",
        action: "EXECUTE_TRADE",
        details: `${data.direction} ${data.amount.toLocaleString()} USDC @ ${data.price || "---"}`,
        chain: "Polygon",
        color: "text-secondary"
      }, ...prev.slice(0, 5)]);
    });

    socket.on("REASONING_PUBLISHED", (data: any) => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { hour12: false });
      setFeed(prev => [{
        time,
        agent: "Oracle-Reasoner",
        action: "PUBLISH_TRACE",
        details: `Trace ID: ${data.traceId?.substring(0, 10)}...`,
        chain: "Arc",
        color: "text-primary-fixed"
      }, ...prev.slice(0, 5)]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="bg-on-background rounded-xl overflow-hidden shadow-2xl border border-outline border-opacity-30">
      <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary animate-pulse">monitoring</span>
          <h3 className="font-headline-sm text-headline-sm text-white uppercase tracking-widest text-xs">Live Agent Activity</h3>
        </div>
        <span className="text-white/30 text-[9px] font-data-mono uppercase">Streaming Mainnet Trace</span>
      </div>
      <div className="p-6 h-[320px] overflow-y-auto font-data-mono text-[11px] space-y-3 custom-scrollbar">
        {feed.map((item, i) => (
          <div key={i} className="flex gap-4 border-l border-white/10 pl-4 py-1 hover:bg-white/5 transition-colors group">
            <span className="text-white/20 whitespace-nowrap">[{item.time}]</span>
            <span className="text-primary font-bold whitespace-nowrap">{item.agent}</span>
            <span className={`font-black ${item.color} whitespace-nowrap`}>{item.action}</span>
            <span className="text-white/70 truncate flex-grow">{item.details}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${item.chain === 'Arc' ? 'border-primary/50 text-primary' : 'border-secondary/50 text-secondary'} font-bold`}>{item.chain}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProtocolActivity = () => {
  const activity = [
    { type: "NANOPAYMENT", detail: "USDC 0.10 -> Trace Unlock", status: "CONFIRMED", chain: "Arc", color: "text-secondary" },
    { type: "CCTP_BRIDGE", detail: "Arc -> Polygon Settlement", status: "PENDING", chain: "Cross-Chain", color: "text-primary" },
    { type: "PAYMASTER", detail: "Gas Sponsored: market_deploy", status: "SUCCESS", chain: "Arc", color: "text-secondary" },
  ];

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6 text-on-surface">
        <span className="material-symbols-outlined text-primary">hub</span>
        <h3 className="font-headline-sm text-headline-sm uppercase tracking-tight text-sm">Circle Protocol Activity</h3>
      </div>
      <div className="space-y-4 flex-grow">
        {activity.map((item, i) => (
          <div key={i} className="flex flex-col gap-1 border-b border-outline-variant/30 pb-3 last:border-0">
            <div className="flex justify-between items-center">
              <span className={`font-label-caps text-[10px] font-black ${item.color}`}>{item.type}</span>
              <span className="text-[9px] font-data-mono text-on-surface-variant">{item.chain}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-body-md text-on-surface">{item.detail}</span>
              <span className="text-[9px] bg-surface-container-highest px-1.5 py-0.5 rounded font-bold text-secondary-fixed">{item.status}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4 mt-auto border-t border-outline-variant flex items-center justify-between">
        <span className="text-[10px] text-on-surface-variant font-data-mono uppercase">Arc Gas Status</span>
        <span className="text-[10px] text-secondary font-bold">FREE (SPONSORED)</span>
      </div>
    </div>
  );
};

const Ticker = () => {
  const { data: markets = [] } = useMarkets({ limit: 6 });
  
  const tickerItems = markets.length > 0 
    ? markets.map(m => {
        const prob = Math.round((m.currentYesProb ?? m.initialYesProb) * 100);
        const change = "+0.0%"; // Placeholder for real 1h change if available
        return `${m.question.substring(0, 30).toUpperCase()}: ${prob}% (${change})`;
      })
    : [
        "BTC ETF APPROVAL: 92% (+2.4%)",
        "FED RATE CUT MAR: 41% (-5.1%)",
        "ETH LONDON UPGRADE: 78% (STABLE)",
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
  const { openModal } = useWallet();
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
            <Link href="/markets" className="bg-primary text-primary-foreground px-8 py-4 rounded-lg font-label-caps text-label-caps tracking-widest hover:brightness-110 transition-all flex items-center gap-2">
              BROWSE MARKETS <span className="material-symbols-outlined">trending_up</span>
            </Link>
            <Link href="/reasoning" className="border border-outline text-primary px-8 py-4 rounded-lg font-label-caps text-label-caps tracking-widest hover:bg-surface-container-low transition-all text-center">
              VIEW AI FORECASTS
            </Link>
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

const MarketCard = ({ id, icon, category, platform, change, title, prob, volume, color = "secondary" }: any) => {
  return (
    <div className="bg-white border border-outline-variant p-6 rounded-lg hover:shadow-md transition-all group cursor-pointer block">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-${color}/10 flex items-center justify-center text-${color}`}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div className="flex flex-col">
            <span className={`text-[9px] font-bold uppercase tracking-tighter ${platform === 'ARC' ? 'text-primary' : 'text-secondary'}`}>
              {platform === 'ARC' ? 'Arc Native' : 'Polygon/Poly'}
            </span>
            <span className="font-label-caps text-on-surface-variant">{category}</span>
          </div>
        </div>
        <span className={`font-data-mono text-[12px] ${change.startsWith('+') ? 'text-secondary' : change.startsWith('-') ? 'text-tertiary' : 'text-on-surface-variant'}`}>{change}</span>
      </div>
      <Link href={id ? `/markets/quick-view?marketId=${id}` : "/markets"} className="block">
        <h3 className="font-headline-sm mb-4 group-hover:text-primary transition-colors">{title}</h3>
      </Link>
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
        <Link 
          href={id ? `/markets/quick-view?marketId=${id}` : "/markets"} 
          className="bg-primary text-primary-foreground px-4 py-2 rounded font-label-caps text-[10px] uppercase group-hover:bg-primary-container"
        >
          Trade Now
        </Link>
      </div>
    </div>
  );
};

const MarketsGrid = () => {
  const { data, isLoading } = useMarkets({ limit: 3 });
  const markets = data?.markets ?? [];

  return (
    <section className="py-20 max-w-container-max-width mx-auto px-gutter">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background">Live Prediction Markets</h2>
          <p className="text-on-surface-variant">Real-time betting on global outcomes verified by OracleDesk AI.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/markets" className="p-2 border border-outline-variant rounded hover:bg-white transition-colors flex items-center gap-2 font-label-caps text-label-caps">
            VIEW ALL <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-64 bg-surface-container-low animate-pulse rounded-lg border border-outline-variant"></div>
          ))
        ) : markets.length > 0 ? (
          markets.map((m) => {
            let icon = 'policy';
            let color = 'secondary';
            
            if (m.category === 'CRYPTO') {
              icon = 'currency_bitcoin';
              color = 'primary';
            } else if (m.category === 'FED' || m.category === 'ECB' || m.category === 'MACRO') {
              icon = 'account_balance';
              color = 'secondary';
            } else if (m.category === 'ELECTION' || m.category === 'POLITICS') {
              icon = 'policy';
              color = 'secondary';
            } else if (m.category === 'SPORTS') {
              icon = 'sports_basketball';
              color = 'tertiary';
            } else if (m.category === 'GEOPOLITICAL') {
              icon = 'public';
              color = 'secondary';
            }

            return (
              <MarketCard 
                key={m.id}
                id={m.id}
                icon={icon}
                category={m.category}
                platform={m.marketUrl ? 'POLYMARKET' : 'ARC'}
                change="+0.0% 24H"
                title={m.question}
                prob={Math.round((m.currentYesProb ?? m.initialYesProb) * 100)}
                volume={`$${(m.totalLiquidity / 1000).toFixed(1)}K`}
                color={color}
              />
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center bg-surface-container-low rounded-xl border border-outline-variant">
            <span className="material-symbols-outlined text-outline text-4xl mb-4">search_off</span>
            <p className="text-on-surface-variant font-medium">No live markets found.</p>
            <p className="text-on-surface-variant/70 text-sm mt-2">Check back later or deploy a new market from the admin terminal.</p>
          </div>
        )}
      </div>
    </section>
  );
};

const ReasoningSection = () => {
  return (
    <section className="bg-surface-container-low py-20">
      <div className="max-w-container-max-width mx-auto px-gutter grid lg:grid-cols-2 gap-16 items-center">
        <div className="order-2 lg:order-1">
          <div className="bg-on-background text-primary-fixed-dim rounded-xl overflow-hidden shadow-2xl border border-outline p-8 h-80 flex flex-col justify-center">
            <div className="font-data-mono text-sm space-y-2 overflow-hidden opacity-80">
              <p>&gt; INITIALIZING ORACLE TRACE 0x77AF...</p>
              <p>&gt; ANALYZING 14,204 DATA POINTS</p>
              <p>&gt; CROSS-REFERENCING HISTORICAL FOMC SENTIMENT</p>
              <p>&gt; CORRELATION DETECTED: 0.89 WITH 2019 PIVOT</p>
              <p>&gt; CALCULATING CONFIDENCE INTERVALS...</p>
              <p>&gt; TRACE ANCHORED ON ETHEREUM MAINNET</p>
              <p className="text-secondary animate-pulse">&gt; VERDICT: DOVISH SHIFT CONFIRMED</p>
            </div>
          </div>
        </div>
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
                <span className="material-symbols-outlined text-primary">hub</span>
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

const PortfolioAnalytics = () => {
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
              <button className="px-3 py-1 bg-primary text-primary-foreground rounded font-label-caps text-[10px]">1W</button>
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
            <Link 
              href="/premium" 
              className="w-full bg-primary-fixed text-on-primary-fixed py-3 rounded font-bold font-label-caps text-[12px] tracking-widest text-center hover:brightness-110 transition-all"
            >
              UPGRADE NOW
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

const CTA = () => {
  const { openModal } = useWallet();
  return (
    <section className="py-20 bg-on-background text-surface">
      <div className="max-w-container-max-width mx-auto px-gutter text-center">
        <h2 className="font-display-lg text-display-lg mb-8">Ready to predict the future?</h2>
        <p className="text-surface-variant max-w-xl mx-auto mb-10 text-body-lg">Join 10,000+ institutional analysts and traders leveraging OracleDesk for superior market edges.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            className="border border-outline-variant text-primary-foreground px-10 py-5 rounded-lg font-bold font-label-caps tracking-widest hover:bg-white/10 hover:scale-105 transition-transform"
            onClick={() => openModal()}
          >
            CONNECT WALLET
          </button>
          <button className="border border-outline-variant px-10 py-5 rounded-lg font-bold font-label-caps tracking-widest hover:bg-white/10 hover:scale-105 transition-colors">READ DOCUMENTATION</button>
        </div>
      </div>
    </section>
  );
};

export default function Home() {
  return (
    <>
      <main className="pt-16">
        <Ticker />
        <Hero />
        
        {/* J1 & J3: Agent Activity & Protocol Showcasing */}
        <section className="bg-white py-12 border-b border-outline-variant">
          <div className="max-w-container-max-width mx-auto px-gutter grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <AgentActivityFeed />
            </div>
            <div>
              <ProtocolActivity />
            </div>
          </div>
        </section>

        <MarketsGrid />
        <ReasoningSection />
        <PortfolioAnalytics />
        <CTA />
      </main>
    </>
  );
}