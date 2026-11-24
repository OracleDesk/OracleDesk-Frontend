"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
// Issue #229: lazy-load multisig review — only needed for multisig wallets
import dynamic from "next/dynamic";
const MultisigReview = dynamic(() => import("@/components/multisig-review").then((m) => ({ default: m.MultisigReview })), { ssr: false, loading: () => null });
import { PendingValue } from "@/components/pending-value";
import { SourceTag } from "@/components/ui/source-tag";
import { TxReview, shouldSkipTxReview } from "@/components/tx-review";
import { LiveRegion } from "@/components/ui/live-region";
import { quoteAnnouncement } from "@/lib/ui/quote-announcement";
import { parseOnChainMarketId, routes } from "@/lib/routes";
import { useHealth } from "@/lib/health/HealthProvider";
import {
  useAccountAuth,
  useAccountReserve,
  useBuy,
  useEnableUsdc,
  useExactBuyQuote,
  useLedgerNow,
  useMarketConfig,
  useOnChainMarket,
  usePosition,
  usePositionState,
  usePrepareBuy,
  usePrepareMultisig,
  useQuoteBuy,
  useUsdcBalance,
  useUsdcBalanceState,
  useUsdcIssuerVerification,
  useUsdcTrustline,
} from "@/lib/hooks/useStellar";
import { isMainnetPassphrase } from "@/lib/stellar/issuer-verification";
import { SafeText } from "@/components/safe-text";
import { useWalletActions, useWalletAddress, useWalletNetwork } from "@/lib/contexts/WalletContext";
import { useViewedAddress } from "@/lib/hooks/useViewedAddress";
import { useSettings } from "@/lib/settings/useSettings";
import { SigningCountdown } from "@/components/tx/signing-countdown";
import { explorerTx, NETWORK_LABEL } from "@/lib/stellar/config";
import { MIN_TX_TIMEOUT_S, SAFETY_MARGIN_S } from "@/lib/stellar/deadline";
import { isStale } from "@/lib/stellar/health";
import { useLedgerNow as useLedgerClock } from "@/lib/stellar/ledger-clock";
import { isMultisigAccount, MULTISIG_DEFAULT_SLIPPAGE_BPS, type MultisigSession } from "@/lib/stellar/multisig";
import type { ReviewModel } from "@/lib/stellar/tx-decode";
import type { TxPhase } from "@/lib/stellar/tx-lifecycle";
import { bpsToPercent, formatUsdc, formatXlm, maxIn, minOut, tryParseUsdc } from "@/lib/stellar/units";
import { userMessage } from "@/lib/errors/display";
import { messageFor } from "@/lib/errors/messages";
import { useBreaker } from "@/lib/hooks/useBreaker";
import { breakerLimits, checkBreakers, isCurrentBand, maxBuyWithinBreakers, priceMoveBps } from "@/lib/stellar/breaker";
import { Term } from "@/components/ui/term";
import { useFormErrors, ErrorSummary, FieldError } from "@/components/ui/form-errors";
import { mapErrorToField } from "@/lib/forms/error-map";

/** A chain read older than this must be refreshed before a trade is signed. */
const MARKET_STALE_AFTER_SEC = 60;

export interface BuyTicketProps {
  /** The on-chain market id, as a decimal string. */
  onChainMarketId: string;
  /** Which side the ticket is buying. */
  side: "Yes" | "No";
  /** Optional ref to amount input for focus management */
  amountInputRef?: React.RefObject<HTMLInputElement | null>;
}

export type BuyResultState = {
  kind: "pending" | "success" | "error";
  message: string;
  txHash?: string;
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function renderTxPhase(phase: TxPhase): string | null {
  switch (phase.name) {
    case "building":
      return null;
    case "simulating":
      return "Simulating transaction…";
    case "awaiting-signature":
      return "Waiting for your wallet…";
    case "submitting":
      return "Sending to the network…";
    case "pending":
      return "Waiting for a ledger…";
    case "confirmed":
      return "Transaction confirmed.";
    case "failed":
      return userMessage(phase.error);
    case "expired":
      return "Transaction expired without confirmation.";
  }
}

/**
 * The buy form of the quick-view modal.
 *
 * It owns the amount input, the quote and the trade itself, so typing in the
 * amount field re-renders this component and nothing else in the modal. The
 * wallet is read through the narrow context hooks, so a wallet change that
 * does not affect the trade does not re-render the ticket either.
 */
export function BuyTicket({ onChainMarketId, side, amountInputRef }: BuyTicketProps) {
  const { address, isConnected } = useWalletAddress();
  const { isWrongNetwork } = useWalletNetwork();
  const { openModal } = useWalletActions();
  const health = useHealth();

  // Saved in /settings; useSyncExternalStore makes it available before the
  // first visible quote even though pages are statically prerendered.
  const { settings } = useSettings(address);
  const slippageBps = settings.slippageBps;

  const { viewed, isWatching } = useViewedAddress();
  const activeHolder = viewed ?? address;
  const chain = useOnChainMarket(onChainMarketId);
  const view = chain.data;
  const position = usePosition(onChainMarketId, activeHolder);
  const balance = useUsdcBalance(activeHolder);
  const reserve = useAccountReserve(address);
  const positionState = usePositionState(onChainMarketId, activeHolder);
  const balanceState = useUsdcBalanceState(activeHolder);
  const config = useMarketConfig();
  const ledgerNow = useLedgerNow();
  const ledger = useLedgerClock();
  const trustline = useUsdcTrustline(address);
  const enableUsdc = useEnableUsdc();
  const issuerVerification = useUsdcIssuerVerification();
  const mainnet = isMainnetPassphrase();
  const issuerBlockedOnMainnet = mainnet && issuerVerification.data?.status !== "verified";
  const trustlineMissing = trustline.data?.kind === "missing";
  const trustlineUnauthorized = trustline.data?.kind === "present" && !trustline.data.authorized;
  const buy = useBuy();
  const accountAuth = useAccountAuth(address);
  const isMultisig = accountAuth.data ? isMultisigAccount(accountAuth.data) : false;
  const [multisigMode, setMultisigMode] = useState(false);
  const [multisigSession, setMultisigSession] = useState<MultisigSession | null>(null);
  const [multisigStatus, setMultisigStatus] = useState<string | null>(null);
  const prepareMultisig = usePrepareMultisig();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const [buyMode, setBuyMode] = useState<"usdc" | "shares">("usdc");
  const [amountInput, setAmountInput] = useState("10");
  const [buyResult, setBuyResult] = useState<BuyResultState | null>(null);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);

  const form = useFormErrors(["amount", "slippage"] as const);

  useEffect(() => {
    if (buyResult?.kind === "success") {
      resultContainerRef.current?.focus();
    }
  }, [buyResult]);

  const [reviewModel, setReviewModel] = useState<{ model: ReviewModel; changedFrom?: ReviewModel } | null>(null);
  const reviewResolver = useRef<((approved: boolean) => void) | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  // The review and multisig dialogs are portalled to <body>: the modal card
  // is animated, so a transformed ancestor would clip a `position: fixed`
  // overlay rendered inside it.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPortalReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountRaw = tryParseUsdc(amountInput);
  const debouncedAmount = useDebounced(amountRaw, 400);
  const exactQuote = useExactBuyQuote(onChainMarketId, side, buyMode === "shares" ? debouncedAmount : null);
  const spendRaw = buyMode === "shares" ? exactQuote.data?.collateralIn ?? null : amountRaw;
  const quote = useQuoteBuy(onChainMarketId, side, buyMode === "usdc" ? debouncedAmount : spendRaw);

  const breakerState = useBreaker(onChainMarketId);
  const breakerConfig = breakerState.data?.config ?? null;
  const band = breakerState.data?.band && ledger.now !== null && isCurrentBand(breakerState.data.band, ledger.now)
    ? breakerState.data.band
    : null;
  const breakerMarket = useMemo(() => view ? {
    reserveYes: view.market.reserve_yes,
    reserveNo: view.market.reserve_no,
    feeBps: BigInt(view.market.fee_bps),
  } : null, [view]);
  const breakerLimitsView = breakerLimits(breakerConfig);
  const breakerEnabled = breakerLimitsView.impactBps > 0n || breakerLimitsView.bandBps > 0n;
  const breakerVerdict = useMemo(() => {
    if (!breakerMarket || !spendRaw || spendRaw <= 0n) return null;
    return checkBreakers(breakerMarket, breakerConfig, band, side, { kind: "buy", collateralIn: spendRaw });
  }, [breakerMarket, breakerConfig, band, side, spendRaw]);
  const breakerCap = useMemo(() => {
    if (!breakerMarket || !breakerEnabled) return null;
    const balanceCap = balance.data ?? 0n;
    const cap = spendRaw && spendRaw > balanceCap ? spendRaw : balanceCap;
    return maxBuyWithinBreakers(breakerMarket, breakerConfig, band, side, cap);
  }, [breakerMarket, breakerConfig, band, side, spendRaw, balance.data, breakerEnabled]);
  const breakerMove = useMemo(() => {
    if (!breakerMarket || !spendRaw || spendRaw <= 0n) return null;
    return priceMoveBps(breakerMarket, side, { kind: "buy", collateralIn: spendRaw });
  }, [breakerMarket, side, spendRaw]);
  const breakerError = breakerVerdict && !breakerVerdict.ok
    ? messageFor(`contract.marketCore.${breakerVerdict.code}`)
    : null;

  const quoteAnnouncementText = useMemo(() => {
    return (
      quoteAnnouncement({
        side,
        amountRaw,
        debouncedAmount,
        quote: {
          data: quote.data,
          isSuccess: quote.isSuccess,
          isFetching: quote.isFetching,
        },
        slippageBps,
      }) ?? ""
    );
  }, [side, amountRaw, debouncedAmount, quote.data, quote.isSuccess, quote.isFetching, slippageBps]);

  const prepareBuy = usePrepareBuy({ marketId: onChainMarketId, outcome: side, collateralIn: spendRaw, slippageBps, holder: address });
  const fees = prepareBuy.data?.fees;
  const isUnfunded = reserve.data?.funded === false;
  const isInsufficientXlm = !!(reserve.data?.funded && fees && fees.totalFee > reserve.data.spendable);
  const xlmDeficit = reserve.data?.funded && fees && fees.totalFee > reserve.data.spendable ? fees.totalFee - reserve.data.spendable : 0n;

  const closeReview = useCallback((approved: boolean) => {
    setReviewModel(null);
    reviewResolver.current?.(approved);
    reviewResolver.current = null;
  }, []);
  const review = useCallback(async (_prepared: unknown, model: ReviewModel, changedFrom?: ReviewModel, force = false) => {
    if (!force && shouldSkipTxReview()) return true;
    setReviewModel({ model, changedFrom });
    return new Promise<boolean>(resolve => {
      reviewResolver.current = resolve;
    });
  }, []);
  useEffect(() => () => {
    reviewResolver.current?.(false);
  }, []);

  const chainStatus = view?.market.status;
  // Use a timer-backed timestamp so freshness changes are reflected without impure render reads.
  const secondsToClose = ledger.now !== null && view ? Number(view.market.close_time - BigInt(Math.floor(ledger.now))) : null;
  const safeToTrade = secondsToClose !== null && secondsToClose > SAFETY_MARGIN_S + MIN_TX_TIMEOUT_S;
  const isOpen = chainStatus?.tag === "Open" && Number(view?.market.close_time ?? 0) * 1000 > chain.dataUpdatedAt;
  const isFresh = (updatedAt: number, maxAge: number) => now !== null && now >= updatedAt && now - updatedAt <= maxAge;

  const handleBuy = async () => {
    if (!isConnected) {
      void openModal();
      return;
    }
    if (issuerBlockedOnMainnet) {
      setBuyResult({
        kind: "error",
        message: issuerVerification.data
          ? `Trading disabled on mainnet: ${issuerVerification.data.detail}`
          : "Trading disabled on mainnet until the USDC issuer is verified via stellar.toml.",
      });
      return;
    }
    if (trustlineMissing) {
      setBuyResult({ kind: "error", message: "Enable your USDC trustline below, then click Buy again." });
      return;
    }
    if (trustlineUnauthorized) {
      setBuyResult({ kind: "error", message: "The issuer hasn't authorized your USDC trustline." });
      return;
    }
    if (isWrongNetwork) {
      setBuyResult({ kind: "error", message: `Switch your wallet to ${NETWORK_LABEL} to place this trade.` });
      return;
    }
    const valid = form.attemptSubmit(() => {
      const errs: Partial<Record<"amount" | "slippage", string>> = {};
      if (!amountRaw || amountRaw <= 0n) {
        errs.amount = buyMode === "usdc" ? "Enter an amount like 10 or 2.5." : "Enter a share amount greater than zero.";
      }
      return errs;
    });
    if (!valid) return;
    if (breakerError) {
      setBuyResult({
        kind: "error",
        message: breakerCap !== null && breakerCap > 0n
          ? `${breakerError} Largest size that passes now is ${formatUsdc(breakerCap, { maxDecimals: 2 })} USDC. Split the order or wait for the next ledger.`
          : `${breakerError} Wait for the next ledger and try a smaller amount.`,
      });
      return;
    }


    if (ledger.now === null) {
      setBuyResult({ kind: "pending", message: "Checking market time…" });
      return;
    }
    if (!safeToTrade) {
      setBuyResult({ kind: "error", message: "This market closes too soon to safely place a trade." });
      return;
    }
    if (health.rpc.status === "down") {
      setBuyResult({ kind: "error", message: "Stellar RPC isn't responding; the trade can't be simulated." });
      return;
    }
    if (now !== null && view && isStale(chain.dataUpdatedAt, now, MARKET_STALE_AFTER_SEC)) {
      setBuyResult({ kind: "pending", message: "Refreshing the price before you trade…" });
      await chain.refetch();
    }
    setBuyResult(null);
    try {
      const result = await buy.mutateAsync({
        marketId: onChainMarketId,
        outcome: side,
        collateralIn: spendRaw ?? 0n,
        review,
        slippageBps,
        timing: settings.timing.mode,
        prepared: prepareBuy.data,
      });
      setBuyResult({
        kind: "success",
        message: `Bought ${formatUsdc(result.sharesOut, { maxDecimals: 2 })} ${side.toUpperCase()} shares.`,
        txHash: result.txHash,
      });
    } catch (err) {
      const mapped = mapErrorToField(err, {
        SlippageExceeded: "slippage",
        InsufficientBalance: "amount",
        InvalidAmount: "amount",
        "insufficient-balance": "amount",
      });
      if ("field" in mapped.target) {
        form.setErrors({ [mapped.target.field]: mapped.message });
      } else {
        form.setFormError(mapped.message);
      }
      setBuyResult({
        kind: "error",
        message: userMessage(err),
      });
    }
  };

  const handleEnableUsdc = async () => {
    setBuyResult({ kind: "pending", message: "Checking XLM reserve, then opening your wallet…" });
    try {
      await enableUsdc.mutateAsync();
      setBuyResult({
        kind: "success",
        message: "USDC is enabled. Review your amount and click Buy to submit the trade.",
      });
    } catch (err) {
      setBuyResult({
        kind: "error",
        message: userMessage(err),
      });
    }
  };

  const handlePrepareMultisig = async () => {
    if (!isConnected) {
      void openModal();
      return;
    }
    if (issuerBlockedOnMainnet) {
      setBuyResult({
        kind: "error",
        message: issuerVerification.data
          ? `Trading disabled on mainnet: ${issuerVerification.data.detail}`
          : "Trading disabled on mainnet until the USDC issuer is verified via stellar.toml.",
      });
      return;
    }
    if (isWrongNetwork) {
      setMultisigStatus(`Switch your wallet to ${NETWORK_LABEL} to prepare this trade.`);
      return;
    }
    if (!spendRaw || spendRaw <= 0n) {
      setMultisigStatus(buyMode === "usdc" ? "Enter an amount like 10 or 2.5." : "Enter a share amount greater than zero.");
      return;
    }
    if (buyMode === "shares") {
      setMultisigStatus("Multisig prepare currently supports USDC amounts. Switch to USDC and try again.");
      return;
    }
    setMultisigStatus(null);
    try {
      const session = await prepareMultisig.mutateAsync({
        kind: "buy",
        marketId: onChainMarketId,
        outcome: side,
        collateralIn: spendRaw,
        slippageBps: MULTISIG_DEFAULT_SLIPPAGE_BPS,
        sourceAccount: address ?? undefined,
        timeoutInSeconds: 3600,
      });
      setMultisigSession(session);
    } catch (err) {
      setMultisigStatus(err instanceof Error ? err.message : "Couldn't prepare the multisig transaction.");
    }
  };

  return (
    <div className="space-y-3">
      <ErrorSummary
        errors={form.errors}
        formError={form.formError}
        ids={form.ids}
        labels={{ amount: "Amount", slippage: "Slippage" }}
        summaryRef={form.summaryRef}
      />
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded border border-outline-variant p-0.5" role="group" aria-label="Buy amount unit">
          <button type="button" aria-pressed={buyMode === "usdc"} onClick={() => setBuyMode("usdc")} className={`px-2 py-1 text-[10px] rounded ${buyMode === "usdc" ? "bg-primary text-primary-foreground" : "text-on-surface-variant"}`}>USDC</button>
          <button type="button" aria-pressed={buyMode === "shares"} onClick={() => setBuyMode("shares")} className={`px-2 py-1 text-[10px] rounded ${buyMode === "shares" ? "bg-primary text-primary-foreground" : "text-on-surface-variant"}`}>Shares</button>
        </div>
        <label htmlFor={form.ids.amount.input} className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px] shrink-0">
          Amount ({buyMode === "usdc" ? "USDC" : `${side.toUpperCase()} shares`})
        </label>
        <div className="flex-1">
          <input
            ref={amountInputRef}
            id={form.ids.amount.input}
            inputMode="decimal"
            value={amountInput}
            aria-invalid={Boolean(form.errors.amount || (amountInput.trim() !== "" && amountRaw === null))}
            aria-describedby={form.ids.amount.error}
            onBlur={() => form.handleBlur("amount")}
            onChange={(e) => {
              setAmountInput(e.target.value);
              if (form.errors.amount) form.clearErrors();
            }}
            className="w-full bg-surface border border-outline-variant rounded p-2 font-data-mono text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <FieldError id={form.ids.amount.error} message={form.errors.amount} />
        </div>
        <button
          type="button"
          onClick={handleBuy}
          disabled={
            buy.isPending ||
            isWatching ||
            Boolean(breakerError) ||
            (isConnected && !isOpen) ||
            (isConnected && isUnfunded) ||
            (isConnected && isInsufficientXlm)
          }
          aria-describedby={isWatching ? "watching-trade-explanation" : undefined}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-label-caps text-label-caps font-bold disabled:opacity-50"
        >
          {isWatching
            ? "Watching. Connect your own wallet to trade."
            : !isConnected
            ? "Connect"
            : buy.isPending
            ? (buy.phase.name === "awaiting-signature" ? "Signing…" : "Buying…")
            : isUnfunded
            ? "Fund Account"
            : isInsufficientXlm
            ? "Insufficient XLM"
            : `Buy ${side.toUpperCase()}`}
        </button>
      </div>
      {buy.phase.name === "awaiting-signature" && buy.phase.deadline && (
        <SigningCountdown
          deadline={buy.phase.deadline}
          onNeedMoreTime={() => {
            buy.cancelSigning();
            setBuyResult({ kind: "pending", message: "Signature cancelled. Press Buy again to rebuild with a fresh deadline." });
          }}
        />
      )}
      {isWatching && (
        <p id="watching-trade-explanation" className="sr-only">
          You are viewing another address in watch-only mode. Connect your own wallet to trade.
        </p>
      )}
      <div className="flex justify-between text-[11px] font-data-mono text-on-surface-variant">
        <span>
          {amountRaw === null
            ? buyMode === "usdc" ? "Enter an amount like 10 or 2.5" : "Enter a share amount"
            : buyMode === "shares" && exactQuote.data
              ? `Costs ≈ ${formatUsdc(exactQuote.data.collateralIn, { maxDecimals: 2 })} USDC (fee ${formatUsdc(exactQuote.data.fee, { maxDecimals: 2 })}), at most ${formatUsdc(maxIn(exactQuote.data.collateralIn, slippageBps), { maxDecimals: 2 })} with ${bpsToPercent(slippageBps)} slippage`
              : buyMode === "shares" && exactQuote.error
                ? userMessage(exactQuote.error)
                : buyMode === "shares" && exactQuote.isFetching
                  ? "Quoting exact share amount…"
                  : quote.data !== undefined
              ? `≈ ${formatUsdc(quote.data, { maxDecimals: 2 })} shares, at least ${formatUsdc(minOut(quote.data, slippageBps), { maxDecimals: 2 })} (${bpsToPercent(slippageBps)} slippage)`
              : quote.error ? userMessage(quote.error) : quote.isFetching ? "Quoting…" : ""}
          <Link
            href={routes.learnFpmm({
              market: parseOnChainMarketId(onChainMarketId) ?? undefined,
              side,
              amount: amountRaw !== null ? String(amountRaw) : undefined,
              slippage: slippageBps,
            })}
            className="text-[10px] text-primary hover:underline ms-2 inline-flex items-center"
          >
            How is this calculated?
          </Link>
        </span>
        {balance.data !== undefined && <span>Balance {formatUsdc(balance.data, { maxDecimals: 2, grouping: true })}<PendingValue state={balanceState.data} /></span>}
      </div>

      {breakerEnabled && (
        <div className="rounded border border-outline-variant bg-surface-container-low p-2 text-[11px] font-data-mono text-on-surface-variant space-y-1">
          <div className="flex justify-between gap-2">
            <span>
              Breaker: impact ≤ {bpsToPercent(breakerLimitsView.impactBps, 0)} · band ≤ {bpsToPercent(breakerLimitsView.bandBps, 0)}
            </span>
            {breakerCap !== null && (
              <span>Max now {formatUsdc(breakerCap, { maxDecimals: 2, grouping: true })} USDC</span>
            )}
          </div>
          {breakerMove && (
            <div>Estimated move {bpsToPercent(breakerMove.moveBps)} {breakerVerdict?.ok === false ? `· limit ${bpsToPercent(breakerVerdict.limitBps)}` : ""}</div>
          )}
          {breakerError && <p className="text-error" role="alert">{breakerError} Split the order or wait for the next ledger.</p>}
          {breakerState.data?.band && !band && (
            <p>Band reference is from a previous ledger; it resets automatically at the next ledger.</p>
          )}
          {breakerConfig === null && <p>No per-market breaker is configured; contract checks are disabled for this market.</p>}
        </div>
      )}

      {/* Network fee & reserve row */}
      {isConnected && (
        <div
          className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant"
          title={fees ? `Inclusion: ${formatXlm(fees.inclusionFee)} XLM · Resource: ${formatXlm(fees.resourceFee)} XLM (assumes the network base reserve of 0.5 XLM)` : "assumes the network base reserve of 0.5 XLM"}
        >
          <span>
            Network fee {fees ? `≈ ${formatXlm(fees.totalFee)} XLM` : prepareBuy.isLoading ? "≈ calculating…" : "—"} ·{" "}
            {reserve.isLoading
              ? "checking XLM…"
              : reserve.isError
              ? "couldn't check XLM balance"
              : reserve.data && !reserve.data.funded
              ? "unfunded"
              : reserve.data
              ? `spendable ${formatXlm(reserve.data.spendable, { maxDecimals: 1 })} XLM`
              : "spendable —"}
          </span>
          {fees && (
            <span className="text-[10px] text-outline">
              (inclusion {formatXlm(fees.inclusionFee)} + resource {formatXlm(fees.resourceFee)})
            </span>
          )}
        </div>
      )}

      {/* Blocking warnings */}
      {isConnected && isUnfunded && (
        <p className="text-xs text-error font-medium" role="alert">
          Fund this account with XLM first.
        </p>
      )}
      {isConnected && isInsufficientXlm && xlmDeficit !== null && (
        <p className="text-xs text-error font-medium" role="alert">
          You need about {formatXlm(xlmDeficit)} more XLM to pay the network fee.
        </p>
      )}

      {!isOpen && view && (
        <p className="text-[11px] text-on-surface-variant">This market is closed to trading.</p>
      )}
      {ledger.now === null && <p className="text-[11px] text-on-surface-variant">Checking market time…</p>}
      {isOpen && !safeToTrade && <p className="text-[11px] text-on-surface-variant">Trading is disabled this close to the market deadline.</p>}
      {issuerVerification.data?.status === "verified" && (
        <p className="text-[11px] text-secondary">
          Verified USDC issuer:{" "}
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
        <p className={`text-[11px] ${mainnet ? "text-error font-medium" : "text-tertiary"}`} role="status">
          {mainnet
            ? `Mainnet trading & trustline blocked (${issuerVerification.data.status}): ${issuerVerification.data.detail}`
            : `Testnet warning — issuer ${issuerVerification.data.status}: ${issuerVerification.data.detail}`}
        </p>
      )}
      {trustlineMissing && !isWrongNetwork && !issuerBlockedOnMainnet && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-2">
          <p className="text-xs text-on-surface-variant">
            Enable USDC once to buy on Stellar. This creates a <Term id="trustline">trustline</Term> and locks one <Term id="base-reserve">base reserve</Term> (typically 0.5 <Term id="xlm">XLM</Term>); it does not submit your trade.
          </p>
          <button type="button" onClick={handleEnableUsdc} disabled={enableUsdc.isPending} className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
            {enableUsdc.isPending ? "Enabling…" : "Enable USDC"}
          </button>
        </div>
      )}
      {trustlineUnauthorized && <p className="text-[11px] text-error">The issuer hasn&apos;t authorized your USDC trustline.</p>}
      {position.data && (position.data.yes > 0n || position.data.no > 0n || positionState.data?.provisional || positionState.data?.awaitingRpc) && (
        <p className="text-[11px] font-data-mono text-on-surface">
          {isWatching ? "Watched position:" : "Your position:"} {formatUsdc(position.data.yes, { maxDecimals: 2 })} YES · {formatUsdc(position.data.no, { maxDecimals: 2 })} NO
          <PendingValue state={positionState.data} fallback={<SourceTag source="chain" ledger={view?.ledger} readAt={chain.dataUpdatedAt} />} />
        </p>
      )}

      {/* Live regions for polite quote updates and trade results */}
      <LiveRegion message={quoteAnnouncementText} />
      <LiveRegion message={buyResult?.message ?? ""} />

      {/* Observable tx lifecycle phase */}
      {buy.isPending && (
        <div className="text-xs text-on-surface-variant flex items-center gap-1.5" role="status">
          <span>{renderTxPhase(buy.phase) ?? "Processing transaction…"}</span>
          {"hash" in buy.phase && buy.phase.hash && (
            <a
              href={explorerTx(buy.phase.hash) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-data-mono"
            >
              View: {buy.phase.hash.slice(0, 8)}…
            </a>
          )}
        </div>
      )}

      {/* Status message */}
      {!buy.isPending && buyResult && (
        <div
          ref={resultContainerRef}
          tabIndex={-1}
          className="text-xs text-on-surface-variant break-all outline-none space-y-1"
          role="status"
        >
          <p>{buyResult.message}</p>
          {buyResult.kind === "success" && buyResult.txHash && (
            <div>
              <a
                href={explorerTx(buyResult.txHash) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-data-mono inline-block"
              >
                View transaction on Stellar Expert (opens in a new tab)
              </a>
            </div>
          )}
        </div>
      )}

      {/* Multisig path */}
      {isConnected && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={multisigMode}
              onChange={(e) => setMultisigMode(e.target.checked)}
            />
            Use multisig (export XDR for co-signers)
          </label>
          {accountAuth.isLoading && <p className="text-[11px] text-on-surface-variant">Checking multisig thresholds…</p>}
          {isMultisig && !multisigMode && (
            <p className="text-[11px] text-on-surface-variant">
              This account needs multiple signatures (medium threshold {accountAuth.data?.med}, {accountAuth.data?.signers.length} signers). For treasuries, use “Prepare for multisig”.
            </p>
          )}
          {(multisigMode || isMultisig) && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handlePrepareMultisig}
                disabled={prepareMultisig.isPending || !spendRaw || spendRaw <= 0n}
                className="bg-surface-container px-3 py-2 rounded-lg text-xs font-bold border border-outline-variant disabled:opacity-50"
              >
                {prepareMultisig.isPending ? "Preparing…" : "Prepare for multisig"}
              </button>
              <p className="text-[11px] text-on-surface-variant">
                Builds with a 1-hour window and 3% slippage. Quote is from the current ledger; the trade fails with SlippageExceeded (error 12) if the price moves further.
              </p>
              {multisigStatus && <p className="text-xs text-on-surface-variant" role="status">{multisigStatus}</p>}
            </div>
          )}
        </div>
      )}

      {portalReady && reviewModel && createPortal(
        <TxReview
          model={reviewModel.model}
          changedFrom={reviewModel.changedFrom}
          breaker={breakerEnabled ? {
            impactBps: breakerLimitsView.impactBps,
            bandBps: breakerLimitsView.bandBps,
            maxBuy: breakerCap,
            estimatedMoveBps: breakerMove?.moveBps ?? null,
            verdict: breakerVerdict,
          } : undefined}
          onConfirm={() => closeReview(true)}
          onCancel={() => closeReview(false)}
        />,
        document.body,
      )}
      {portalReady && multisigSession && createPortal(
        <MultisigReview
          session={multisigSession}
          onClose={() => setMultisigSession(null)}
          onUpdated={(next) => setMultisigSession(next)}
        />,
        document.body,
      )}
    </div>
  );
}
