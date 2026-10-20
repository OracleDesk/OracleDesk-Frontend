"use client";
import { Icon } from "@/components/ui/icon";

import React, { useState } from "react";
import { DropdownMenu as DM } from "radix-ui";
import { useWalletActions, useWalletAddress, useWalletNetwork, useWalletSession } from "@/lib/contexts/WalletContext";
import { useAccountReserve, useEnableUsdc, useRpcNetwork, useUsdcBalance, useUsdcTrustline, useUsdcBalanceState } from "@/lib/hooks/useStellar";
import { NETWORK_LABEL, NETWORK_PASSPHRASE, TESTNET_PASSPHRASE, explorerAccount } from "@/lib/stellar/config";
import { PendingValue } from "@/components/pending-value";
import { DevProfiler } from "@/lib/dev/profiler";
import { formatUsdc, formatXlm, shortAddress } from "@/lib/stellar/units";

const WalletDropdownBody = () => {
  const { address, isConnected } = useWalletAddress();
  const { isWrongNetwork } = useWalletNetwork();
  const { isConnecting, error } = useWalletSession();
  const { openModal, disconnect } = useWalletActions();
  const [copied, setCopied] = useState(false);
  const balance = useUsdcBalance(address);
  const balanceState = useUsdcBalanceState(address);
  const trustline = useUsdcTrustline(address);
  const enableUsdc = useEnableUsdc();
  const reserve = useAccountReserve(address);
  const rpcNetwork = useRpcNetwork();

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => openModal()}
        disabled={isConnecting}
        title={error ?? undefined}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const truncatedAddress = shortAddress(address, 6, 4);
  const trustlineMissing = !isWrongNetwork && trustline.data?.kind === "missing";
  const unauthorized = trustline.data?.kind === "present" && !trustline.data.authorized;
  const balanceText = trustlineMissing
    ? "USDC not enabled"
    : balance.data !== undefined
    ? formatUsdc(balance.data, { maxDecimals: 2, minDecimals: 2, grouping: true })
    : balance.isError ? "—" : "…";
  const notActivated = !isWrongNetwork && reserve.data?.funded === false;
  const xlmText = reserve.data?.funded
    ? formatXlm(reserve.data.balance, { maxDecimals: 2, minDecimals: 2, grouping: true })
    : reserve.isError ? "—" : "…";
  const friendbotUrl =
    NETWORK_PASSPHRASE === TESTNET_PASSPHRASE && rpcNetwork.data?.friendbotUrl
      ? `${rpcNetwork.data.friendbotUrl}?addr=${encodeURIComponent(address)}`
      : null;

  const handleEnableUsdc = async () => {
    try {
      await enableUsdc.mutateAsync();
    } catch {
      // The mutation error is rendered in the wallet menu below.
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the address is still visible in the menu.
    }
  };

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          aria-label="Wallet menu"
          className="flex items-center gap-3 px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg hover:bg-surface-container transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <div className="flex flex-col items-end hidden sm:flex">
            <span className={`text-[10px] font-bold leading-none uppercase ${isWrongNetwork ? "text-error" : "text-on-surface-variant"}`}>
              {isWrongNetwork ? "Wrong network" : NETWORK_LABEL}
            </span>
            <span className="text-sm font-data-mono font-bold text-on-surface">
              {truncatedAddress}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Icon name="account_balance_wallet" className="text-[20px]" />
          </div>
          <Icon name="expand_more" className="text-on-surface-variant transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DM.Trigger>

      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={8}
          className="w-64 bg-white border border-outline-variant rounded-xl shadow-xl z-[100] overflow-hidden p-0 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none duration-150"
        >
          {/* Balance Section */}
          <DM.Label className="p-4 bg-surface-container-low border-b border-outline-variant block font-normal select-none">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">
              Available Balance
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-on-surface font-data-mono">
                {balanceText}<PendingValue state={balanceState.data} />
              </span>
              <span className="text-xs font-bold text-on-surface-variant uppercase">
                USDC
              </span>
            </div>
            {!isWrongNetwork && (
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-sm font-bold text-on-surface font-data-mono">{xlmText}</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase">XLM</span>
                <span className="ml-1 text-[10px] text-on-surface-variant">(fees and reserve)</span>
              </div>
            )}
            {notActivated && (
              <div role="status" className="mt-3 rounded-md border border-outline-variant bg-white p-2">
                <span className="block text-xs font-bold text-on-surface">Account not activated</span>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  This Stellar account needs a little XLM before it can trade. Fund it to continue.
                </p>
                {friendbotUrl && (
                  <a
                    href={friendbotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  >
                    Fund with Friendbot
                  </a>
                )}
              </div>
            )}
            {trustlineMissing && !isWrongNetwork && (
              <button
                type="button"
                onClick={handleEnableUsdc}
                disabled={enableUsdc.isPending}
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {enableUsdc.isPending ? "Enabling…" : "Enable USDC"}
              </button>
            )}
            {unauthorized && (
              <p className="mt-2 text-[11px] text-error">The issuer hasn&apos;t authorized your USDC trustline.</p>
            )}
            {enableUsdc.error && (
              <p className="mt-2 text-[11px] text-error">{enableUsdc.error.message}</p>
            )}
            {isWrongNetwork && (
              <p className="mt-2 text-[11px] text-error">Your wallet is on a different network. Switch it to Stellar Testnet.</p>
            )}
          </DM.Label>

          {/* Menu Items */}
          <div className="p-2 space-y-1">
            <DM.Item
              onSelect={(e) => {
                e.preventDefault();
                void copyAddress();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container focus:bg-surface-container rounded-lg transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon
                name={copied ? "check" : "content_copy"}
                className="text-on-surface-variant group-hover:text-primary group-focus:text-primary"
              />
              <div className="text-left">
                <span className="block text-sm font-bold text-on-surface">{copied ? "Copied" : "Copy address"}</span>
                <span className="block text-[10px] text-on-surface-variant font-data-mono">{truncatedAddress}</span>
              </div>
            </DM.Item>

            <DM.Item asChild className="outline-none">
              <a
                href={explorerAccount(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container focus:bg-surface-container rounded-lg transition-colors group cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="open_in_new" className="text-on-surface-variant group-hover:text-primary group-focus:text-primary" />
                <div className="text-left">
                  <span className="block text-sm font-bold text-on-surface">View on Stellar Expert</span>
                  <span className="block text-[10px] text-on-surface-variant uppercase">Account history</span>
                </div>
              </a>
            </DM.Item>

            <DM.Separator className="h-px bg-outline-variant my-1 mx-2" />

            <DM.Item
              onSelect={() => void disconnect()}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-error-container focus:bg-error-container text-on-surface hover:text-on-error-container focus:text-on-error-container rounded-lg transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-error"
            >
              <Icon name="logout" className="text-on-surface-variant group-hover:text-error group-focus:text-error" />
              <div className="text-left">
                <span className="block text-sm font-bold">Disconnect</span>
                <span className="block text-[10px] opacity-70 uppercase">Log out of session</span>
              </div>
            </DM.Item>
          </div>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
};

export default function WalletDropdown() {
  return (
    <DevProfiler id="wallet-dropdown">
      <WalletDropdownBody />
    </DevProfiler>
  );
}
