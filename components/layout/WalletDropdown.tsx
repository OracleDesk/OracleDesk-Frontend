"use client";
import { Icon } from "@/components/ui/icon";

import React, { useState } from "react";
import { DropdownMenu as DM } from "radix-ui";
import { useWalletActions, useWalletAddress, useWalletNetwork, useWalletSession } from "@/lib/contexts/WalletContext";
import { useViewedAddress } from "@/lib/hooks/useViewedAddress";
import { useAccountReserve, useEnableUsdc, useRpcNetwork, useUsdcBalance, useUsdcIssuerVerification, useUsdcTrustline, useUsdcBalanceState } from "@/lib/hooks/useStellar";
import { isMainnetPassphrase } from "@/lib/stellar/issuer-verification";
import { SafeText } from "@/components/safe-text";
import { NETWORK_LABEL, NETWORK_PASSPHRASE, TESTNET_PASSPHRASE, explorerAccount } from "@/lib/stellar/config";
import { PendingValue } from "@/components/pending-value";
import { DevProfiler } from "@/lib/dev/profiler";
import { formatUsdc, formatXlm, shortAddress } from "@/lib/stellar/units";
import { AddressText } from "@/components/ui/address-text";
import { LiveRegion } from "@/components/ui/live-region";
import { useTranslations } from "@/lib/i18n/provider";

const WalletDropdownBody = () => {
  const t = useTranslations();
  const { address, isConnected } = useWalletAddress();
  const { isWrongNetwork, walletNetwork, confirmUnknownNetwork } = useWalletNetwork();
  const { isConnecting, error, authStep, powProgress } = useWalletSession();
  const { openModal, disconnect } = useWalletActions();
  const { isWatching, viewed, clearWatch } = useViewedAddress();
  const [copied, setCopied] = useState(false);
  const balance = useUsdcBalance(address);
  const balanceState = useUsdcBalanceState(address);
  const trustline = useUsdcTrustline(address);
  const enableUsdc = useEnableUsdc();
  const issuerVerification = useUsdcIssuerVerification();
  const mainnet = isMainnetPassphrase();
  const issuerBlockedOnMainnet = mainnet && issuerVerification.data?.status !== "verified";
  const reserve = useAccountReserve(address);
  const rpcNetwork = useRpcNetwork();

  if (authStep === "pow") {
    const percent = Math.round((powProgress ?? 0) * 100);
    const message = t("wallet.verifying", { percent });
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg">
        <LiveRegion message={t("wallet.verifyingStatus")} />
        <span className="text-xs font-mono font-medium text-on-surface flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {message}
        </span>
        <button
          type="button"
          onClick={() => void disconnect()}
          aria-label={t("wallet.cancelVerification")}
          className="text-xs text-on-surface-variant hover:text-primary underline px-1.5 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          {t("wallet.cancel")}
        </button>
      </div>
    );
  }

  if (!isConnected || !address) {
    if (isWatching && viewed) {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => clearWatch()}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-xs font-bold text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {t("wallet.stopWatching")}
          </button>
          <button
            onClick={() => openModal()}
            disabled={isConnecting}
            title={error ?? undefined}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {isConnecting ? t("wallet.connecting") : t("wallet.connect")}
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => openModal()}
        disabled={isConnecting}
        title={error ?? undefined}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {isConnecting ? t("wallet.connecting") : t("wallet.connect")}
      </button>
    );
  }

  const trustlineMissing = !isWrongNetwork && trustline.data?.kind === "missing";
  const unauthorized = trustline.data?.kind === "present" && !trustline.data.authorized;
  const balanceText = trustlineMissing
    ? t("wallet.usdcNotEnabled")
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
          aria-label={t("wallet.menu")}
          className="flex items-center gap-3 px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-lg hover:bg-surface-container transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <div className="flex flex-col items-end hidden sm:flex">
            <span className={`text-[10px] font-bold leading-none uppercase ${isWrongNetwork ? "text-error" : "text-on-surface-variant"}`}>
              {isWrongNetwork ? t("wallet.wrongNetwork") : walletNetwork?.state === "unknown" ? t("wallet.networkUnknown") : NETWORK_LABEL}
            </span>
            <span className="text-sm font-data-mono font-bold text-on-surface">
              <AddressText address={address} compact />
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
              {t("wallet.availableBalance")}
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
                <span className="ms-1 text-[10px] text-on-surface-variant">{t("wallet.feesAndReserve")}</span>
              </div>
            )}
            {notActivated && (
              <div role="status" className="mt-3 rounded-md border border-outline-variant bg-white p-2">
                <span className="block text-xs font-bold text-on-surface">{t("wallet.notActivated")}</span>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  {t("wallet.notActivatedHelp")}
                </p>
                {friendbotUrl && (
                  <a
                    href={friendbotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  >
                    {t("wallet.fundFriendbot")}
                  </a>
                )}
              </div>
            )}
            {issuerVerification.data?.status === "verified" && (
              <p className="mt-1.5 text-[11px] text-secondary">
                Issuer verified:{" "}
                <SafeText
                  text={issuerVerification.data.orgName || issuerVerification.data.homeDomain}
                  truncate={60}
                  showToggle={false}
                />
                {issuerVerification.data.orgName && (
                  <> (<SafeText text={issuerVerification.data.homeDomain} truncate={50} showToggle={false} />)</>
                )}
              </p>
            )}
            {issuerVerification.data && issuerVerification.data.status !== "verified" && (
              <p className={`mt-1.5 text-[11px] ${mainnet ? "text-error" : "text-tertiary"}`} role="status">
                {mainnet
                  ? `Mainnet issuer verification failed (${issuerVerification.data.status}): ${issuerVerification.data.detail}`
                  : `Testnet warning — issuer ${issuerVerification.data.status}: ${issuerVerification.data.detail}`}
              </p>
            )}
            {trustlineMissing && !isWrongNetwork && !issuerBlockedOnMainnet && (
              <button
                type="button"
                onClick={handleEnableUsdc}
                disabled={enableUsdc.isPending}
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {enableUsdc.isPending ? t("wallet.enablingUsdc") : t("wallet.enableUsdc")}
              </button>
            )}
            {unauthorized && (
              <p className="mt-2 text-[11px] text-error">{t("wallet.trustlineUnauthorized")}</p>
            )}
            {enableUsdc.error && (
              <p className="mt-2 text-[11px] text-error">{enableUsdc.error.message}</p>
            )}
            {isWrongNetwork && (
              <p className="mt-2 text-[11px] text-error">{t("wallet.switchNetwork", { network: NETWORK_LABEL })}</p>
            )}
            {walletNetwork?.state === "unknown" && (
              <div className="mt-2 text-xs">
                <p>{t("wallet.networkUnknownDetail", { confirmed: String(walletNetwork.confirmedByUser) })}</p>
                {!walletNetwork.confirmedByUser && <button type="button" onClick={confirmUnknownNetwork} className="mt-2 rounded bg-primary px-3 py-2 text-primary-foreground">{t("wallet.confirmNetwork", { network: NETWORK_LABEL })}</button>}
              </div>
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
              <div className="text-start">
                <span className="block text-sm font-bold text-on-surface">{copied ? t("wallet.copied") : t("wallet.copyAddress")}</span>
                <span className="block text-[10px] text-on-surface-variant font-data-mono">{shortAddress(address)}</span>
              </div>
            </DM.Item>

            <DM.Item asChild className="outline-none">
              <a
                href={explorerAccount(address) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container focus:bg-surface-container rounded-lg transition-colors group cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="open_in_new" className="text-on-surface-variant group-hover:text-primary group-focus:text-primary" />
                <div className="text-start">
                  <span className="block text-sm font-bold text-on-surface">{t("wallet.viewExplorer")}</span>
                  <span className="block text-[10px] text-on-surface-variant uppercase">{t("wallet.accountHistory")}</span>
                </div>
              </a>
            </DM.Item>

            {isWatching && viewed && (
              <DM.Item
                onSelect={() => clearWatch()}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container focus:bg-surface-container rounded-lg transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="visibility_off" className="text-on-surface-variant group-hover:text-primary group-focus:text-primary" />
                <div className="text-start">
                  <span className="block text-sm font-bold text-on-surface">{t("wallet.stopWatching")}</span>
                  <span className="block text-[10px] text-on-surface-variant font-data-mono">
                    {t("wallet.viewing")} <AddressText address={viewed} compact />
                  </span>
                </div>
              </DM.Item>
            )}

            <DM.Separator className="h-px bg-outline-variant my-1 mx-2" />

            <DM.Item
              onSelect={() => void disconnect()}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-error-container focus:bg-error-container text-on-surface hover:text-on-error-container focus:text-on-error-container rounded-lg transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-error"
            >
              <Icon name="logout" className="text-on-surface-variant group-hover:text-error group-focus:text-error" />
              <div className="text-start">
                <span className="block text-sm font-bold">{t("wallet.disconnect")}</span>
                <span className="block text-[10px] opacity-70 uppercase">{t("wallet.logOut")}</span>
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
