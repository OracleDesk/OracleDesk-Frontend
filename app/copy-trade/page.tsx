"use client";
import { Icon } from "@/components/ui/icon";

import { SigningIdentities, TxReview, TxReviewPreferenceControl, shouldSkipTxReview } from "@/components/tx-review";
import type { ReviewModel } from "@/lib/stellar/tx-decode";
import { useSubmitQueueState } from "@/lib/stellar/submit-queue";
import { useFormErrors, ErrorSummary, FieldError, FormStatus } from "@/components/ui/form-errors";
import { mapErrorToField } from "@/lib/forms/error-map";
import { Term } from "@/components/ui/term";


import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWalletActions, useWalletAddress, useWalletNetwork } from "@/lib/contexts/WalletContext";
import { DevProfiler } from "@/lib/dev/profiler";
import { useTrace } from "@/lib/hooks/useTraces";
import { useViewedAddress } from "@/lib/hooks/useViewedAddress";
import { useCopyTrade } from "@/lib/hooks/useCopyTrade";
import { PendingCopyTrades } from "@/components/copy-trade/PendingCopyTrades";
import { ApiError } from "@/lib/api/client";
import { userMessage } from "@/lib/errors/display";
import { useMarket } from "@/lib/hooks/useMarkets";
import { useQuoteBuy, useUsdcBalance, useAccountReserve, usePrepareBuy, useOnChainMarket, fetchOnChainMarketBySimulation, useUsdcTrustline, useEnableUsdc, useUsdcBalanceState, type PreparedWriteReview } from "@/lib/hooks/useStellar";
import { explorerTx, NETWORK_LABEL } from "@/lib/stellar/config";
import { parseCopyTradeParams, routes } from "@/lib/routes";
import { formatXlm, minOut, probabilityToBps, BPS } from "@/lib/stellar/units";
import { useFormat, type Formatters } from "@/lib/format/useFormat";
import { useTranslations } from "@/lib/i18n/provider";
import { chooseCollateral, maxCollateralForEdge, quoteCopy, type CopyMarket, type CopyQuote, type SizingMode } from "@/lib/stellar/quote";
import type { OutcomeTag } from "@/lib/stellar/clients";
import { TxPhase } from "@/lib/stellar/tx-lifecycle";

/** Wait this long after the slider stops before asking for a new quote. */
import { getLedgerNow, useLedgerNow } from "@/lib/stellar/ledger-clock";
import { MIN_TX_TIMEOUT_S, SAFETY_MARGIN_S } from "@/lib/stellar/deadline";
import { PendingValue } from "@/components/pending-value";
import { SLIPPAGE_PRESET_BPS } from "@/lib/settings/settings";
import { useSettings } from "@/lib/settings/useSettings";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveRegion } from "@/components/ui/live-region";
import { useDirection } from "@/components/layout/DirectionProvider";
import { Ltr } from "@/components/ui/ltr";
import Link from "next/link";
import { BpsSlider } from "@/components/ui/slider";
import { SlippagePicker } from "@/components/ui/slippage-picker";
import { amountForBps, bpsForAmount } from "@/lib/format/allocation";
const QUOTE_DEBOUNCE_MS = 400;
/** Below this remaining edge (1 point) the user must tick a box before copying. */
const MIN_EDGE_WARN_BPS = 100n;

const SIZING_OPTIONS = [
  { kind: "percent", label: "% of balance" },
  { kind: "fixed", label: "Fixed USDC" },
  { kind: "mirror", label: "Mirror agent" },
] as const;
type SizingKind = (typeof SIZING_OPTIONS)[number]["kind"];

function copyMarketOf(market: { reserve_yes: bigint; reserve_no: bigint; fee_bps: number | bigint; sets_minted: bigint }): CopyMarket {
  return { reserveYes: market.reserve_yes, reserveNo: market.reserve_no, feeBps: BigInt(market.fee_bps), setsMinted: market.sets_minted };
}

/** The agent's probability as bps, or null when the backend sent something out of range. */
function estimateToBps(probability: number): bigint | null {
  try {
    return probabilityToBps(probability);
  } catch {
    return null;
  }
}

function tryQuoteCopy(
  market: CopyMarket | null,
  side: OutcomeTag | null,
  amount: bigint | null,
  estimateYesBps: bigint | null,
): CopyQuote | null {
  if (!market || !side || amount === null || amount <= 0n || estimateYesBps === null) return null;
  try {
    return quoteCopy(market, side, amount, estimateYesBps);
  } catch {
    return null;
  }
}

const formatEdge = (bps: bigint, fmt: Formatters) => `${bps >= 0n ? "+" : ""}${fmt.points(bps)} pts`;

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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function CopyTradeContent() {
  const { address, isConnected } = useWalletAddress();
  const { isWrongNetwork } = useWalletNetwork();
  const { openModal, ensureSession } = useWalletActions();
  const searchParams = useSearchParams();
  const router = useRouter();

  const parsedParams = parseCopyTradeParams(searchParams);
  const traceId = parsedParams.ok ? parsedParams.traceId : null;
  const marketIdParam = parsedParams.ok ? parsedParams.marketId : null;
  const invalidTraceLink = !parsedParams.ok && parsedParams.invalid.includes("traceId");

  const traceQuery = useTrace(traceId ?? undefined);
  const trace = traceQuery.data ?? null;
  const traceError = invalidTraceLink
    ? "This link has an invalid trace id."
    : traceQuery.isError ? "We couldn't load this reasoning trace." : null;
  const { data: market } = useMarket(marketIdParam ?? trace?.marketId ?? undefined);
  const onChainMarketId = market?.onChainMarketId ?? null;
  const onChainMarket = useOnChainMarket(onChainMarketId);

  const { viewed, isWatching } = useViewedAddress();
  const dir = useDirection();
  const fmt = useFormat();
  const t = useTranslations();
  const balance = useUsdcBalance(address);
  const balanceState = useUsdcBalanceState(address);
  const ledger = useLedgerNow();
  const trustline = useUsdcTrustline(address);
  const enableUsdc = useEnableUsdc();
  const trustlineMissing = trustline.data?.kind === "missing";
  const trustlineReady = trustline.data?.kind === "native" || (trustline.data?.kind === "present" && trustline.data.authorized);
  const marketCanTrade = onChainMarket.data?.market.status.tag === "Open" && ledger.now !== null && Number(onChainMarket.data.market.close_time) - ledger.now > SAFETY_MARGIN_S + MIN_TX_TIMEOUT_S;
  const reserve = useAccountReserve(address);
  const buy = useCopyTrade();
  const submitQueue = useSubmitQueueState(address);

  // Allocation as a share of the wallet's USDC balance, in basis points.
  const [allocationBps, setAllocationBps] = useState(1250);
  // Numeric alternative: the text is only used while the user is mid-edit.
  const [amountText, setAmountText] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [sizingKind, setSizingKind] = useState<SizingKind>("percent");
  const [fixedInput, setFixedInput] = useState("");
  const [capInput, setCapInput] = useState("");
  const [acknowledgeThinEdge, setAcknowledgeThinEdge] = useState(false);
  // Slippage starts from the saved default (/settings); the picker below is a
  // per-trade override that never writes back to settings.
  const { settings } = useSettings(address);
  const [slippageOverrideBps, setSlippageOverrideBps] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewModel, setReviewModel] = useState<{ model: ReviewModel; changedFrom?: ReviewModel } | null>(null);
  const reviewResolver = useRef<((approved: boolean) => void) | null>(null);
  const allocationControlRef = useRef<HTMLButtonElement | null>(null);

  const form = useFormErrors(["fixedAmount", "cap", "outcome", "amount"] as const);
  const reviewPreparedBuy = useCallback<PreparedWriteReview>(async (_prepared, model, changedFrom, forceReview = false) => {
    if (!forceReview && shouldSkipTxReview()) return true;
    return new Promise<boolean>((resolve) => {
      reviewResolver.current = resolve;
      setReviewModel({ model, changedFrom });
    });
  }, []);
  const closeReview = useCallback((approved: boolean) => {
    setReviewModel(null);
    const resolve = reviewResolver.current;
    reviewResolver.current = null;
    resolve?.(approved);
  }, []);

  useEffect(
    () => () => {
      const resolve = reviewResolver.current;
      reviewResolver.current = null;
      resolve?.(false);
    },
    [],
  );

  // Side comes from the trace's edge. No trace or zero edge means no trade.
  const side: "Yes" | "No" | null = trace && trace.edge !== 0 ? (trace.edge > 0 ? "Yes" : "No") : null;
  const buyLabel = side && onChainMarketId ? `Buy ${side} on #${onChainMarketId}` : "";
  const waitingForBuy =
    submitQueue.waiting.some((job) => job.label === buyLabel) ||
    (submitQueue.lockWaiting && submitQueue.running?.label === buyLabel);
  const fixedAmount = fmt.tryParseAmount(fixedInput);
  const userCap = fmt.tryParseAmount(capInput);
  const sizingMode: SizingMode =
    sizingKind === "fixed"
      ? { kind: "fixed", amount: fixedAmount ?? 0n }
      : sizingKind === "mirror"
        ? { kind: "mirror", betFraction: trace?.betFraction }
        : { kind: "percent", bps: allocationBps };
  const choice = balance.data !== undefined ? chooseCollateral(sizingMode, { balance: balance.data, userCap }) : null;
  const amountRaw = choice ? choice.amount : null;
  const slippageBps = slippageOverrideBps ?? settings.slippageBps;

  // The trade amount is always amountForBps(balance, bps): typing an exact
  // amount picks the largest whole-bps share that does not exceed it, so the
  // amount shown after editing can be slightly below what was typed.
  const allocationValueText = (bps: number) =>
    balance.data !== undefined
      ? t("trade.copy.sliderValueText", { percent: fmt.percent(bps, { decimals: 2 }), amount: fmt.usdc(amountForBps(balance.data, bps), { maxDecimals: 2, grouping: true }) })
      : t("trade.copy.sliderValueTextNoBalance", { percent: fmt.percent(bps, { decimals: 2 }) });
  const onAmountTyped = (text: string) => {
    setAmountText(text);
    if (balance.data === undefined) return;
    if (text.trim() === "") {
      setAmountError(null);
      return;
    }
    const parsed = fmt.tryParseAmount(text);
    if (parsed === null) {
      setAmountError(t("trade.copy.amountInvalid"));
    } else if (parsed > balance.data) {
      setAmountError(t("trade.copy.amountOverBalance", { balance: fmt.usdc(balance.data, { maxDecimals: 2, grouping: true }) }));
    } else {
      setAmountError(null);
      setAllocationBps(bpsForAmount(balance.data, parsed));
    }
  };

  // The agent's estimate and the copy's own cost on the current reserves, all in bigint bps.
  const estimateYesBps = trace ? estimateToBps(trace.probabilityEstimate) : null;
  const estimateSideBps = estimateYesBps === null || !side ? null : side === "Yes" ? estimateYesBps : BPS - estimateYesBps;
  const copyMarket = onChainMarket.data ? copyMarketOf(onChainMarket.data.market) : null;
  const localQuote = tryQuoteCopy(copyMarket, side, amountRaw, estimateYesBps);
  const maxForEdge =
    copyMarket && side && estimateYesBps !== null && balance.data !== undefined
      ? maxCollateralForEdge(copyMarket, side, estimateYesBps, MIN_EDGE_WARN_BPS, balance.data)
      : null;
  const edgeBlocked = localQuote !== null && localQuote.edgeAfterBps <= 0n;
  const thinEdge = localQuote !== null && localQuote.edgeAfterBps > 0n && localQuote.edgeAfterBps < MIN_EDGE_WARN_BPS;

  const debouncedAmount = useDebounced(amountRaw, QUOTE_DEBOUNCE_MS);
  const quote = useQuoteBuy(onChainMarketId, side ?? "Yes", side ? debouncedAmount : null);
  const minShares = quote.data !== undefined ? minOut(quote.data, slippageBps) : null;

  useEffect(() => {
    if (localQuote && amountRaw !== null && amountRaw > 0n) {
      const shares = fmt.usdc(localQuote.sharesOut, { maxDecimals: 1 });
      const edge = fmt.percent(localQuote.edgeAfterBps);
      form.announceSettled("quote", `Estimated ${shares} shares, edge ${edge}`);
    }
  }, [localQuote?.sharesOut, localQuote?.edgeAfterBps, amountRaw, form, fmt]);
  const prepareBuy = usePrepareBuy({
    marketId: onChainMarketId,
    outcome: side ?? "Yes",
    collateralIn: side ? debouncedAmount : null,
    slippageBps,
    holder: address,
  });

  const fees = prepareBuy.data?.fees;
  const isUnfunded = Boolean(reserve.data && !reserve.data.funded);
  const isInsufficientXlm = Boolean(
    reserve.data?.funded &&
    fees &&
    reserve.data.spendable < fees.totalFee
  );
  const xlmDeficit = (reserve.data?.funded && fees && fees.totalFee > reserve.data.spendable)
    ? fees.totalFee - reserve.data.spendable
    : null;

  const handleConfirm = async () => {
    if (!isConnected || !address) {
      setStatusMessage(t("trade.copy.connectToConfirm"));
      void openModal();
      return;
    }
    if (isWrongNetwork) {
      setStatusMessage(t("trade.copy.switchNetwork", { network: NETWORK_LABEL }));
      return;
    }
    if (!trace || !side) {
      setStatusMessage(
        !trace ? t("trade.copy.noTrace") : t("trade.copy.noEdge"),
      );
      return;
    }
    if (!onChainMarketId || !market) {
      setStatusMessage(t("trade.copy.notOnChain"));
      return;
    }
    if (!onChainMarket.data) {
      setStatusMessage(t("trade.copy.checkingMarket"));
      return;
    }
    const valid = form.attemptSubmit(() => {
      const errs: Partial<Record<"fixedAmount" | "cap" | "outcome" | "amount", string>> = {};
      if (!side) {
        errs.outcome = "Select an outcome (Yes or No).";
      }
      if (sizingKind === "fixed" && (fixedInput.trim() === "" || fixedAmount === null)) {
        errs.fixedAmount = "Enter an amount like 10 or 2.5 (up to 7 decimal places).";
      }
      if (capInput.trim() !== "" && userCap === null) {
        errs.cap = "Enter an amount like 10 or 2.5.";
      }
      if (!amountRaw || amountRaw <= 0n) {
        errs.amount = "Choose an allocation greater than zero. You may need USDC in your wallet first.";
      }
      return errs;
    });
    if (!valid) return;

    if (!marketCanTrade) {
      setStatusMessage(t("trade.copy.marketClosed"));
      return;
    }
    if (!trustlineReady) {
      setStatusMessage(
        trustlineMissing
          ? "Enable your USDC trustline before copying this trade."
          : trustline.data?.kind === "present"
            ? "The issuer hasn't authorized your USDC trustline."
            : "Checking your USDC trustline…",
      );
      return;
    }
    if (!amountRaw || amountRaw <= 0n) {
      setStatusMessage(t("trade.copy.zeroAllocation"));
      return;
    }

    setIsSubmitting(true);
    try {
      setStatusMessage("Signing in to OracleDesk…");
      if (!(await ensureSession())) {
        setStatusMessage("You need to sign in with your wallet to copy trades.");
        return;
      }

      const freshMarket = await fetchOnChainMarketBySimulation(onChainMarketId);
      const freshLedgerNow = getLedgerNow();
      if (
        freshLedgerNow === null ||
        freshMarket.market.status.tag !== "Open" ||
        BigInt(Math.floor(freshLedgerNow)) + BigInt(SAFETY_MARGIN_S + MIN_TX_TIMEOUT_S) >= freshMarket.market.close_time
      ) {
        setStatusMessage(t("trade.copy.marketClosed"));
        return;
      }

      // Re-check against fresh chain state before anything is recorded or signed.
      const freshBalance = await balance.refetch();
      const freshAmount = chooseCollateral(sizingMode, { balance: freshBalance.data ?? 0n, userCap }).amount;
      if (freshAmount !== amountRaw) {
        setStatusMessage("Your balance changed, so the amount is different now. Check it and confirm again.");
        return;
      }
      const freshQuote = tryQuoteCopy(copyMarketOf(freshMarket.market), side, amountRaw, estimateYesBps);
      if (!freshQuote) {
        setStatusMessage("This amount can't be quoted on the current market. Try a smaller amount.");
        return;
      }
      if (freshQuote.edgeAfterBps <= 0n) {
        setStatusMessage("The market has moved past the agent's estimate, so copying now would buy with no edge. Nothing was sent.");
        return;
      }
      if (freshQuote.edgeAfterBps < MIN_EDGE_WARN_BPS && !acknowledgeThinEdge) {
        setStatusMessage("The remaining edge is thin. Tick the box above to confirm you still want to copy this trade.");
        return;
      }

      setStatusMessage("Recording your copy trade…");
      const result = await buy.run({
        traceId: trace.id,
        backendMarketId: market.id,
        marketId: onChainMarketId,
        outcome: side,
        collateralIn: amountRaw,
        slippageBps,
        prepared: prepareBuy.data,
        review: reviewPreparedBuy,
      });

      setStatusMessage(
        (result.durable ? "Trade done; recording will retry automatically. " : "Trade done; browser storage is unavailable, so keep this tab open to finish recording. ") +
        `You received ${fmt.usdc(result.sharesOut, { maxDecimals: 2 })} ${side.toUpperCase()} shares.` +
          (result.txHash ? ` Transaction ${result.txHash.slice(0, 10)}…` : ""),
      );
      const explorerUrl = result.txHash ? explorerTx(result.txHash) : null;
      if (explorerUrl) window.open(explorerUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const mapped = mapErrorToField(error, {
        SlippageExceeded: "amount",
        "insufficient-balance": "amount",
        TRACE_LOCKED: "amount",
      });
      if ("field" in mapped.target) {
        form.setErrors({ [mapped.target.field]: mapped.message });
      } else {
        form.setFormError(mapped.message);
      }
      setStatusMessage(userMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnableUsdc = async () => {
    setStatusMessage("Checking XLM reserve, then opening your wallet…");
    try {
      await enableUsdc.mutateAsync();
      setStatusMessage("USDC is enabled. Click Confirm Copy Trade when you're ready.");
    } catch (error) {
      setStatusMessage(userMessage(error));
    }
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col">

      <main className="flex-grow flex items-center justify-center p-4 sm:p-margin relative">
        <LiveRegion message={statusMessage ?? ""} />
        <Dialog open onOpenChange={(open) => !open && router.back()}>
          <DialogContent
            initialFocusRef={allocationControlRef}
            className="relative bg-surface border border-outline-variant w-full max-w-[640px] shadow-xl rounded-xl overflow-hidden p-0 max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-white">
              <div>
                <DialogTitle className="font-headline-md text-headline-md text-on-surface">Confirm Copy Trade</DialogTitle>
                <DialogDescription className="font-body-md text-body-md text-on-surface-variant text-sm">Copy the agent&apos;s side on this market</DialogDescription>
              </div>
              <DialogClose asChild>
                <button aria-label="Close" className="p-2 hover:bg-surface-container rounded-full transition-colors" type="button">
                  <Icon name="close" />
                </button>
              </DialogClose>
            </div>

          <div className="bg-[#f0f9fa] border-b border-outline-variant p-6 relative overflow-hidden ai-shimmer text-xs sm:text-sm">
            <div className="flex items-start gap-4">
              <div className="bg-primary-container p-2 rounded-lg flex-shrink-0">
                <Icon name="psychology" filled className="text-on-primary-container" />
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-primary-container mb-1 block">
                  ORACLE INSIGHTS{trace ? ` • ${Math.round(trace.probabilityEstimate * 100)}% ESTIMATE` : ""}
                </span>
                <p className="font-body-md text-body-md text-on-primary-fixed-variant leading-relaxed">
                  {trace?.market?.question ? (
                    <>Agent analysis for <span className="font-bold">{trace.market.question}</span>.</>
                  ) : traceError ? (
                    <>{traceError}</>
                  ) : traceId ? (
                    <>Loading the reasoning trace…</>
                  ) : (
                    <>Open this page from a reasoning trace to copy its trade.</>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Proposed Side</span>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${side === 'No' ? 'bg-tertiary' : side === 'Yes' ? 'bg-secondary' : 'bg-outline-variant'}`}></span>
                  <span className={`font-headline-sm text-headline-sm text-base sm:text-lg ${side === 'No' ? 'text-tertiary' : side === 'Yes' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                    {side === 'No' ? 'NO / SHORT' : side === 'Yes' ? 'YES / LONG' : 'No trade'}
                  </span>
                </div>
              </div>
              <div className="p-4 border border-outline-variant rounded-lg bg-white">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase text-[10px]">Probability</span>
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface text-base sm:text-lg">
                    {trace ? `${(trace.probabilityEstimate * 100).toFixed(1)}%` : "—"}
                  </span>
                  {trace && (
                    <span className="text-[10px] text-secondary font-bold px-1 bg-secondary-container rounded">
                      {`${trace.edge > 0 ? "+" : ""}${(trace.edge * 100).toFixed(1)}% Δ`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {isWatching && !isConnected && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 font-medium">
                  Watching with no wallet connected. Connect your own wallet to size allocations and trade.
                </div>
              )}
              <div className="flex justify-between items-end flex-wrap gap-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">Amount to copy</label>
                <span className="font-data-mono text-data-mono text-primary font-bold text-xs sm:text-sm">
                  {amountRaw !== null ? <Ltr>{`${fmt.usdc(amountRaw, { maxDecimals: 2, minDecimals: 2, grouping: true })} USDC`}</Ltr> : isConnected ? "loading balance…" : "connect a wallet"}
                  {choice && choice.limitedBy !== "none" && (
                    <span className="block text-[10px] font-normal text-on-surface-variant">limited by your {choice.limitedBy}</span>
                  )}
                  <PendingValue state={balanceState.data} />
                </span>
              </div>
              <div role="radiogroup" aria-label="How much to copy" className="grid grid-cols-3 gap-2">
                {SIZING_OPTIONS.map((option, idx) => (
                  <button
                    key={option.kind}
                    ref={idx === 0 ? allocationControlRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={sizingKind === option.kind}
                    disabled={isWatching && !isConnected}
                    onClick={() => setSizingKind(option.kind)}
                    className={`px-3 py-2 text-[11px] font-bold border rounded transition-all ${
                      sizingKind === option.kind
                        ? "border-primary border-2 bg-white text-primary"
                        : "border-outline-variant bg-white hover:border-primary text-on-surface-variant"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {sizingKind === "fixed" && (
                <div className="space-y-1">
                  <label htmlFor={form.ids.fixedAmount.input} className="text-[11px] text-on-surface-variant">Amount in USDC</label>
                  <input
                    id={form.ids.fixedAmount.input}
                    inputMode="decimal"
                    autoComplete="off"
                    value={fixedInput}
                    disabled={isWatching && !isConnected}
                    onChange={(e) => setFixedInput(e.target.value)}
                    onBlur={() => form.handleBlur("fixedAmount")}
                    placeholder="e.g. 25"
                    aria-invalid={Boolean(form.errors.fixedAmount || (fixedInput.trim() !== "" && fixedAmount === null))}
                    aria-describedby={form.ids.fixedAmount.error}
                    className="w-full border border-outline-variant rounded px-3 py-2 font-data-mono text-sm bg-white disabled:opacity-50"
                  />
                  <FieldError
                    id={form.ids.fixedAmount.error}
                    message={
                      form.errors.fixedAmount ??
                      (fixedInput.trim() !== "" && fixedAmount === null
                        ? "Enter an amount like 10 or 2.5 (up to 7 decimal places)."
                        : undefined)
                    }
                  />
                </div>
              )}
              {sizingKind === "mirror" && (
                <p className="text-[11px] text-on-surface-variant">
                  {typeof trace?.betFraction === "number" ? (
                    `The agent bet ${(trace.betFraction * 100).toFixed(1)}% of its bankroll. You copy the same share of your balance, capped as below.`
                  ) : (
                    <>Unlock this trace to mirror the agent&apos;s size. <Link href={routes.premium()} className="underline">See access options</Link></>
                  )}
                </p>
              )}
              <div className="space-y-1">
                <label htmlFor={form.ids.cap.input} className="text-[11px] text-on-surface-variant">Never spend more than (USDC, optional)</label>
                <input
                  id={form.ids.cap.input}
                  inputMode="decimal"
                  autoComplete="off"
                  value={capInput}
                  disabled={isWatching && !isConnected}
                  onChange={(e) => setCapInput(e.target.value)}
                  onBlur={() => form.handleBlur("cap")}
                  placeholder="No cap"
                  aria-invalid={Boolean(form.errors.cap || (capInput.trim() !== "" && userCap === null))}
                  aria-describedby={form.ids.cap.error}
                  className="w-full border border-outline-variant rounded px-3 py-2 font-data-mono text-sm bg-white disabled:opacity-50"
                />
                <FieldError
                  id={form.ids.cap.error}
                  message={
                    form.errors.cap ??
                    (capInput.trim() !== "" && userCap === null
                      ? "Enter an amount like 10 or 2.5."
                      : undefined)
                  }
                />
              </div>
              {choice?.unavailable && sizingKind === "mirror" && <p className="text-[11px] text-error">{choice.unavailable}</p>}
              {sizingKind === "percent" && (
              <>
              <span id="allocation-slider-label" className="block text-[11px] text-on-surface-variant">{t("trade.copy.allocationLabel")}</span>
              <BpsSlider
                id="allocation-slider"
                labelledBy="allocation-slider-label"
                label={t("trade.copy.allocationLabel")}
                value={allocationBps}
                onValueChange={setAllocationBps}
                dir={dir}
                valueText={allocationValueText}
                describedBy="allocation-amount-help"
              />
              <div className="space-y-1">
                <label htmlFor="allocation-amount" className="text-[11px] text-on-surface-variant">{t("trade.copy.amountLabel")}</label>
                <input
                  id="allocation-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={balance.data === undefined || (isWatching && !isConnected)}
                  value={amountFocused ? amountText : amountRaw !== null ? fmt.usdc(amountRaw) : ""}
                  placeholder={balance.data === undefined ? "Balance not loaded" : "0"}
                  onFocus={() => {
                    setAmountText(amountRaw !== null ? fmt.usdc(amountRaw) : "");
                    setAmountFocused(true);
                  }}
                  onBlur={() => {
                    setAmountFocused(false);
                    setAmountError(null);
                  }}
                  onChange={(e) => onAmountTyped(e.target.value)}
                  aria-invalid={amountError !== null}
                  aria-describedby={amountError ? "allocation-amount-error allocation-amount-help" : "allocation-amount-help"}
                  className="w-full border border-outline-variant rounded px-3 py-2 font-data-mono text-sm bg-white disabled:opacity-50"
                />
                {amountError && <p id="allocation-amount-error" className="text-[11px] text-error">{amountError}</p>}
                <p id="allocation-amount-help" className="text-[11px] text-on-surface-variant">
                  {balance.data === undefined ? t("trade.copy.amountDisconnected") : t("trade.copy.amountHelp")}
                </p>
              </div>
              </>
              )}
            </div>

            <div className="p-4 bg-surface-container-low rounded-lg space-y-4">
              <SlippagePicker value={slippageBps} onChange={setSlippageOverrideBps} presets={[...SLIPPAGE_PRESET_BPS]} dir={dir} />
              {slippageOverrideBps === null && (
                <p className="text-[11px] text-on-surface-variant">
                  Using your default from Settings. Pick a value above to override it for this trade only.
                </p>
              )}
              <div className="pt-4 border-t border-outline-variant flex justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <Icon name="query_stats" className="text-outline text-sm" />
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase text-[10px]">Expected shares</span>
                </div>
                <div className="text-end font-data-mono text-xs">
                  {quote.data !== undefined && minShares !== null ? (
                    <>
                      <span className="text-on-surface font-bold">{fmt.usdc(quote.data, { maxDecimals: 2 })}</span>
                      <span className="block text-[10px] text-on-surface-variant">
                        at least {fmt.usdc(minShares, { maxDecimals: 2 })} after <Term id="slippage">slippage</Term>
                        {fees && (
                          <span className="block text-[10px] text-on-surface-variant mt-1">
                            Network fee ≈ {formatXlm(fees.totalFee)} XLM (inclusion: {formatXlm(fees.inclusionFee)}, resource: {formatXlm(fees.resourceFee)}) ·{" "}
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
                        )}
                      </span>
                    </>
                  ) : quote.isFetching ? (
                    <span className="text-on-surface-variant">Quoting…</span>
                  ) : quote.error ? (
                    <span className="text-error">{userMessage(quote.error)}</span>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {localQuote && estimateSideBps !== null && (
                <div className="p-4 border border-outline-variant rounded-lg bg-white space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-data-mono text-xs text-on-surface-variant">
                    <span>Agent estimate <span className="font-bold text-on-surface">{fmt.percent(estimateSideBps)}</span></span>
                    <span>Your avg price <span className="font-bold text-on-surface">{fmt.percent(localQuote.avgPriceBps)}</span></span>
                    <span className={localQuote.edgeAfterBps > 0n ? "font-bold text-secondary" : "font-bold text-error"}>
                      Remaining edge {formatEdge(localQuote.edgeAfterBps, fmt)}
                    </span>
                  </div>
                  {maxForEdge !== null && amountRaw !== null && maxForEdge > 0n && maxForEdge < amountRaw && (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => {
                        setSizingKind("fixed");
                        setFixedInput(fmt.usdc(maxForEdge, { maxDecimals: 2 }));
                      }}
                    >
                      Use max with edge ({fmt.usdc(maxForEdge, { maxDecimals: 2 })} USDC keeps at least {formatEdge(MIN_EDGE_WARN_BPS, fmt)})
                    </button>
                  )}
                  {quote.data !== undefined && quote.data !== localQuote.sharesOut && (
                    <p className="text-[11px] text-on-surface-variant">Price moved, recalculated from the chain. The on-chain quote is used for the minimum shares.</p>
                  )}
                </div>
              )}

              {/* Blocking warnings */}
              {edgeBlocked && (
                <div className="rounded-2xl border border-error/20 bg-error-container/10 p-3 text-xs text-error font-medium" role="alert">
                  The market has moved past the agent&apos;s estimate, so copying now would buy with no edge.
                </div>
              )}
              {thinEdge && localQuote && (
                <label className="flex items-start gap-2 rounded-2xl border border-outline-variant bg-surface p-3 text-xs text-on-surface">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={acknowledgeThinEdge}
                    onChange={(e) => setAcknowledgeThinEdge(e.target.checked)}
                  />
                  <span>The remaining edge is only {formatEdge(localQuote.edgeAfterBps, fmt)}. I still want to copy this trade.</span>
                </label>
              )}
              {isConnected && isUnfunded && (
                <div className="rounded-2xl border border-error/20 bg-error-container/10 p-3 text-xs text-error font-medium" role="alert">
                  Fund this account with XLM first.
                </div>
              )}
              {isConnected && isInsufficientXlm && xlmDeficit !== null && (
                <div className="rounded-2xl border border-error/20 bg-error-container/10 p-3 text-xs text-error font-medium" role="alert">
                  You need about {formatXlm(xlmDeficit)} more XLM to pay the network fee.
                </div>
              )}

              {/* Tx phase tracking */}
              {buy.isPending && (
                <div className="rounded-2xl border border-outline-variant bg-surface p-4 text-sm text-on-surface-variant flex items-center justify-between" role="status">
                  <span>{renderTxPhase(buy.phase) ?? statusMessage ?? "Processing copy trade…"}</span>
                  {"hash" in buy.phase && buy.phase.hash && (
                    <a
                      href={explorerTx(buy.phase.hash) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-data-mono text-xs"
                    >
                      View: {buy.phase.hash.slice(0, 8)}…
                    </a>
                  )}
                </div>
              )}

              {/* Status message when not pending */}
              <PendingCopyTrades />
              {!buy.isPending && statusMessage && (
                <div className="rounded-2xl border border-outline-variant bg-surface p-4 text-sm text-on-surface-variant">
                  {waitingForBuy ? "Waiting for your previous transaction to finish…" : statusMessage}
                </div>
              )}
              <ErrorSummary
                errors={form.errors}
                formError={form.formError}
                ids={form.ids}
                labels={{
                  fixedAmount: "Amount in USDC",
                  cap: "Cap",
                  outcome: "Outcome",
                  amount: "Trade amount",
                }}
                summaryRef={form.summaryRef}
              />
              <FormStatus message={form.statusMessage} />
              <SigningIdentities keys={["marketCore", "usdc"]} compact />
              <div className="flex gap-3">
                <button
                  className="flex-1 border border-outline text-on-surface py-4 rounded-lg font-headline-sm text-headline-sm hover:bg-surface-variant transition-all"
                  onClick={() => router.back()}
                  type="button"
                >
                  Go Back
                </button>
                <button
                  className="flex-[2] bg-[#005f73] text-primary-foreground py-4 rounded-lg font-headline-sm text-headline-sm shadow-lg shadow-primary-container/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirm}
                  type="button"
                  disabled={
                    isSubmitting ||
                    buy.isPending ||
                    isWatching ||
                    !side ||
                    edgeBlocked ||
                    (thinEdge && !acknowledgeThinEdge) ||
                    (isConnected && isUnfunded) ||
                    (isConnected && isInsufficientXlm)
                  }
                  aria-describedby={isWatching ? "watching-copy-desc" : undefined}
                >
                  <Icon name="bolt" className="text-xl" />
                  {isWatching
                    ? "Watching. Connect your own wallet to trade."
                    : isSubmitting || buy.isPending
                    ? (buy.phase.name === "awaiting-signature" ? "Signing…" : "Submitting…")
                    : isUnfunded
                    ? "Fund Account"
                    : isInsufficientXlm
                    ? "Insufficient XLM"
                    : "Confirm Copy Trade"}
                </button>
              </div>
              {isWatching && (
                <p id="watching-copy-desc" className="sr-only">
                  You are viewing another address in watch-only mode. Connect your own wallet to copy trades.
                </p>
              )}
              <p className="text-center font-body-md text-body-md text-on-surface-variant text-xs">
                Your wallet signs a buy on the OracleDesk market contract on Stellar Testnet. The trade fails instead of filling below the slippage limit.
              </p>
              <div className="text-center">
                <TxReviewPreferenceControl />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
      {reviewModel && (
        <TxReview
          model={reviewModel.model}
          changedFrom={reviewModel.changedFrom}
          onConfirm={() => closeReview(true)}
          onCancel={() => closeReview(false)}
        />
      )}
    </div>
  );
}

export default function CopyTradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Copy Trade...</div>}>
      <DevProfiler id="copy-trade">
        <CopyTradeContent />
      </DevProfiler>
    </Suspense>
  );
}
