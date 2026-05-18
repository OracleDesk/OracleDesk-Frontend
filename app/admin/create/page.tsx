"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@/lib/contexts/WalletContext";

export default function AdminPage() {
  const { isConnected, connect } = useWallet();
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("Crypto");
  const [expiry, setExpiry] = useState("");
  const [liquidity, setLiquidity] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setTerminalLogs((prev) => [msg, ...prev.slice(0, 4)]);
  };

  const handleQuestionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuestion(e.target.value);
    addLog("PARAM_CHANGE: QUESTION_STR");
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCategory(val);
    addLog(`PARAM_CHANGE: CATEGORY_${val.toUpperCase()}`);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiry(e.target.value);
    addLog("PARAM_CHANGE: EXPIRY_TIMESTAMP");
  };

  const handleLiquidityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLiquidity(e.target.value);
    addLog(`LIQUIDITY_UPDATE: ${e.target.value || "0"} USDC`);
  };

  const handleAiToggle = () => {
    const newState = !aiEnabled;
    setAiEnabled(newState);
    addLog(`AI_ORACLE: ${newState ? "ENABLED" : "DISABLED"}`);
  };

  const handleDeployHover = () => {
    addLog("AWAITING_DEPLOY_COMMAND...");
  };

  if (!isConnected) {
    return (
      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="max-w-md w-full text-center space-y-6 bg-white p-10 rounded-xl border border-outline-variant shadow-sm">
          <div className="w-20 h-20 bg-primary-container text-primary rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-4xl">lock</span>
          </div>
          <div className="space-y-2">
            <h2 className="font-headline-md text-headline-md">Restricted Access</h2>
            <p className="text-on-surface-variant">
              The Market Deployment Terminal requires a secure wallet connection for institutional authentication.
            </p>
          </div>
          <button
            onClick={connect}
            className="w-full bg-primary text-primary-foreground py-4 rounded-lg font-label-caps text-label-caps hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <span className="material-symbols-outlined">account_balance_wallet</span>
            CONNECT WALLET TO ACCESS
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow max-w-container-max-width mx-auto px-gutter py-12 w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Market Deployment Form */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-2">
            <h1 className="font-display-lg text-display-lg text-primary">Deploy New Market</h1>
            <p className="text-on-surface-variant font-body-lg text-body-lg">
              Institutional prediction engine terminal. Ensure parameter precision before execution.
            </p>
          </div>
          
          <form className="space-y-6 bg-white p-8 rounded-xl border border-outline-variant shadow-sm">
            {/* Market Question */}
            <div className="space-y-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant flex items-center justify-between">
                MARKET_QUESTION
                <span className="text-[10px] opacity-50">REQUIRED</span>
              </label>
              <input
                className="w-full bg-surface border border-outline-variant rounded p-3 focus:ring-2 focus:ring-primary focus:border-primary transition-all font-body-md text-body-md outline-none"
                id="market_question"
                placeholder="Will ETH exceed $5,000 by year end?"
                type="text"
                value={question}
                onChange={handleQuestionChange}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category */}
              <div className="space-y-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant">CATEGORY</label>
                <select
                  className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  id="market_category"
                  value={category}
                  onChange={handleCategoryChange}
                >
                  <option value="Crypto">Crypto</option>
                  <option value="Macro">Macro</option>
                  <option value="Politics">Politics</option>
                  <option value="Tech">Tech</option>
                </select>
              </div>
              
              {/* Expiry */}
              <div className="space-y-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant">EXPIRY_DATE</label>
                <input
                  className="w-full bg-surface border border-outline-variant rounded p-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  id="market_expiry"
                  type="date"
                  value={expiry}
                  onChange={handleExpiryChange}
                />
              </div>
            </div>

            {/* Initial Liquidity */}
            <div className="space-y-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant flex justify-between">
                INITIAL_LIQUIDITY (USDC)
                <span className="text-secondary font-bold">Min: 500 USDC</span>
              </label>
              <div className="relative">
                <input
                  className="w-full bg-surface border border-outline-variant rounded p-3 pl-12 font-data-mono text-data-mono outline-none focus:ring-2 focus:ring-primary"
                  id="market_liquidity"
                  placeholder="1000.00"
                  type="number"
                  value={liquidity}
                  onChange={handleLiquidityChange}
                />
                <span className="material-symbols-outlined absolute left-3 top-3 text-on-surface-variant">
                  account_balance_wallet
                </span>
              </div>
            </div>

            {/* AI Toggle */}
            <div className="flex items-center justify-between p-4 bg-surface-container-low rounded border border-outline-variant">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-primary-container flex items-center justify-center text-on-primary-container">
                  <span className="material-symbols-outlined">psychology</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm">AI Oracle Reasoning</h3>
                  <p className="text-[12px] text-on-surface-variant">Generate autonomous probability analysis reports.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={aiEnabled}
                  onChange={handleAiToggle}
                />
                <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <button
              className="w-full py-4 bg-primary text-primary-foreground font-label-caps text-label-caps rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              type="button"
              onMouseEnter={handleDeployHover}
            >
              <span className="material-symbols-outlined">rocket_launch</span>
              DEPLOY INSTITUTIONAL MARKET
            </button>
          </form>
        </div>

        {/* Right Column: Live Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-label-caps text-label-caps text-on-surface-variant">Live Deployment Preview</span>
          </div>

          {/* Market Card Preview */}
          <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-xl transform transition-all duration-300">
            <div className="h-48 w-full relative overflow-hidden bg-surface-container-highest">
              <img
                className="w-full h-full object-cover grayscale opacity-80 mix-blend-multiply"
                alt="Institutional visualization"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7FiJJ7sCo6dW99Uh6sf8yQcw73IjM_4A2pdNs0dj9afvkNN1hpn0dlH-agD-ABeVpOkBquXq3EZE7vi-ixzD3WjLg-6hHYnccOQCOJkxyWeWcSAt7698t62mBR-rHp8t_zodjWUTxBlxuSeHBBYGuZtHnWJ7v5WMKhtYkqFYJjD0JbfiRZg6p8Hnh5SumePl7LNf-kSBQk0ZUqomcgYgjXv2ZmVFHvnkr70x6z8RhkZt-y3neHubxq2yqi5t7lvoV9gXusCiy8w"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded border border-outline-variant">
                <span className="font-label-caps text-label-caps text-primary">
                  {category.toUpperCase()}
                </span>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <h2 className="font-headline-md text-headline-md text-on-background min-h-[3rem]">
                {question || "Enter market question..."}
              </h2>
              
              <div className="space-y-3">
                <div className="flex justify-between font-label-caps text-label-caps text-on-surface-variant">
                  <span>PROBABILITY ANALYSIS</span>
                  <span className="text-primary">50% YES / 50% NO</span>
                </div>
                {/* Probability Bar */}
                <div className="h-4 w-full bg-surface-container rounded-full overflow-hidden flex">
                  <div className="h-full bg-secondary w-1/2 transition-all duration-500 border-r border-white"></div>
                  <div className="h-full bg-tertiary-container w-1/2 transition-all duration-500"></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-6">
                <div className="space-y-1">
                  <span className="font-label-caps text-label-caps text-on-surface-variant block">LIQUIDITY</span>
                  <span className="font-data-mono text-data-mono text-on-surface">
                    {liquidity ? `${parseFloat(liquidity).toLocaleString()} USDC` : "0.00 USDC"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="font-label-caps text-label-caps text-on-surface-variant block">EXPIRES</span>
                  <span className="font-data-mono text-data-mono text-on-surface">
                    {expiry || "-- -- ----"}
                  </span>
                </div>
              </div>

              {/* AI Reasoning Ghost Card */}
              <div 
                className={`p-4 bg-[#f0f9fa] rounded border border-primary-container/20 space-y-2 transition-opacity duration-300 ${aiEnabled ? "opacity-100" : "opacity-0"}`}
              >
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  <span className="font-label-caps text-label-caps">ORACLE INSIGHT ENABLED</span>
                </div>
                <div className="h-2 w-3/4 bg-primary-container/10 rounded"></div>
                <div className="h-2 w-1/2 bg-primary-container/10 rounded"></div>
              </div>
            </div>
          </div>

          {/* Terminal Log View */}
          <div className="bg-on-background text-primary-fixed-dim p-4 rounded-lg font-data-mono text-[12px] h-32 overflow-y-auto space-y-1 border border-primary-container shadow-inner custom-scrollbar">
            <p className="text-secondary-fixed">&gt;&gt; INITIALIZING_DEPLOYMENT_MODULE...</p>
            <p className="opacity-70">&gt; Wallet Address: 0x82...f92a connected.</p>
            <p className="opacity-70">&gt; Awaiting market parameters...</p>
            <p className="opacity-70">&gt; Security handshake: VALID</p>
            {terminalLogs.map((log, i) => (
              <p key={i} className="text-primary-fixed-dim opacity-70">
                &gt; {log}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
