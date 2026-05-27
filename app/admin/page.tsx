"use client";

import React from "react";
import Link from "next/link";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useMarkets } from "@/lib/hooks/useMarkets";

const AUTHORIZED_ADDRESSES = [
  process.env.NEXT_PUBLIC_TEAM_MEMBER_1_ADDRESS?.toLowerCase(),
  process.env.NEXT_PUBLIC_TEAM_MEMBER_2_ADDRESS?.toLowerCase(),
  process.env.NEXT_PUBLIC_TEAM_MEMBER_3_ADDRESS?.toLowerCase(),
  process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS?.toLowerCase(),
].filter(Boolean);

const AdminStat = ({ label, value, change }: { label: string, value: string, change: string }) => (
  <div className="bg-white p-6 border border-outline-variant rounded-lg flex flex-col justify-between hover:shadow-md transition-all">
    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{label}</span>
    <div className="flex items-baseline gap-2 mt-2">
      <span className="font-headline-md text-headline-md">{value}</span>
      <span className="text-secondary font-label-caps text-label-caps flex items-center">
        <span className="material-symbols-outlined text-[14px]">arrow_upward</span> {change}
      </span>
    </div>
  </div>
);

const MarketItem = ({ title, status, volume }: { title: string, status: string, volume: string }) => (
  <div className="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors border-b border-outline-variant last:border-0">
    <div>
      <p className="font-body-md font-bold text-on-surface">{title}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-secondary' : 'bg-outline-variant'}`}></span>
        <span className="text-[11px] text-on-surface-variant uppercase font-label-caps">{status}</span>
      </div>
    </div>
    <div className="text-right">
      <p className="font-data-mono text-data-mono text-on-surface">{volume}</p>
      <p className="text-[11px] text-on-surface-variant uppercase font-label-caps text-[10px]">Volume</p>
    </div>
  </div>
);

export default function AdminDashboard() {
  const { isConnected, address, openModal } = useWallet();
  const { data: marketsData, isLoading } = useMarkets({ limit: 10 });
  const markets = marketsData?.markets ?? [];

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
              The Admin Control Center requires a secure wallet connection for institutional authentication.
            </p>
          </div>
          <button
            onClick={openModal}
            className="w-full bg-primary text-primary-foreground py-4 rounded-lg font-label-caps text-label-caps hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <span className="material-symbols-outlined">account_balance_wallet</span>
            CONNECT WALLET TO ACCESS
          </button>
        </div>
      </main>
    );
  }

  const isAuthorized = address && AUTHORIZED_ADDRESSES.includes(address.toLowerCase());

  if (!isAuthorized) {
    return (
      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="max-w-md w-full text-center space-y-6 bg-white p-10 rounded-xl border border-outline-variant shadow-sm">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-4xl">block</span>
          </div>
          <div className="space-y-2">
            <h2 className="font-headline-md text-headline-md">Access Denied</h2>
            <p className="text-on-surface-variant">
              Your wallet address is not authorized to access the Admin Control Center. This page is restricted to authorized team members only.
            </p>
            <p className="text-on-surface-variant text-sm mt-4 font-data-mono break-all">
              {address}
            </p>
          </div>
          <button
            onClick={openModal}
            className="w-full bg-outline text-on-outline py-4 rounded-lg font-label-caps text-label-caps hover:brightness-90 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <span className="material-symbols-outlined">swap_horiz</span>
            SWITCH WALLET
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow max-w-container-max-width mx-auto px-gutter py-12 w-full space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="space-y-2">
          <h1 className="font-display-lg text-display-lg text-primary text-4xl">Admin Control Center</h1>
          <p className="text-on-surface-variant font-body-lg text-body-lg">
            Monitor protocol health and manage institutional prediction markets.
          </p>
        </div>
        <Link 
          href="/admin/create" 
          className="bg-primary text-primary-foreground px-6 py-4 rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
        >
          <span className="material-symbols-outlined">add_circle</span>
          CREATE NEW MARKET
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <AdminStat label="Total Volume" value="$248.2M" change="14.2%" />
        <AdminStat label="Active Markets" value="124" change="4.1%" />
        <AdminStat label="Total Users" value="12.8k" change="8.4%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center">
              <h3 className="font-headline-sm text-headline-sm">Active Markets</h3>
              <button className="text-primary font-label-caps text-label-caps hover:underline">View All</button>
            </div>
            <div className="divide-y divide-outline-variant">
              {isLoading ? (
                <div className="p-8 text-center text-on-surface-variant animate-pulse">Loading markets...</div>
              ) : markets.length > 0 ? (
                markets.map((m) => (
                  <MarketItem 
                    key={m.id}
                    title={m.question} 
                    status={m.status === 'ACTIVE' ? 'Active' : 'Pending'} 
                    volume={`$${(m.totalLiquidity).toLocaleString()}`} 
                  />
                ))
              ) : (
                <div className="p-8 text-center text-on-surface-variant italic">No markets found. Deploy one to get started.</div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-highest border border-outline-variant p-6 rounded-xl space-y-4">
            <h3 className="font-headline-sm text-headline-sm">System Health</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Oracle Latency</span>
                <span className="font-data-mono text-secondary">14ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Node Consensus</span>
                <span className="font-data-mono text-secondary">100%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Queue Depth</span>
                <span className="font-data-mono text-on-surface">0.02%</span>
              </div>
            </div>
            <div className="pt-4">
              <div className="h-1 bg-outline-variant rounded-full overflow-hidden">
                <div className="h-full bg-secondary w-[99%]"></div>
              </div>
              <p className="text-[10px] text-on-surface-variant mt-2 font-label-caps">ALL SYSTEMS OPERATIONAL</p>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
