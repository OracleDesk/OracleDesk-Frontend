"use client";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";

import { SigningIdentities, TxReview, TxReviewPreferenceControl, hasOverriddenIdentities, shouldSkipTxReview } from "@/components/tx-review";
import type { ReviewModel } from "@/lib/stellar/tx-decode";
import { useSubmitQueueState } from "@/lib/stellar/submit-queue";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUserScopeStore } from "@/lib/query/scope";
import { userKeys } from "@/lib/query/keys";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveRegion } from "@/components/ui/live-region";

import { useWallet } from "@/lib/contexts/WalletContext";
import { useUsdcTransfer, useAccountReserve, usePrepareUsdcTransfer, useAccountAuth, usePrepareMultisig } from "@/lib/hooks/useStellar";
import { CONTRACTS, DAILY_PASS_PRICE_RAW, IDENTITIES, PAYMENTS_RECIPIENT, NETWORK_LABEL, NETWORK_PASSPHRASE, explorerTx } from "@/lib/stellar/config";
import { formatUsdc } from "@/lib/stellar/units";
import { TxPhase } from "@/lib/stellar/tx-lifecycle";
import { isMultisigAccount, type MultisigSession } from "@/lib/stellar/multisig";
import { MultisigReview } from "@/components/multisig-review";
import { PendingPaymentCard } from "@/components/pending-payment-card";
import { isUnfinishedPayment, listPending, removePending, savePending, type PendingPayment } from "@/lib/payments/pending";
import { verifyPendingPayment, type VerifyResult } from "@/lib/payments/verify";
import { DAILY_PASS_TRACE_PLACEHOLDER } from "@/lib/api/traces";
import { userMessage } from "@/lib/errors/display";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { setSpanAttribute, withOperation } from "@/lib/observability/tracing";
import { track } from "@/lib/observability/analytics";

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

interface Tier {
  name: string;
  priceRaw: bigint | null;
  priceStr: string;
  period: string;
  description: string;
  features: { text: string; included: boolean }[];
  buttonText: string;
  featured?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Free",
    priceRaw: 0n,
    priceStr: "$0",
    period: "",
    description: "Standard market access for retail observers.",
    buttonText: "CURRENT PLAN",
    features: [
      { text: "Basic Market View", included: true },
      { text: "100 Trace Depth", included: true },
      { text: "Priority Latency", included: false },
      { text: "Advanced API Access", included: false },
    ],
  },
  {
    name: "Pro",
    priceRaw: DAILY_PASS_PRICE_RAW,
    priceStr: `${formatUsdc(DAILY_PASS_PRICE_RAW, { minDecimals: 2 })} USDC`,
    period: "/24 hours",
    description: "Full reasoning traces for 24 hours, paid in USDC on Stellar.",
    buttonText: "GET A DAILY PASS",
    featured: true,
    features: [
      { text: "Full Market Depth", included: true },
      { text: "5,000 Trace Depth", included: true },
      { text: "Priority Data Routing", included: true },
      { text: "Read-Only API Access", included: true },
    ],
  },
  {
    name: "Institutional",
    priceRaw: null,
    priceStr: "—",
    period: "",
    description: "The terminal for firms and high-volume funds. Not available to buy yet.",
    buttonText: "NOT AVAILABLE YET",
    features: [
      { text: "Unlimited Market Depth", included: true },
      { text: "50,000 Trace Depth", included: true },
      { text: "Zero-Latency Dedicated Relay", included: true },
      { text: "Full Read/Write API", included: true },
    ],
  },
];

const features = [
  { name: "Trace Depth (Nodes)", free: "100", pro: "5,000", institutional: "50,000" },
  { name: "Latency Priority", free: "Standard (Shared)", pro: "High (Priority Queue)", institutional: "Ultra (Dedicated Relay)" },
  { name: "API Endpoints", free: "None", pro: "Read-only (Standard)", institutional: "Read/Write (Websockets)" },
  { name: "AI Insights (Oracle)", free: "Daily Summaries", pro: "Real-time Reasoning", institutional: "Predictive Modeling" },
];

type FeatureRow = (typeof features)[number];

const FEATURE_COLUMNS: ColumnDef<FeatureRow>[] = [
  { id: "name", header: "Features", isRowHeader: true, cell: (row) => <span className="font-medium">{row.name}</span> },
  { id: "free", header: "Free", align: "center", cell: (row) => <span className="text-on-surface-variant">{row.free}</span> },
  { id: "pro", header: "Pro", align: "center", cell: (row) => <span className="text-on-surface-variant">{row.pro}</span> },
  { id: "institutional", header: "Institutional", align: "center", cell: (row) => <span className="text-on-surface-variant">{row.institutional}</span> },
];

const featureId = (row: FeatureRow) => row.name;

export default function PremiumPageClient() {
  const { address, isConnected, isWrongNetwork, openModal, ensureSession } = useWallet();
  const transfer = useUsdcTransfer();
  const submitQueue = useSubmitQueueState(address);
  const queryClient = useQueryClient();
  const scopeStore = useUserScopeStore();
  const reserve = useAccountReserve(address);
  const [, setPendingVersion] = useState(0);
  const refreshPending = useCallback(() => setPendingVersion((version) => version + 1), []);
  const pendingPayments = address ? listPending(address, NETWORK_PASSPHRASE) : [];
  const visiblePending = pendingPayments.filter((payment) => payment.state !== "verified");
  const hasUnfinishedPayment = pendingPayments.some(isUnfinishedPayment);

  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const tierButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastSelectedTierNameRef = useRef<string | null>(null);
  const [escapeBlockedAnnouncement, setEscapeBlockedAnnouncement] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"usdc" | "card">("usdc");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // Issue #122: when this build overrides a payment identity, the user must
  // acknowledge the addresses before the pay button unlocks.
  const paymentIdentitiesOverridden = hasOverriddenIdentities(["paymentsRecipient", "usdc"]);
  const [identityAcked, setIdentityAcked] = useState(false);
  const recipientIsTreasury = IDENTITIES.paymentsRecipient.address === CONTRACTS.treasury;
  const [reviewModel, setReviewModel] = useState<{ model: ReviewModel; changedFrom?: ReviewModel } | null>(null);
  const reviewResolver = useRef<((approved: boolean) => void) | null>(null);
  const accountAuth = useAccountAuth(address);
  const isMultisig = accountAuth.data ? isMultisigAccount(accountAuth.data) : false;
  const [multisigMode, setMultisigMode] = useState(false);
  const [multisigSession, setMultisigSession] = useState<MultisigSession | null>(null);
  const prepareMultisig = usePrepareMultisig();
  const waitingForTransfer =
    submitQueue.waiting.some((job) => job.label === "USDC transfer") ||
    (submitQueue.lockWaiting && submitQueue.running?.label === "USDC transfer");

  const reviewPreparedTransfer = useCallback(async (_prepared: unknown, model: ReviewModel, changedFrom?: ReviewModel, forceReview = false) => {
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

  useEffect(() => () => {
    const resolve = reviewResolver.current;
    reviewResolver.current = null;
    resolve?.(false);
  }, []);

  const prepareTransfer = usePrepareUsdcTransfer({
    to: PAYMENTS_RECIPIENT,
    amount: selectedTier?.priceRaw ?? null,
    holder: address,
  });

  const resumePayment = useCallback(
    async (payment: PendingPayment, signIn?: () => Promise<boolean>): Promise<VerifyResult> => {
      const result = await verifyPendingPayment(payment, { signIn, onUpdate: refreshPending });
      refreshPending();
      const scope = scopeStore?.getSnapshot();
      if (result === "verified" && scope?.wallet === payment.from) {
        void queryClient.invalidateQueries({ queryKey: userKeys.root(scope) });
      }
      return result;
    },
    [queryClient, refreshPending, scopeStore],
  );

  useEffect(() => {
    if (!address || isWrongNetwork) return;
    const unfinished = listPending(address, NETWORK_PASSPHRASE).filter(
      (payment) => payment.state === "submitted" || payment.state === "verifying",
    );
    if (unfinished.length === 0) return;
    // Resume after this effect body has returned. Verifying a payment updates
    // the pending list, and doing that synchronously inside the effect would
    // be a cascading render.
    const timer = window.setTimeout(() => {
      for (const payment of unfinished) void resumePayment(payment);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [address, isWrongNetwork, resumePayment]);

  const fees = prepareTransfer.data?.fees;
  const isUnfunded = Boolean(reserve.data && !reserve.data.funded);
  const isInsufficientXlm = Boolean(
    reserve.data?.funded &&
    fees &&
    reserve.data.spendable < fees.totalFee
  );
  const xlmDeficit = (reserve.data?.funded && fees && fees.totalFee > reserve.data.spendable)
    ? fees.totalFee - reserve.data.spendable
    : null;

  const openCheckout = async (tier: Tier) => {
    if (!tier.priceRaw) return;
    if (!isConnected && !(await openModal())) return;
    setStatusMessage(null);
    setEscapeBlockedAnnouncement("");
    setIdentityAcked(false);
    lastSelectedTierNameRef.current = tier.name;
    setSelectedTier(tier);
  };

  const handlePrepareMultisigTransfer = async () => {
    if (!selectedTier?.priceRaw || !address) return;
    try {
      const session = await prepareMultisig.mutateAsync({
        kind: "transfer",
        to: PAYMENTS_RECIPIENT,
        amount: selectedTier.priceRaw,
        sourceAccount: address,
        timeoutInSeconds: 3600,
      });
      setMultisigSession(session);
    } catch (error) {
      setStatusMessage(userMessage(error));
    }
  };

  const handlePayment = async () => {
    if (!selectedTier?.priceRaw || !address) return;
    const priceRaw = selectedTier.priceRaw;

    if (paymentMethod === "card") {
      setStatusMessage("Card payments aren't available. Pay with USDC instead.");
      return;
    }
    if (isWrongNetwork) {
      setStatusMessage(`Switch your wallet to ${NETWORK_LABEL} to complete the purchase.`);
      return;
    }
    if (listPending(address, NETWORK_PASSPHRASE).some(isUnfinishedPayment)) {
      setStatusMessage("Finish your previous payment before making another one.");
      return;
    }

    await withOperation("premium-unlock", async () => {
      setIsSubmitting(true);
      track("premium_payment_started", {});
      let txHash: string | null = null;
      try {
        setStatusMessage("One more signature: this logs you in to OracleDesk and doesn't move funds.");
        if (!(await ensureSession())) {
          setStatusMessage("You need to sign in with your wallet before paying.");
          return;
        }

        setStatusMessage(null);
        // Issue #228: gate on durable storage before moving funds
        const { assertDurableStorage } = await import("@/lib/storage/quota");
        await assertDurableStorage("daily-pass");
        const sent = await transfer.mutateAsync({
          to: PAYMENTS_RECIPIENT,
          amount: priceRaw,
          prepared: prepareTransfer.data,
          review: reviewPreparedTransfer,
          followUp: {
            type: "unlock-daily-pass",
            traceId: DAILY_PASS_TRACE_PLACEHOLDER,
            amountRaw: priceRaw.toString(),
          },
        });
        txHash = sent.txHash.toLowerCase();
        setSpanAttribute("payment.tx_hash", txHash);

      const payment: PendingPayment = {
        txHash,
        kind: "DAILY_PASS",
        amountRaw: priceRaw.toString(),
        from: sent.holder,
        recipient: PAYMENTS_RECIPIENT,
        networkPassphrase: NETWORK_PASSPHRASE,
        createdAt: Date.now(),
        attempts: 0,
        state: "submitted",
      };
      const saved = savePending(payment);
      refreshPending();

      setStatusMessage("Payment sent. Waiting for OracleDesk to verify it on-chain…");
      const result = await resumePayment(payment, ensureSession);
      if (!saved) {
        setStatusMessage(`Couldn't save this payment on this device. Keep this transaction: ${explorerTx(txHash) ?? "unavailable"}`);
      } else if (result === "verified") {
        setStatusMessage(`Your daily pass is active for 24 hours. Transaction: ${explorerTx(txHash) ?? "unavailable"}`);
        setTimeout(() => setSelectedTier(null), 4000);
      } else {
        setStatusMessage("Payment received. Activation is still pending and is listed above; you don't need to pay again.");
      }
    } catch (error) {
      const message = userMessage(error);
      setStatusMessage(
        txHash === null ? `${message} If funds left your wallet, check its history before paying again.` : message,
      );
    } finally {
      setIsSubmitting(false);
    }
    });
  };

  return (
    <main className="flex-grow">
      <section className="py-16 bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-container-max-width mx-auto px-gutter text-center">
          <span className="font-label-caps text-label-caps text-primary tracking-widest bg-primary-container/10 px-3 py-1 rounded-full mb-6 inline-block">
            INSTITUTIONAL GRADE
          </span>
          <h1 className="font-display-lg text-display-lg mb-4 text-4xl md:text-5xl">Elevate Your Analytical Edge</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
            Access institutional-grade market prediction tools, sub-millisecond data latency, and advanced AI reasoning for high-stakes decision making.
          </p>
        </div>
      </section>

      <section className="py-12 px-gutter max-w-container-max-width mx-auto">
        {visiblePending.length > 0 && (
          <div className="mb-8 space-y-3">
            <h2 className="font-headline-sm text-headline-sm">Unfinished payments</h2>
            {visiblePending.map((payment) => (
              <PendingPaymentCard
                key={payment.txHash}
                payment={payment}
                busy={payment.state === "verifying"}
                wrongNetwork={isWrongNetwork}
                onRetry={() => void resumePayment(payment, ensureSession)}
                onDismiss={() => {
                  removePending(payment.txHash);
                  refreshPending();
                }}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 pt-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`bg-white border rounded-xl p-8 flex flex-col transition-all duration-300 relative ${
                tier.featured
                  ? "border-primary border-2 shadow-lg md:scale-105 z-10"
                  : "border-outline-variant hover:border-primary/50 shadow-sm"
              }`}
            >
              {tier.featured && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-1 rounded-full font-label-caps text-label-caps text-[10px]">
                  MOST POPULAR
                </div>
              )}
              <div className="mb-8">
                <h3 className="font-headline-sm text-headline-sm mb-2">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="font-display-lg text-display-lg text-4xl">{tier.priceStr}</span>
                  {tier.period && <span className="text-on-surface-variant font-body-md">{tier.period}</span>}
                </div>
                <p className="text-on-surface-variant font-body-md h-12">{tier.description}</p>
              </div>
              <ul className="space-y-4 flex-grow mb-8">
                {tier.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className={`flex items-center gap-3 font-body-md ${
                      !feature.included ? "opacity-40" : ""
                    }`}
                  >
                    <Icon
                      name={feature.included ? "check_circle" : "cancel"}
                      className="text-primary text-lg"
                    />
                    {feature.text}
                  </li>
                ))}
              </ul>
              <button
                ref={(el) => {
                  tierButtonRefs.current[tier.name] = el;
                }}
                onClick={() => openCheckout(tier)}
                disabled={tier.priceRaw === null || (Boolean(tier.priceRaw) && hasUnfinishedPayment)}
                className={`w-full py-3 rounded-lg font-label-caps text-label-caps transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  tier.name === "Free"
                    ? "border border-outline hover:bg-surface-container"
                    : tier.featured
                    ? "bg-primary text-on-primary hover:brightness-110"
                    : "border border-primary text-primary hover:bg-primary/5"
                }`}
              >
                {Boolean(tier.priceRaw) && hasUnfinishedPayment ? "Finishing your previous payment…" : tier.buttonText}
              </button>
            </div>
          ))}
        </div>

        <div className="mb-24">
          <h2 className="font-headline-md text-headline-md mb-8 text-center">Feature Breakdown</h2>
          <div className="border border-outline-variant rounded-xl bg-white p-4 shadow-sm">
            <DataTable<FeatureRow>
              caption="Feature comparison by plan"
              captionHidden
              columns={FEATURE_COLUMNS}
              rows={features}
              getRowId={featureId}
              emptyState="No features to compare."
            />
          </div>
        </div>

        <div className="bg-white border border-outline-variant rounded-2xl overflow-hidden mb-24 flex flex-col md:flex-row shadow-sm">
          <div className="md:w-1/2 p-8 md:p-12 bg-surface-container-low flex flex-col justify-center">
            <h2 className="font-display-lg text-display-lg mb-6 leading-tight text-3xl md:text-4xl">
              Powered by Oracle AI Reasoning
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 leading-relaxed">
              Our proprietary reasoning engine analyzes billions of on-chain data points to provide &quot;Oracle Insights&quot;—AI-generated predictive narratives that distinguish raw data from market noise.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="bg-white p-4 border border-outline-variant rounded-lg flex-1 min-w-[140px]">
                <span className="font-label-caps text-label-caps text-primary block mb-2">ACCURACY</span>
                <span className="font-headline-sm text-headline-sm">94.2%</span>
              </div>
              <div className="bg-white p-4 border border-outline-variant rounded-lg flex-1 min-w-[140px]">
                <span className="font-label-caps text-label-caps text-primary block mb-2">UPTIME</span>
                <span className="font-headline-sm text-headline-sm">99.99%</span>
              </div>
            </div>
          </div>
          <div className="md:w-1/2 relative h-64 md:h-auto overflow-hidden">
            <Image
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover grayscale opacity-80"
              alt=""
              src="/images/premium-reasoning.webp"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-container-low via-transparent to-transparent md:block hidden"></div>
          </div>
        </div>
      </section>

      <LiveRegion message={escapeBlockedAnnouncement} />
      <Dialog
        open={Boolean(selectedTier)}
        onOpenChange={(open) => {
          if (!open) {
            if (isSubmitting) {
              setEscapeBlockedAnnouncement("Payment is in flight. Please wait for the transaction to complete.");
              return;
            }
            setSelectedTier(null);
          }
        }}
      >
        <DialogContent
          onEscapeKeyDown={(e) => {
            if (isSubmitting) {
              e.preventDefault();
              setEscapeBlockedAnnouncement("Payment is in flight. Please wait for the transaction to complete.");
            }
          }}
          onPointerDownOutside={(e) => {
            if (isSubmitting) {
              e.preventDefault();
              setEscapeBlockedAnnouncement("Payment is in flight. Please wait for the transaction to complete.");
            }
          }}
          onCloseAutoFocus={(e) => {
            if (lastSelectedTierNameRef.current && tierButtonRefs.current[lastSelectedTierNameRef.current]) {
              e.preventDefault();
              tierButtonRefs.current[lastSelectedTierNameRef.current]?.focus();
            }
          }}
          className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden z-10 p-0 max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6 md:p-8 border-b border-outline-variant flex justify-between items-center">
            <div>
              <DialogTitle className="font-headline-md text-headline-md">Confirm Subscription</DialogTitle>
              <DialogDescription className="sr-only">One payment, 24 hours of access to {selectedTier?.name} tier</DialogDescription>
            </div>
            <DialogClose asChild disabled={isSubmitting}>
              <button
                aria-label="Close"
                disabled={isSubmitting}
                className="text-on-surface-variant hover:text-error transition-colors cursor-pointer disabled:opacity-50"
                onClick={() => {
                  if (isSubmitting) return;
                  setSelectedTier(null);
                }}
              >
                <Icon name="close" />
              </button>
            </DialogClose>
          </div>
          <div className="p-6 md:p-8">
            <div className="bg-surface-container-low p-4 rounded-xl mb-8 flex justify-between items-center border border-outline-variant">
              <div>
                <p className="font-label-caps text-label-caps text-primary font-bold">
                  {selectedTier?.name.toUpperCase()} TIER
                </p>
                <p className="font-body-md text-on-surface-variant">One payment, 24 hours of access</p>
              </div>
              <p className="font-headline-md text-headline-md text-on-surface text-2xl">
                {selectedTier?.priceStr}
              </p>
            </div>

            <div className="space-y-6">
              <h4 className="font-label-caps text-label-caps text-on-surface-variant border-b border-outline-variant pb-2">
                PAYMENT METHOD
              </h4>
              <label 
                className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  paymentMethod === 'usdc' ? "border-primary bg-primary-container/5" : "border-outline-variant hover:bg-surface-container-low"
                }`}
                onClick={() => setPaymentMethod('usdc')}
              >
                <div className="w-10 h-10 bg-surface rounded-full flex items-center justify-center me-4 border border-outline-variant overflow-hidden p-2">
                  <Image
                    alt="USDC"
                    width={40}
                    height={40}
                    className="w-full h-full object-contain"
                    src="/images/usdc-token.webp"
                  />
                </div>
                <div className="flex-grow">
                  <p className="font-body-md font-bold">Pay with USDC</p>
                  <p className="text-xs text-on-surface-variant">From your wallet on Stellar Testnet</p>
                </div>
                {paymentMethod === 'usdc' && (
                  <Icon name="check_circle" filled className="text-primary" />
                )}
              </label>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Status</span>
                  <span className="font-data-mono text-secondary text-sm">{statusMessage ?? "Ready"}</span>
                </div>
                {isWrongNetwork && <p className="text-error text-sm">Wrong network; switch to Stellar Testnet.</p>}
                {isUnfunded && <p className="text-warning text-sm">This account cannot cover the transaction fee.</p>}
              </div>

              <SigningIdentities keys={["paymentsRecipient", "usdc"]} />
              {recipientIsTreasury && (
                <p className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-xs text-on-surface-variant">
                  Payments go to the OracleDesk treasury contract, which also funds the agent&apos;s trading.
                </p>
              )}
              {paymentIdentitiesOverridden && (
                <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={identityAcked}
                    onChange={(event) => setIdentityAcked(event.target.checked)}
                  />
                  I checked these addresses
                </label>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => void handlePayment()}
                  disabled={
                    isSubmitting ||
                    !selectedTier?.priceRaw ||
                    !address ||
                    isWrongNetwork ||
                    (paymentIdentitiesOverridden && !identityAcked)
                  }
                  className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-label-caps text-label-caps hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Processing…" : `Pay ${selectedTier?.priceStr}`}
                </button>
                {isMultisig && (
                  <button
                    onClick={() => void handlePrepareMultisigTransfer()}
                    className="w-full border border-outline-variant py-3 rounded-lg font-label-caps text-label-caps"
                  >
                    Prepare multisig transfer
                  </button>
                )}
                <button
                  disabled={isSubmitting}
                  onClick={() => {
                    if (isSubmitting) return;
                    setSelectedTier(null);
                  }}
                  className="w-full border border-outline-variant py-3 rounded-lg font-label-caps text-label-caps disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {reviewModel && (
        <TxReview
          model={reviewModel.model}
          changedFrom={reviewModel.changedFrom}
          onConfirm={() => closeReview(true)}
          onCancel={() => closeReview(false)}
        />
      )}
      <TxReviewPreferenceControl />
      {multisigSession && <MultisigReview session={multisigSession} onClose={() => setMultisigSession(null)} />}
      {statusMessage && <div className="sr-only">{statusMessage}</div>}
      {waitingForTransfer && <div className="sr-only">Waiting for transfer</div>}
      {renderTxPhase({ name: "building" })}
      {typeof xlmDeficit === "bigint" && <div className="sr-only">{xlmDeficit.toString()}</div>}
      {isInsufficientXlm && <div className="sr-only">Insufficient XLM</div>}
    </main>
  );
}
