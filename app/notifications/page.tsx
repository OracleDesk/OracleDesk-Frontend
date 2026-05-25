"use client";

import React, { useState } from "react";
import Link from "next/link";

type NotificationType = "all" | "critical" | "trading" | "ai";

interface NotificationItem {
  id: string;
  type: Exclude<NotificationType, "all">;
  title: string;
  message: string;
  time: string;
  payout?: string;
  txHash?: string;
  probability?: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  borderColor: string;
}

const notificationsData: NotificationItem[] = [
  {
    id: "1",
    type: "critical",
    title: "Market Resolution Critical",
    message: "The \"Fed Rate Cut Sept\" market has been resolved to YES. Total payout of 1,240.50 USDC has been distributed to your wallet.",
    time: "2m ago",
    payout: "1,240.50 USDC",
    icon: "gavel",
    iconBg: "bg-tertiary-fixed",
    iconColor: "text-tertiary",
    borderColor: "border-l-tertiary",
  },
  {
    id: "2",
    type: "ai",
    title: "Bullish AI Reasoning",
    message: "Oracle Reasoner detects institutional accumulation on \"Layer 2 Adoption\" markets. Probability climbing from 42% to 58%.",
    time: "15m ago",
    probability: 58,
    icon: "insights",
    iconBg: "bg-primary-fixed",
    iconColor: "text-primary",
    borderColor: "border-l-primary",
  },
  {
    id: "3",
    type: "trading",
    title: "Trade Confirmed",
    message: "Purchased 5,000 shares of NO on \"Will BTC hit $100k in 2026\" at avg price $0.34.",
    time: "42m ago",
    txHash: "0x4f...8a2b",
    icon: "check_circle",
    iconBg: "bg-secondary-fixed",
    iconColor: "text-secondary",
    borderColor: "border-l-secondary",
  },
  {
    id: "4",
    type: "ai",
    title: "Price Movement Alert",
    message: "Significant volatility in \"ETH Staking Reward Rate\" market. Up +8.4% in the last 15 minutes.",
    time: "1h ago",
    icon: "trending_up",
    iconBg: "bg-primary-fixed",
    iconColor: "text-primary",
    borderColor: "border-l-primary",
  },
  {
    id: "5",
    type: "trading",
    title: "Limit Order Filled",
    message: "Your limit order for \"Mars Landing by 2030\" has been fully filled at $0.08.",
    time: "3h ago",
    icon: "history",
    iconBg: "bg-secondary-fixed",
    iconColor: "text-secondary",
    borderColor: "border-l-secondary",
  },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationType>("all");

  const filteredNotifications = notificationsData.filter(
    (item) => filter === "all" || item.type === filter
  );

  const filterButtons = [
    { label: "All Notifications", type: "all" as const, icon: "dashboard", count: 24 },
    { label: "Critical", type: "critical" as const, icon: "warning", count: 2 },
    { label: "Trading", type: "trading" as const, icon: "payments", count: 12 },
    { label: "AI Signals", type: "ai" as const, icon: "psychology", count: 10 },
  ];

  return (
    <main className="flex-grow pt-8 pb-12 px-gutter max-w-container-max-width mx-auto w-full">
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Filter and Summary */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded shadow-sm">
            <h2 className="font-headline-sm text-headline-sm mb-4">Activity</h2>
            <div className="space-y-1">
              {filterButtons.map((btn) => (
                <button
                  key={btn.type}
                  onClick={() => setFilter(btn.type)}
                  className={`w-full flex items-center justify-between p-2 rounded transition-all duration-200 cursor-pointer ${
                    filter === btn.type
                      ? "text-primary bg-surface-container-low font-bold"
                      : "text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[20px] ${
                      btn.type === 'critical' ? 'text-tertiary' : 
                      btn.type === 'trading' ? 'text-secondary' : 
                      btn.type === 'ai' ? 'text-primary' : ''
                    }`}>
                      {btn.icon}
                    </span>
                    {btn.label}
                  </span>
                  <span className="text-xs bg-surface-container-high px-2 py-0.5 rounded-full">
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-surface-container-low border border-outline-variant p-4 rounded bg-gradient-to-br from-[#f0f9fa] to-[#e0f2f4]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
              <span className="font-label-caps text-label-caps text-primary">ORACLE INSIGHT</span>
            </div>
            <p className="text-body-md text-on-surface-variant leading-relaxed italic">
              High volatility detected in the 2026 Election Prediction Market. AI reasoning suggests a 12% probability shift in the next 4 hours.
            </p>
          </div>
        </div>

        {/* Middle Column: Main Feed */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="font-headline-md text-headline-md">Alert Center</h1>
            <button className="text-primary font-label-caps text-label-caps hover:underline cursor-pointer">
              Mark all as read
            </button>
          </div>

          <div className="space-y-3">
            {filteredNotifications.map((item) => (
              <div
                key={item.id}
                className={`group bg-surface-container-lowest border-l-4 ${item.borderColor} border-y border-r border-outline-variant p-4 rounded-r flex gap-4 hover:bg-white hover:translate-x-1 transition-all duration-200 cursor-pointer shadow-sm`}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-full ${item.iconBg} flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${item.iconColor}`}>
                    {item.icon}
                  </span>
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <h3 className={`font-headline-sm text-headline-sm ${item.iconColor}`}>
                      {item.title}
                    </h3>
                    <span className="font-data-mono text-data-mono text-on-surface-variant text-[12px]">
                      {item.time}
                    </span>
                  </div>
                  <p className="text-body-md mt-1 text-on-surface">
                    {item.message}
                  </p>
                  
                  {item.payout && (
                    <div className="mt-3 flex gap-2">
                      <button className="px-3 py-1 bg-surface-container-high text-on-surface text-label-caps font-label-caps rounded hover:bg-surface-variant transition-colors">
                        View Payout
                      </button>
                    </div>
                  )}

                  {item.probability !== undefined && (
                    <div className="mt-3">
                      <div className="w-full bg-surface-container h-1 rounded overflow-hidden">
                        <div 
                          className="bg-primary h-full transition-all duration-1000" 
                          style={{ width: `${item.probability}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {item.txHash && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-data-mono bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                        TX: {item.txHash}
                      </span>
                      <span className="material-symbols-outlined text-xs text-primary">
                        open_in_new
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {filteredNotifications.length === 0 && (
              <div className="text-center py-12 bg-white border border-dashed border-outline-variant rounded-lg">
                <p className="text-on-surface-variant">No notifications found for this category.</p>
              </div>
            )}
          </div>

          <div className="flex justify-center py-6">
            <button className="px-6 py-2 border border-outline-variant font-label-caps text-label-caps rounded hover:bg-surface-container transition-colors cursor-pointer text-[12px]">
              Load Older Notifications
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
