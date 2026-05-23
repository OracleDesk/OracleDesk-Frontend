"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const WalletCard = ({ name, address, balance, active }: { name: string, address: string, balance: string, active?: boolean }) => (
  <div className={`bg-white border ${active ? 'border-primary' : 'border-outline-variant'} rounded p-4 flex items-center justify-between group hover:border-primary transition-colors cursor-pointer`}>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
        <span className="material-symbols-outlined text-primary">{name === 'Phantom' ? 'token' : 'account_balance_wallet'}</span>
      </div>
      <div>
        <div className="font-bold text-on-surface">{name}</div>
        <div className="text-[12px] text-on-surface-variant font-data-mono">{address}</div>
      </div>
    </div>
    <div className="flex flex-col items-end">
      <div className="font-data-mono text-on-surface">{balance}</div>
      <span className={`text-[10px] font-label-caps ${active ? 'text-secondary font-bold' : 'text-on-surface-variant'}`}>
        {active ? 'ACTIVE' : 'CONNECTED'}
      </span>
    </div>
  </div>
);

const TransactionRow = ({ type, icon, iconColor, asset, amount, amountColor, status, statusClass, date }: any) => (
  <tr className="zebra-stripe border-b border-outline-variant group transition-colors hover:bg-surface-container/40">
    <td className="px-4 py-4">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined ${iconColor} text-[18px]`}>{icon}</span>
        <span className="font-body-md text-on-surface">{type}</span>
      </div>
    </td>
    <td className="px-4 py-4 font-data-mono text-on-surface">{asset}</td>
    <td className={`px-4 py-4 font-data-mono font-bold ${amountColor}`}>{amount}</td>
    <td className="px-4 py-4">
      <span className={`${statusClass} text-[10px] px-2 py-0.5 rounded font-bold`}>{status}</span>
    </td>
    <td className="px-4 py-4 text-on-surface-variant text-[12px]">{date}</td>
    <td className="px-4 py-4 text-right">
      <a className="text-primary hover:underline font-label-caps text-[11px] inline-flex items-center gap-1" href="#">
        EXPLORER <span className="material-symbols-outlined text-[14px]">open_in_new</span>
      </a>
    </td>
  </tr>
);

export default function WalletsPage() {
  const [terminalLogs, setTerminalLogs] = useState([
    { time: "14:42:01", msg: "PING: Connection to Solana Mainnet verified via Phantom_Ext.", type: "default" },
    { time: "14:41:55", msg: "VALIDATE: USDC Balance sync initiated for 0x71C...4242", type: "default" },
    { time: "14:40:12", msg: "MEMPOOL: Transaction 0x82...a1f found in block #294,102,593", type: "default" },
    { time: "14:38:44", msg: "SUCCESS: Settlement of OracleDesk_Vault_02 finalized. Amount: 150,000.00 USDC", type: "success" },
    { time: "14:35:10", msg: "AUTH: Session token refreshed. Expiry in 43,200s.", type: "default" },
    { time: "14:32:00", msg: "ALERT: Volatility spike detected in Market: Election_2024_Main.", type: "default" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { hour12: false });
      const newLogs = [
        { time, msg: `SYNC: Asset prices updated from 8 oracle sources.`, type: "default" },
        { time, msg: `HEARTBEAT: Ledger connectivity verified.`, type: "default" },
        { time, msg: `EVENT: New USDC deposit detected in cold storage vault.`, type: "success" }
      ];
      const randomLog = newLogs[Math.floor(Math.random() * newLogs.length)];
      setTerminalLogs(prev => [...prev.slice(-10), randomLog]);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="flex-grow pt-8 pb-12 max-w-container-max-width mx-auto px-gutter w-full">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface mb-1">Portfolio & Assets</h1>
          <p className="text-on-surface-variant font-body-md">Manage institutional-grade liquidity and multi-chain wallet connections.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-surface-container-high text-primary px-6 py-2.5 rounded font-label-caps text-label-caps hover:bg-surface-variant transition-colors border border-outline-variant">
            WITHDRAW USDC
          </button>
          <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded font-label-caps text-label-caps hover:brightness-110 active:opacity-80 transition-all shadow-sm">
            DEPOSIT USDC
          </button>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Total Balance Card */}
        <div className="col-span-12 lg:col-span-4 bg-white border border-outline-variant rounded p-6 flex flex-col justify-between h-64 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-caps text-label-caps text-on-surface-variant">TOTAL EQUITY</span>
              <span className="text-secondary font-data-mono flex items-center gap-1 font-bold">
                <span className="material-symbols-outlined text-[16px]">trending_up</span> +2.4%
              </span>
            </div>
            <div className="font-display-lg text-display-lg text-on-surface tracking-tight text-4xl">
              $1,248,392.<span className="text-on-surface-variant opacity-50">45</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              <span className="text-on-surface-variant font-body-md">1,248,392.45 USDC</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 h-1 bg-secondary rounded-full"></div>
            <div className="w-1/4 h-1 bg-surface-variant rounded-full"></div>
            <div className="w-1/8 h-1 bg-outline-variant rounded-full"></div>
          </div>
        </div>

        {/* Balance Chart Card */}
        <div className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded p-6 h-64 relative overflow-hidden shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span className="font-label-caps text-label-caps text-on-surface-variant">USDC PERFORMANCE (30D)</span>
            <div className="flex gap-4 text-label-caps font-label-caps text-on-surface-variant">
              <button className="hover:text-primary transition-colors">1D</button>
              <button className="hover:text-primary transition-colors">1W</button>
              <button className="text-primary font-bold">1M</button>
              <button className="hover:text-primary transition-colors">ALL</button>
            </div>
          </div>
          <div className="w-full h-32 mt-4 flex items-end gap-1 px-2">
            {[40, 45, 42, 55, 65, 60, 70, 85, 90, 88, 92, 95, 100].map((h, i) => (
              <div 
                key={i} 
                className={`flex-1 ${i === 8 ? 'bg-primary' : 'bg-surface-container'} rounded-t-sm hover:bg-primary-container transition-all cursor-pointer`}
                style={{ height: `${h}%` }}
              ></div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-label-caps text-outline">
            <span>OCT 01</span>
            <span>OCT 15</span>
            <span>OCT 31</span>
          </div>
        </div>

        {/* Wallet Connections */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Connected Wallets</h3>
          <WalletCard name="MetaMask" address="0x71C...4242" balance="$842,000.00" active />
          <WalletCard name="Phantom" address="D5rX...kP9z" balance="$406,392.45" />
          <button className="w-full py-3 border-2 border-dashed border-outline-variant rounded text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span> ADD NEW WALLET
          </button>
        </div>

        {/* Transaction History Table */}
        <div className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded overflow-hidden shadow-sm">
          <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Transaction History</h3>
            <div className="flex gap-2">
              <button className="material-symbols-outlined p-1 text-on-surface-variant hover:text-primary transition-colors">filter_list</button>
              <button className="material-symbols-outlined p-1 text-on-surface-variant hover:text-primary transition-colors">download</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface text-on-surface-variant font-label-caps text-[11px] border-b border-outline-variant uppercase tracking-wider">
                  <th className="px-4 py-3 font-bold">TYPE</th>
                  <th className="px-4 py-3 font-bold">ASSET</th>
                  <th className="px-4 py-3 font-bold">AMOUNT</th>
                  <th className="px-4 py-3 font-bold">STATUS</th>
                  <th className="px-4 py-3 font-bold">DATE</th>
                  <th className="px-4 py-3 font-bold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="font-body-md">
                <TransactionRow 
                  type="Deposit" icon="south_west" iconColor="text-secondary"
                  asset="USDC" amount="+150,000.00" amountColor="text-secondary"
                  status="COMPLETED" statusClass="bg-secondary-container text-on-secondary-container"
                  date="Oct 28, 14:22"
                />
                <TransactionRow 
                  type="Market Buy" icon="north_east" iconColor="text-tertiary"
                  asset="POLITICS/YES" amount="-12,450.00" amountColor="text-tertiary"
                  status="COMPLETED" statusClass="bg-secondary-container text-on-secondary-container"
                  date="Oct 27, 09:15"
                />
                <TransactionRow 
                  type="Withdraw" icon="swap_horiz" iconColor="text-primary"
                  asset="USDC" amount="-50,000.00" amountColor="text-on-surface-variant"
                  status="PENDING" statusClass="bg-surface-container-highest text-on-surface-variant"
                  date="Oct 26, 18:40"
                />
                <TransactionRow 
                  type="Reward Claim" icon="payments" iconColor="text-secondary"
                  asset="USDC" amount="+2,105.12" amountColor="text-secondary"
                  status="COMPLETED" statusClass="bg-secondary-container text-on-secondary-container"
                  date="Oct 25, 11:02"
                />
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-white border-t border-outline-variant flex items-center justify-center gap-4">
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary disabled:opacity-30 cursor-pointer" disabled>chevron_left</button>
            <span className="text-label-caps font-bold font-label-caps text-[11px]">PAGE 1 OF 12</span>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">chevron_right</button>
          </div>
        </div>
      </div>
    </main>
  );
}
