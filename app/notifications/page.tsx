"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { usePositions } from "@/lib/hooks/usePortfolio";

type NotificationType = "all" | "critical" | "trading" | "ai";

interface NotificationItem {
  id: string;
  type: Exclude<NotificationType, "all">;
  title: string;
  message: string;
  time: string;
  timestamp: number;
  payout?: string;
  txHash?: string;
  probability?: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  borderColor: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationType>("all");
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[]>([]);
  const { data: positionsData } = usePositions({ limit: 10 });

  // Map positions to notification items
  useEffect(() => {
    if (positionsData?.positions) {
      const positionNotifications: NotificationItem[] = positionsData.positions.map(pos => ({
        id: `pos-${pos.id}`,
        type: "trading",
        title: "Trade Confirmed",
        message: `${pos.status === 'CLOSED' ? 'Closed' : 'Opened'} ${pos.direction} position on "${pos.market.question}" for ${pos.amount.toLocaleString()} USDC.`,
        time: new Date(pos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date(pos.createdAt).getTime(),
        txHash: pos.trade?.txHash || undefined,
        icon: pos.status === 'CLOSED' ? "history" : "check_circle",
        iconBg: "bg-secondary-fixed",
        iconColor: "text-secondary",
        borderColor: "border-l-secondary",
      }));

      setLocalNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newItems = positionNotifications.filter(n => !existingIds.has(n.id));
        return [...prev, ...newItems].sort((a, b) => b.timestamp - a.timestamp);
      });
    }
  }, [positionsData]);

  // Socket listener for real-time trades
  useEffect(() => {
    const socket = io(API_URL.replace("/api/v1", ""));

    socket.on("TRADE_EXECUTED", (data: any) => {
      console.log("Real-time trade detected:", data);
      const newNotif: NotificationItem = {
        id: `socket-${Date.now()}`,
        type: "trading",
        title: "New Trade Executed",
        message: `Oracle agent executed ${data.side} trade on Market ${data.marketId.substring(0,8)}... for ${data.amount} USDC.`,
        time: "Just now",
        timestamp: Date.now(),
        txHash: data.txHash,
        icon: "bolt",
        iconBg: "bg-secondary-fixed",
        iconColor: "text-secondary",
        borderColor: "border-l-secondary",
      };
      setLocalNotifications(prev => [newNotif, ...prev]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredNotifications = localNotifications.filter(
    (item) => filter === "all" || item.type === filter
  );

  const filterButtons = [
    { label: "All Notifications", type: "all" as const, icon: "dashboard", count: localNotifications.length },
    { label: "Critical", type: "critical" as const, icon: "warning", count: localNotifications.filter(n => n.type === 'critical').length },
    { label: "Trading", type: "trading" as const, icon: "payments", count: localNotifications.filter(n => n.type === 'trading').length },
    { label: "AI Signals", type: "ai" as const, icon: "psychology", count: localNotifications.filter(n => n.type === 'ai').length },
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
              Real-time feed connected to Arc Testnet. Monitoring institutional flows and AI reasoning traces.
            </p>
          </div>
        </div>

        {/* Middle Column: Main Feed */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="font-headline-md text-headline-md">Alert Center</h1>
            <button 
              onClick={() => setLocalNotifications([])}
              className="text-primary font-label-caps text-label-caps hover:underline cursor-pointer"
            >
              Clear all
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
                    <a 
                      href={`https://explorer.testnet.arc.circle.com/tx/${item.txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-xs font-data-mono bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                        TX: {item.txHash.substring(0, 10)}...
                      </span>
                      <span className="material-symbols-outlined text-xs text-primary">
                        open_in_new
                      </span>
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            {filteredNotifications.length === 0 && (
              <div className="text-center py-12 bg-white border border-dashed border-outline-variant rounded-lg">
                <p className="text-on-surface-variant">No active alerts. Monitoring the network...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
