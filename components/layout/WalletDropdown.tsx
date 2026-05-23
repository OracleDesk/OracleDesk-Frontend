"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useDisconnect, useBalance } from "wagmi";

const WalletDropdown = () => {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch native balance
  const { data: balance } = useBalance({
    address: address as `0x${string}`,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) {
    return (
      <button
        onClick={() => open()}
        className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-all active:scale-95"
      >
        Connect Wallet
      </button>
    );
  }

  const truncatedAddress = `${address?.slice(0, 6)}...${address?.slice(-4)}`;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg hover:bg-surface-container transition-colors active:scale-95"
      >
        <div className="flex flex-col items-end hidden sm:flex">
          <span className="text-[10px] font-bold text-on-surface-variant leading-none uppercase">
            {caipNetwork?.name ?? "Unknown Network"}
          </span>
          <span className="text-sm font-data-mono font-bold text-on-surface">
            {truncatedAddress}
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
        </div>
        <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-64 bg-white border border-outline-variant rounded-xl shadow-xl z-[100] overflow-hidden"
          >
            {/* Balance Section */}
            <div className="p-4 bg-surface-container-low border-b border-outline-variant">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">
                Available Balance
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-on-surface font-data-mono">
                  {balance?.formatted.slice(0, 7) ?? "0.00"}
                </span>
                <span className="text-xs font-bold text-on-surface-variant uppercase">
                  {balance?.symbol}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  open({ view: "Networks" });
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container rounded-lg transition-colors group"
              >
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">
                  language
                </span>
                <div className="text-left">
                  <span className="block text-sm font-bold text-on-surface">Switch Network</span>
                  <span className="block text-[10px] text-on-surface-variant uppercase">Change chain</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  open({ view: "Account" });
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container rounded-lg transition-colors group"
              >
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">
                  account_circle
                </span>
                <div className="text-left">
                  <span className="block text-sm font-bold text-on-surface">Account Info</span>
                  <span className="block text-[10px] text-on-surface-variant uppercase">View settings</span>
                </div>
              </button>

              <div className="h-px bg-outline-variant my-2 mx-2"></div>

              <button
                onClick={() => {
                  setIsOpen(false);
                  disconnect();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-error-container text-on-surface hover:text-on-error-container rounded-lg transition-colors group"
              >
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-error">
                  logout
                </span>
                <div className="text-left">
                  <span className="block text-sm font-bold">Disconnect</span>
                  <span className="block text-[10px] opacity-70 uppercase">Log out of session</span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletDropdown;
