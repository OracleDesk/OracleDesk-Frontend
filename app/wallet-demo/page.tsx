"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function WalletDemoPage() {
  const [isWalletOpen, setIsWalletOpen] = useState(true);

  const toggleWallet = () => setIsWalletOpen(!isWalletOpen);
  const closeWallet = () => setIsWalletOpen(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWallet();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased overflow-x-hidden">
      {/* Header / Shell Top Bar */}
      <header className="bg-surface dark:bg-on-background border-b border-outline-variant dark:border-outline h-16 fixed top-0 w-full z-50">
        <div className="flex justify-between items-center w-full h-16 px-gutter max-w-container-max-width mx-auto">
          <div className="flex items-center gap-8">
            <span className="font-headline-md text-headline-md font-bold text-on-surface dark:text-surface-bright">OracleDesk</span>
            <nav className="hidden md:flex items-center gap-6">
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium hover:text-primary transition-colors duration-200 cursor-pointer" href="#">Markets</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium hover:text-primary transition-colors duration-200 cursor-pointer" href="#">Reasoning</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium hover:text-primary transition-colors duration-200 cursor-pointer" href="#">Portfolio</Link>
              <Link className="text-on-surface-variant dark:text-surface-variant font-medium hover:text-primary transition-colors duration-200 cursor-pointer" href="#">Stats</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleWallet}
              className="bg-primary text-on-primary px-3 sm:px-4 py-2 rounded-lg font-label-caps text-[10px] sm:text-label-caps flex items-center gap-2 cursor-pointer active:opacity-80 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
              <span className="hidden xs:inline">0x...4f2a</span>
              <span className="xs:hidden">Wallet</span>
            </button>
            <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hidden sm:inline">notifications</span>
          </div>
        </div>
      </header>

      {/* Main Content Canvas (Blurred when Modal is open) */}
      <main className={`pt-24 px-gutter max-w-container-max-width mx-auto min-h-screen transition-all duration-300 ${isWalletOpen ? 'blur-[2px] pointer-events-none' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 opacity-40 select-none">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-outline-variant p-6 rounded-xl">
              <div className="h-4 w-32 bg-surface-container rounded mb-4"></div>
              <div className="h-48 sm:h-64 w-full bg-surface-container-low rounded"></div>
            </div>
            <div className="bg-white border border-outline-variant p-6 rounded-xl">
              <div className="h-4 w-48 bg-surface-container rounded mb-4"></div>
              <div className="space-y-3">
                <div className="h-12 w-full bg-surface-container-low rounded"></div>
                <div className="h-12 w-full bg-surface-container-low rounded"></div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-outline-variant p-6 rounded-xl">
            <div className="h-4 w-24 bg-surface-container rounded mb-4"></div>
            <div className="h-64 lg:h-96 w-full bg-surface-container-low rounded"></div>
          </div>
        </div>
      </main>

      {/* Wallet Dropdown Overlay */}
      {isWalletOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end items-start pt-16 transition-all duration-300">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-on-background/10 backdrop-blur-[2px]" onClick={closeWallet}></div>
          
          {/* Modal Content */}
          <div className="relative mt-2 mx-4 sm:mr-12 w-full max-w-[320px] bg-white border border-outline-variant rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
            {/* Account Section */}
            <div className="p-4 border-b border-outline-variant bg-surface-container-low/30">
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Connected Wallet</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary-container/20 text-on-secondary-container font-label-caps text-[10px] uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  Ethereum
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white overflow-hidden shadow-inner flex-shrink-0">
                  <img alt="Avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCXI1Xqt4iwfqA52Q0K_w0do0Qu1k89grhiN5Srq2MjRZrFZnMTMXUDpaKaFkULK9q3_EwCKkttdwf6UhmNmk-KhUzBb75y_9sTwoudaABcHhPklP48VeRDszIN6lLMN9FctrXVCerjOuZU5FzJGP2jTJox8PDu1ruJKJdEYEnpsFTkWEUWtmT2vlUQjIIhdb1LOfIH7h3zABDDNAuEcXf5EX4ABSlqGAif1FsPWL6ybUqLZAGYcaV58bB8ov2EHTUrJZbThCdxsw"/>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-data-mono text-data-mono text-on-surface truncate">0x742...f42a</span>
                    <button className="hover:text-primary transition-colors flex-shrink-0">
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                  </div>
                  <span className="text-on-surface-variant text-[11px] font-medium truncate">Standard Wallet (EVM)</span>
                </div>
              </div>
            </div>

            {/* Balances Section */}
            <div className="p-4 space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]">monetization_on</span>
                    </div>
                    <span className="font-medium text-on-surface">USDC</span>
                  </div>
                  <div className="text-right">
                    <div className="font-data-mono text-on-surface text-sm sm:text-base">12,450.00</div>
                    <div className="text-[10px] text-on-surface-variant font-label-caps">$12,450.00</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]">diamond</span>
                    </div>
                    <span className="font-medium text-on-surface">ETH</span>
                  </div>
                  <div className="text-right">
                    <div className="font-data-mono text-on-surface text-sm sm:text-base">4.284</div>
                    <div className="text-[10px] text-on-surface-variant font-label-caps">$10,367.28</div>
                  </div>
                </div>
              </div>

              {/* Network Switcher */}
              <div className="pt-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2">Switch Network</span>
                <div className="grid grid-cols-2 gap-2">
                  <button className="flex items-center gap-2 p-2 rounded border border-primary bg-primary-container/10 text-primary transition-all">
                    <span className="material-symbols-outlined text-[16px]">hub</span>
                    <span className="text-[11px] font-bold">Ethereum</span>
                  </button>
                  <button className="flex items-center gap-2 p-2 rounded border border-outline-variant hover:border-primary transition-all text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px]">layers</span>
                    <span className="text-[11px] font-medium">Arbitrum</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Actions Section */}
            <div className="p-4 bg-surface-container-lowest border-t border-outline-variant mt-auto">
              <div className="flex flex-col gap-1">
                <Link className="flex items-center justify-between p-2 rounded hover:bg-surface-container transition-colors group" href="#">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">history</span>
                    <span className="text-body-md font-medium">History</span>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
                </Link>
                <Link className="flex items-center justify-between p-2 rounded hover:bg-surface-container transition-colors group" href="#">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">settings</span>
                    <span className="text-body-md font-medium">Settings</span>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
                </Link>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 bg-surface border border-outline-variant hover:bg-error-container/10 hover:border-error hover:text-error transition-all py-2 rounded font-label-caps text-label-caps flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Disconnect
                </button>
              </div>
            </div>

            {/* AI Reasoning Indicator (Subtle) */}
            <div className="px-4 py-2 bg-primary-container text-on-primary-container flex items-center justify-center gap-2 text-[10px] font-medium tracking-wide">
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              SECURE TRADING TERMINAL ACTIVE
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-surface-container-low dark:bg-on-background border-t border-outline-variant dark:border-outline fixed bottom-0 w-full z-40">
        <div className="flex flex-col md:flex-row justify-between items-center w-full py-4 px-gutter max-w-container-max-width mx-auto gap-4">
          <span className="font-label-caps text-label-caps font-black text-on-surface-variant">ORACLE DESK</span>
          <div className="flex gap-6">
            <Link className="text-on-surface-variant dark:text-surface-variant font-body-md text-body-md hover:text-primary transition-colors" href="#">System Status</Link>
            <Link className="text-on-surface-variant dark:text-surface-variant font-body-md text-body-md hover:text-primary transition-colors" href="#">Legal</Link>
          </div>
          <span className="text-on-surface-variant dark:text-surface-variant font-body-md text-body-md hidden sm:inline">© 2026 OracleDesk Institutional.</span>
        </div>
      </footer>
    </div>
  );
}
