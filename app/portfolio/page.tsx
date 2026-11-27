"use client";
import { Icon } from "@/components/ui/icon";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePortfolio, usePositions } from "@/lib/hooks/usePortfolio";
import { useAddressPositions, useMyPositions } from "@/lib/hooks/useMyPositions";
import { reconcileIndex } from "@/lib/stellar/wallet-market-index";
import { useViewedAddress } from "@/lib/hooks/useViewedAddress";
import {
  floatUsdcToRaw,
  formatBps,
  formatProbability,
  formatSignedUsdc,
  formatUsdcDisplay,
  ratioBps,
} from "@/lib/format/money";
import { useTreasuryValuation } from "@/lib/portfolio/useValuation";
import { formatUsdc, shortAddress } from "@/lib/stellar/units";
import { validateWatchAddress } from "@/lib/stellar/identity";
import { useFormErrors, ErrorSummary, Field, FieldError, FormStatus } from "@/components/ui/form-errors";
import { NETWORK_LABEL } from "@/lib/stellar/config";
import deployments from "@/lib/stellar/generated/deployments.testnet.json";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useRedeemAll, reviewPreparedWrite, submitPrepared, type PreparedWriteReview } from "@/lib/hooks/useStellar";
import { shouldSkipTxReview, TxReview, TxReviewPreferenceControl } from "@/components/tx-review";
import type { ReviewModel } from "@/lib/stellar/tx-decode";
import { TreasuryRiskLimits } from "@/components/treasury-risk-limits";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { ExportHistoryDialog } from "@/components/portfolio/export-history-dialog";
import { PendingCopyTrades } from "@/components/copy-trade/PendingCopyTrades";
import { SourceTag } from "@/components/ui/source-tag";
import { AddressInput } from "@/components/ui/address-input";
import { AddressText } from "@/components/ui/address-text";
import { knownAddresses } from "@/lib/stellar/address-book";
import { classify, type PolicyCheckedAddress } from "@/lib/stellar/address-policy";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/lib/settings/useSettings";
import { estimateTtl, prepareExtendTtl, prepareRestore, type EntryTtl, type TtlEstimate } from "@/lib/stellar/ttl";
import { ledgerClock } from "@/lib/stellar/ledger-clock";
import { marketLedgerKey, positionLedgerKey } from "@/lib/stellar/ledger-entries";
import { describeError } from "@/lib/stellar/errors";
import { xdr } from "@stellar/stellar-sdk";

const TerminalLog = () => {
  const [logs, setLogs] = useState([
    { text: "[2026-05-14 09:32:11] INITIALIZING ORACLE PROTOCOL...", color: "opacity-50" },
    { text: "[SUCCESS] Market Resolution Detected: ETH_PRICE_MAY_26 -> YES (100.00%)", color: "text-secondary-fixed" },
    { text: "[INFO] Wallet 0x8a1...f3e claimed 820.00 USDC in rewards.", color: "" },
    { text: "[TRADE] Order Executed: SELL 500 'NO' Contracts on 'SpaceX_Mars_2026' at $0.42.", color: "" },
    { text: "[PNL] Portfolio unrealized profit increased by 1.2% in last 60 minutes.", color: "" },
    { text: "[SYSTEM] Syncing with Polymarket API... Node latency 14ms.", color: "text-surface-dim opacity-70" },
    { text: "[SUCCESS] Limit order filled: 10,000 YES contracts @ $0.62.", color: "text-secondary-fixed" },
  ]);

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
      const newLogOptions = [
        `[${time}] [HEARTBEAT] Pinged primary oracle cluster... 8ms`,
        `[${time}] [UPDATE] Price Feed updated for BTC/USD: $64,210.04`,
        `[${time}] [SECURE] Wallet session verified via ECDSA signature.`,
        `[${time}] [INFO] New liquidity detected in Election markets.`
      ];
      const randomLog = newLogOptions[Math.floor(Math.random() * newLogOptions.length)];
      setLogs(prev => [...prev.slice(-19), { text: randomLog, color: "text-surface-dim opacity-40 animate-pulse" }]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="lg:col-span-2 bg-on-background rounded shadow-lg overflow-hidden border border-outline">
      <div className="px-4 py-3 border-b border-outline/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-error"></div>
          <div className="w-3 h-3 rounded-full bg-secondary-fixed"></div>
          <div className="w-3 h-3 rounded-full bg-primary-fixed"></div>
          <span className="font-data-mono text-[11px] text-surface-variant ms-4 uppercase tracking-widest">Transaction & Performance Log</span>
        </div>
        <Icon name="terminal" className="text-surface-variant text-[18px]" />
      </div>
      <div 
        ref={terminalRef}
        className="p-6 h-[400px] overflow-y-auto font-data-mono text-[12px] text-primary-fixed-dim leading-relaxed scrollbar-hide scroll-smooth"
      >
        {logs.map((log, i) => (
          <div key={i} className={`mb-2 ${log.color}`}>
            {log.text}
          </div>
        ))}
        <div className="text-surface-dim opacity-40">... streaming real-time events ...</div>
      </div>
    </section>
  );
};

/** One position as the table needs it: display strings plus typed sort keys. */
interface PositionTableRow {
  id: string;
  market: string;
  category: string;
  platform: string;
  side: "YES" | "NO";
  entry: string;
  /** Backend float today; only this accessor changes when positions move to bigint. */
  entryValue: number;
  prob: number | null;
  size: string;
  costRaw: bigint | null;
  exitValue: string;
  exitSubLabel?: string;
  cappedWarning?: string | null;
  pnl: string;
  pnlRaw: bigint | null;
  pnlPercent: string;
  pnlColor: string;
  status: string;
  resolved: boolean;
  claimable: boolean;
}

const positionRowId = (row: PositionTableRow) => row.id;

const POSITION_COLUMNS: ColumnDef<PositionTableRow>[] = [
  {
    id: "market",
    header: "Market",
    isRowHeader: true,
    sortValue: (row) => row.market,
    cell: (row) => (
      <span className="block max-w-xs text-start font-body-md text-on-surface">
        <span className="block truncate font-semibold">{row.market}</span>
        <span className="text-[11px] text-outline uppercase">{row.category} • {row.platform}</span>
      </span>
    ),
  },
  {
    id: "side",
    header: "Side",
    sortValue: (row) => row.side,
    cell: (row) => (
      <span className={`${row.side === "YES" ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-container text-on-tertiary-container"} px-2 py-0.5 rounded text-[11px] font-bold`}>{row.side}</span>
    ),
  },
  { id: "entry", header: "Entry", numeric: true, sortValue: (row) => row.entryValue, cell: (row) => row.entry },
  {
    id: "probability",
    header: "Probability",
    align: "center",
    sortValue: (row) => row.prob,
    cell: (row) =>
      row.prob === null ? (
        <span className="text-outline">—</span>
      ) : (
        <span className="mx-auto flex w-32 flex-col gap-1">
          <span className="flex justify-between text-[10px] font-bold text-outline">
            <span>{row.prob}%</span>
            <span>{row.side}</span>
          </span>
          <span aria-hidden="true" className="relative block h-1 overflow-hidden rounded-full bg-outline-variant">
            <span className={`absolute start-0 top-0 block h-full ${row.side === "YES" ? "bg-secondary" : "bg-tertiary"}`} style={{ width: `${row.prob}%` }} />
          </span>
        </span>
      ),
  },
  {
    id: "size",
    header: "Size (backend record)",
    numeric: true,
    sortValue: (row) => row.costRaw,
    cell: (row) => (
      <>
        <div>{row.size}</div>
        <div className="text-[10px] text-outline">Backend record</div>
      </>
    ),
  },
  {
    id: "exit",
    header: "Exit value (on-chain)",
    numeric: true,
    cell: (row) => (
      <>
        <div className="font-semibold text-on-surface">{row.exitValue}</div>
        {row.exitSubLabel && <div className="text-[10px] text-outline">{row.exitSubLabel}</div>}
        {row.cappedWarning && (
          <span role="status" className="mt-1 inline-block rounded bg-error-container px-1.5 py-0.5 text-[10px] font-bold text-tertiary-container">
            {row.cappedWarning}
          </span>
        )}
      </>
    ),
  },
  {
    id: "pnl",
    header: "PnL (backend record)",
    numeric: true,
    sortValue: (row) => row.pnlRaw,
    cell: (row) => (
      <>
        <div className={`${row.pnlColor} font-bold`}>{row.pnl}</div>
        <div className={`text-[11px] ${row.pnlColor === "text-secondary" ? "text-secondary-container bg-on-secondary-fixed-variant" : "text-tertiary-container bg-error-container"} px-1 rounded inline-block`}>
          {row.pnlPercent}
        </div>
        <div className="text-[10px] text-outline">Backend record</div>
      </>
    ),
  },
  {
    id: "status",
    header: "Status",
    align: "center",
    sortValue: (row) => row.status,
    cell: (row) => (
      <span className={`text-[10px] ${row.resolved ? "bg-on-background text-surface" : "bg-primary-container text-on-primary-container"} px-2 py-0.5 rounded-full uppercase`}>{row.status}</span>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    align: "end",
    cell: (row) =>
      row.claimable ? (
        <button
          type="button"
          aria-label={`Claim rewards for ${row.market}`}
          className="bg-secondary text-primary-foreground px-3 py-1 rounded font-label-caps text-[10px] uppercase shadow-sm active:scale-95 transition-transform"
          onClick={() => alert("Reward claiming coming soon.")}
        >
          Claim Rewards
        </button>
      ) : (
        <span className="space-x-2">
          <button
            type="button"
            aria-label={`Manage position in ${row.market}`}
            className="text-primary hover:underline font-label-caps text-label-caps"
            onClick={() => alert("Position management coming soon.")}
          >
            Manage
          </button>
          <button
            type="button"
            aria-label={`Close position in ${row.market}`}
            className="text-tertiary hover:underline font-label-caps text-label-caps"
            onClick={() => alert("Closing functionality coming soon.")}
          >
            Close
          </button>
        </span>
      ),
  },
];

export default function PortfolioPage() {
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [exportOpen, setExportOpen] = useState(false);
  const wallet = useWallet();
  const redeemBatch = useRedeemAll();
  const [reviewModel, setReviewModel] = useState<{ model: ReviewModel; changedFrom?: ReviewModel } | null>(null);
  const reviewResolver = useRef<((approved: boolean) => void) | null>(null);
  const { data: summary, isLoading: isSummaryLoading } = usePortfolio();
  const { data: positionsData, isLoading: isPositionsLoading } = usePositions({ status });
  const positions = positionsData?.positions ?? [];
  const rawTreasuryValuation = useTreasuryValuation(positions);
  const treasuryValuation = {
    ...rawTreasuryValuation,
    basis: rawTreasuryValuation.mode,
    setBasis: rawTreasuryValuation.setMode,
  };

  const positionRows: PositionTableRow[] = positions.map((pos) => {
    const costRaw = floatUsdcToRaw(pos.size);
    const pnlRaw = pos.pnl !== null ? floatUsdcToRaw(pos.pnl) : null;
    const returnBps = pnlRaw !== null && costRaw !== null && costRaw > 0n ? ratioBps(pnlRaw, costRaw) : null;
    const chainId = pos.market.onChainMarketId;
    const valEntry = chainId !== null ? treasuryValuation.byMarketId.get(chainId) : undefined;
    const val = valEntry?.valuation;

    let exitValue = "—";
    let exitSubLabel: string | undefined;
    let cappedWarning: string | null = null;

    if (val) {
      if (val.basis === "resolution" && val.resolution !== null) {
        exitValue = formatUsdcDisplay(val.resolution);
        exitSubLabel = "Redeemable (on-chain)";
      } else if (val.basis === "mid-only") {
        exitValue = treasuryValuation.basis === "mid" ? formatUsdcDisplay(val.mid) : "—";
        exitSubLabel = "Closed, awaiting resolution";
      } else {
        exitValue = formatUsdcDisplay(treasuryValuation.basis === "mid" ? val.mid : val.liquidation.value);
        exitSubLabel = treasuryValuation.basis === "mid" ? "Mid (on-chain)" : "Exit (on-chain)";
      }

      if (val.liquidation.capped && valEntry) {
        const soldShares = val.liquidation.sold.yes + val.liquidation.sold.no;
        const heldShares = valEntry.holding.yes + valEntry.holding.no;
        cappedWarning = `Only ${formatUsdc(soldShares, { maxDecimals: 2, grouping: true })} of ${formatUsdc(heldShares, { maxDecimals: 2, grouping: true })} shares sellable. Selling the rest would return only ${formatUsdcDisplay(val.liquidation.tailValue)} more`;
      }
    }

    return {
      id: pos.id,
      market: pos.market.question,
      category: pos.market.category,
      platform: pos.market.onChainMarketId !== null ? `On-chain #${pos.market.onChainMarketId}` : "Not on-chain",
      side: pos.direction,
      entry: formatProbability(pos.entryPrice),
      entryValue: pos.entryPrice,
      prob: pos.currentPrice !== null ? Math.round(pos.currentPrice * 100) : null,
      size: costRaw !== null ? formatUsdcDisplay(costRaw) : "—",
      costRaw,
      exitValue,
      exitSubLabel,
      cappedWarning,
      pnl: pnlRaw !== null ? formatSignedUsdc(pnlRaw) : "—",
      pnlRaw,
      pnlPercent: returnBps !== null ? formatBps(returnBps, { signed: true }) : "—",
      pnlColor: (pos.pnl ?? 0) >= 0 ? "text-secondary" : "text-tertiary",
      status: pos.status,
      resolved: pos.status !== "OPEN",
      claimable: pos.status === "CLOSED",
    };
  });
  const { viewed, isWatching, pendingWatch, confirmPendingWatch, dismissPendingWatch, setWatch, clearWatch } = useViewedAddress();
  const [watchInput, setWatchInput] = useState("");
  const [validatedWatch, setValidatedWatch] = useState<PolicyCheckedAddress | null>(null);
  const watchForm = useFormErrors(["watchAddress"] as const);
  const known = knownAddresses(wallet.address);
  const activeHolder = viewed ?? wallet.address;
  const addressPositions = useAddressPositions(activeHolder);
  const myPositions = useMyPositions();
  const [reconcileProgress, setReconcileProgress] = useState<{ scanned: number; total: number } | null>(null);
  const reconcileAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeHolder || !addressPositions.totalMarkets || addressPositions.coverage?.complete) {
      setReconcileProgress(null);
      return;
    }
    const controller = new AbortController();
    reconcileAbortRef.current = controller;
    void reconcileIndex(activeHolder, addressPositions.totalMarkets, {
      signal: controller.signal,
      onProgress: (scanned, total) => setReconcileProgress({ scanned, total }),
    }).catch(() => {});

    return () => {
      controller.abort();
    };
  }, [activeHolder, addressPositions.totalMarkets, addressPositions.coverage?.complete]);
  const currentRedeemIds = new Set(redeemBatch.discovery?.redeemables.map((item) => item.marketId.toString()) ?? []);
  const currentRedeemed = redeemBatch.discovery?.redeemables.filter(
    (item) => redeemBatch.states[item.marketId.toString()]?.s === "redeemed",
  ) ?? [];
  const expectedRedeemTotal = redeemBatch.discovery?.redeemables.reduce((total, item) => total + item.expectedPayout, 0n) ?? 0n;
  const redeemedPayoutTotal = currentRedeemed.reduce(
    (total, item) => {
      const state = redeemBatch.states[item.marketId.toString()];
      return total + (state?.s === "redeemed" ? state.payout : 0n);
    },
    0n,
  );
  const resumedItems = Object.entries(redeemBatch.states).filter(([id, item]) =>
    !currentRedeemIds.has(id) && (item.s === "redeemed" || item.s === "failed" || item.s === "skipped"),
  );
  const reviewRedeem = useCallback<PreparedWriteReview>(async (_prepared, model, changedFrom, forceReview = false) => {
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

  const queryClient = useQueryClient();
  const { settings } = useSettings(wallet.address);
  const [selectedMarketIds, setSelectedMarketIds] = useState<Set<string>>(new Set());
  const [horizonDays, setHorizonDays] = useState<number>(90);
  const [isExtending, setIsExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const toggleMarketSelection = (id: string) => {
    setSelectedMarketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const unarchived = addressPositions.rows.filter((r) => !r.archived);
    if (selectedMarketIds.size === unarchived.length) {
      setSelectedMarketIds(new Set());
    } else {
      setSelectedMarketIds(new Set(unarchived.map((r) => r.marketId.toString())));
    }
  };

  const handleKeepAlive = async () => {
    if (selectedMarketIds.size === 0 || !activeHolder || isWatching) return;
    setIsExtending(true);
    setExtendError(null);
    try {
      const speed = ledgerClock.getLedgerSpeed();
      const latestSeq = addressPositions.rows[0]?.ttl?.position.latestLedger ?? (await ledgerClock.getSequence() ?? 1000);
      const extendToLedgers = latestSeq + Math.round((horizonDays * 86400) / speed.mean);

      const keys: xdr.LedgerKey[] = [];
      const knownLiveUntil = new Map<string, number>();
      for (const idStr of selectedMarketIds) {
        const row = addressPositions.rows.find((r) => r.marketId.toString() === idStr);
        if (!row) continue;
        const posKey = row.ttl?.position.key ?? positionLedgerKey(row.marketId, activeHolder);
        const mktKey = row.ttl?.market.key ?? marketLedgerKey(row.marketId);
        keys.push(posKey, mktKey);
        if (row.ttl?.position.liveUntil !== null && row.ttl?.position.liveUntil !== undefined) {
          knownLiveUntil.set(posKey.toXDR("base64"), row.ttl.position.liveUntil);
        }
        if (row.ttl?.market.liveUntil !== null && row.ttl?.market.liveUntil !== undefined) {
          knownLiveUntil.set(mktKey.toXDR("base64"), row.ttl.market.liveUntil);
        }
      }

      const initial = await prepareExtendTtl(activeHolder, keys, extendToLedgers, { knownLiveUntil });
      const reviewed = await reviewPreparedWrite(initial, reviewRedeem, () =>
        prepareExtendTtl(activeHolder, keys, extendToLedgers, { knownLiveUntil }),
      );
      await submitPrepared(reviewed.prepared);
      setSelectedMarketIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["stellar"] });
    } catch (err) {
      setExtendError(describeError(err).message);
    } finally {
      setIsExtending(false);
    }
  };

  const handleRestoreSingle = async (row: (typeof addressPositions.rows)[0]) => {
    if (!activeHolder || isWatching) return;
    const idStr = row.marketId.toString();
    setRestoringId(idStr);
    setRestoreError(null);
    try {
      const posKey = row.ttl?.position.key ?? positionLedgerKey(row.marketId, activeHolder);
      const mktKey = row.ttl?.market.key ?? marketLedgerKey(row.marketId);
      const keys = [posKey, mktKey];
      const initial = await prepareRestore(activeHolder, keys);
      const reviewed = await reviewPreparedWrite(initial, reviewRedeem, () =>
        prepareRestore(activeHolder, keys),
      );
      await submitPrepared(reviewed.prepared);
      await queryClient.invalidateQueries({ queryKey: ["stellar"] });
    } catch (err) {
      setRestoreError(describeError(err).message);
    } finally {
      setRestoringId(null);
    }
  };

  useEffect(
    () => () => {
      const resolve = reviewResolver.current;
      reviewResolver.current = null;
      resolve?.(false);
    },
    [],
  );

  return (
    <main className="max-w-container-max-width mx-auto px-gutter py-8">
      <PendingCopyTrades />
      {/* Portfolio Header / Summary */}
      <section className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-background mb-1">Portfolio Performance</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            The figures below summarise the OracleDesk agent&apos;s book. Your own wallet holdings are listed under
            &ldquo;My positions&rdquo;.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="bg-white border border-outline-variant p-4 rounded min-w-[160px] shadow-sm">
            <div className="font-label-caps text-label-caps text-outline mb-1">EQUITY (AGENT BOOK, USDC)</div>
            <div className="font-headline-sm text-headline-sm text-on-background">
              {isSummaryLoading
                ? "..."
                : (() => {
                    const raw = floatUsdcToRaw(summary?.totalUsdc);
                    return raw !== null ? formatUsdcDisplay(raw) : "—";
                  })()}
            </div>
            <div className="text-[10px] font-bold text-on-surface-variant mt-1">Backend record of the agent&apos;s holdings</div>
            <div className={`text-[12px] font-bold ${(summary?.dailyPnl ?? 0) >= 0 ? 'text-secondary' : 'text-tertiary'} flex items-center gap-1 mt-1`}>
              <Icon
                name={(summary?.dailyPnl ?? 0) >= 0 ? 'arrow_upward' : 'arrow_downward'}
                className="text-[14px]"
              /> 
              {isSummaryLoading
                ? "..."
                : (() => {
                    const raw = floatUsdcToRaw(summary?.dailyPnl);
                    return raw !== null ? `${formatSignedUsdc(raw)} today (backend record)` : "—";
                  })()}
            </div>
          </div>

          <div
            className="bg-white border border-outline-variant p-4 rounded min-w-[200px] shadow-sm"
            title="What selling everything now would return after price impact and fees"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-label-caps text-label-caps text-outline">
                {treasuryValuation.basis === "exit" ? "EXIT VALUE (ON-CHAIN)" : "MID VALUE (ON-CHAIN)"}
              </span>
              <div className="inline-flex rounded border border-outline-variant bg-surface-container p-0.5 text-[10px] font-label-caps">
                <button
                  type="button"
                  aria-pressed={treasuryValuation.basis === "exit"}
                  onClick={() => treasuryValuation.setBasis("exit")}
                  className={`rounded px-1.5 py-0.5 transition-colors ${treasuryValuation.basis === "exit" ? "bg-white font-bold text-primary shadow-sm" : "text-on-surface-variant"}`}
                >
                  Exit
                </button>
                <button
                  type="button"
                  aria-pressed={treasuryValuation.basis === "mid"}
                  onClick={() => treasuryValuation.setBasis("mid")}
                  className={`rounded px-1.5 py-0.5 transition-colors ${treasuryValuation.basis === "mid" ? "bg-white font-bold text-primary shadow-sm" : "text-on-surface-variant"}`}
                >
                  Mid
                </button>
              </div>
            </div>
            <div className="font-headline-sm text-headline-sm text-on-background">
              {treasuryValuation.isLoading ? "..." : formatUsdcDisplay(treasuryValuation.activeTotalRaw)}
            </div>
            <div className="text-[10px] font-bold text-on-surface-variant mt-1">
              What selling everything now would return after price impact and fees
            </div>
          </div>
          
          <div className="bg-white border border-outline-variant p-4 rounded min-w-[160px] shadow-sm">
            <div className="font-label-caps text-label-caps text-outline mb-1">TREASURY CAPITAL</div>
            <div className="font-headline-sm text-headline-sm text-secondary">
              {isSummaryLoading ? "..." : summary?.availableCapitalRaw ? formatUsdcDisplay(BigInt(summary.availableCapitalRaw)) : "—"}
            </div>
            <div className="text-[10px] font-bold text-on-surface-variant mt-1">Read live from the treasury contract</div>
          </div>

          <div className="bg-white border border-outline-variant p-4 rounded min-w-[160px] shadow-sm">
            <div className="font-label-caps text-label-caps text-outline mb-1">AGENT POSITIONS</div>
            <div className="font-headline-sm text-headline-sm text-on-background">
              {isSummaryLoading ? "..." : summary?.openPositions}
            </div>
            <div className="text-[12px] font-medium text-on-surface-variant mt-1">Open positions the agent manages</div>
          </div>
        </div>
      </section>

      {/* Per-address on-chain positions (issue #141 & #50), read from ledger entries */}
      <section className="mb-8" aria-labelledby="address-positions-title">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="address-positions-title" className="font-headline-sm text-headline-sm text-on-background">
                Positions for {activeHolder ? shortAddress(activeHolder, 6, 4) : "Address"}
              </h2>
              {isWatching && (
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Watching
                </span>
              )}
              {activeHolder && activeHolder === deployments.agent && (
                <span className="rounded-full bg-secondary/10 text-secondary border border-secondary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Treasury Agent
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-on-surface-variant">
              Read directly from market-core ledger entries on Stellar Testnet · not the agent&apos;s book
            </p>
          </div>
          {wallet.isConnected && activeHolder === wallet.address && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-2 rounded border border-outline-variant bg-white px-4 py-2 text-xs font-label-caps font-bold text-primary shadow-sm hover:bg-surface-container-low"
            >
              <Icon name="download" className="text-[16px]" />
              Export my history
            </button>
          )}
        </div>

        {/* External ?watch= interstitial */}
        {pendingWatch && (
          <div
            role="region"
            aria-label="Confirm watched address"
            className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2"
          >
            <p className="text-xs font-bold text-on-surface">
              This link asks to watch a Stellar address:
            </p>
            <div className="text-xs">
              <AddressText address={pendingWatch} />
            </div>
            {classify(pendingWatch, known, { expect: "any" }).some((f) => f.kind === "lookalike") && (
              <p className="text-xs font-bold text-error">
                Warning: this address looks similar to a known counterparty.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={confirmPendingWatch}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold"
              >
                View
              </button>
              <button
                type="button"
                onClick={dismissPendingWatch}
                className="border border-outline-variant bg-white px-3 py-1.5 rounded text-xs font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Address Input & Quick Picks */}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 mb-4">
          <ErrorSummary
            errors={watchForm.errors}
            formError={watchForm.formError}
            ids={watchForm.ids}
            labels={{ watchAddress: "Watch address" }}
            summaryRef={watchForm.summaryRef}
            className="mb-3"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const valid = watchForm.attemptSubmit(() => {
                const res: Partial<Record<"watchAddress", string>> = {};
                const val = validateWatchAddress(watchInput);
                if (!val.ok) {
                  res.watchAddress = val.error;
                }
                return res;
              });
              if (!valid) return;
              const val = validateWatchAddress(watchInput);
              if (!val.ok) return;
              if (setWatch(val.address, { internal: true })) {
                watchForm.announceSettled("watch", `Now viewing ${shortAddress(val.address, 4, 4)} in watch-only mode`);
                setWatchInput("");
                setValidatedWatch(null);
                watchForm.clearErrors();
              }
            }}
            className="flex flex-col sm:flex-row items-start gap-2 mb-3"
          >
            <Field className="flex-1 w-full">
              <AddressInput
                id={watchForm.ids.watchAddress.input}
                value={watchInput}
                onChange={(val) => {
                  setWatchInput(val);
                  if (watchForm.errors.watchAddress) {
                    watchForm.clearErrors();
                  }
                }}
                onValidated={setValidatedWatch}
                policy="watch"
                expect="any"
                known={known}
                placeholder="Watch an address (G... or C...)"
                ariaLabel="Watch an address"
              />
              <FieldError
                id={watchForm.ids.watchAddress.error}
                message={watchForm.errors.watchAddress}
              />
            </Field>
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold font-label-caps hover:brightness-110 transition-all shrink-0"
            >
              Watch
            </button>
          </form>
          <FormStatus message={watchForm.statusMessage} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] text-on-surface-variant font-medium">Quick picks:</span>
            {wallet.isConnected && wallet.address && (
              <button
                type="button"
                onClick={() => { if (wallet.address) setWatch(wallet.address, { internal: true }); }}
                className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                  activeHolder === wallet.address && !isWatching
                    ? "bg-primary text-primary-foreground border-primary font-bold"
                    : "bg-white border-outline-variant hover:border-primary text-on-surface"
                }`}
              >
                My Wallet ({shortAddress(wallet.address, 4, 4)})
              </button>
            )}
            <button
              type="button"
              onClick={() => setWatch(deployments.agent)}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                activeHolder === deployments.agent
                  ? "bg-primary text-primary-foreground border-primary font-bold"
                  : "bg-white border-outline-variant hover:border-primary text-on-surface"
              }`}
            >
              Treasury Agent ({shortAddress(deployments.agent, 4, 4)})
            </button>
            {isWatching && (
              <button
                type="button"
                onClick={clearWatch}
                className="px-2.5 py-1 rounded border border-outline-variant bg-white hover:bg-error-container hover:text-on-error-container text-xs text-on-surface-variant transition-colors"
              >
                Clear watch
              </button>
            )}
          </div>
        </div>

        {/* Positions Table */}
        <div className="rounded-xl border border-outline-variant bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant px-6 py-3">
            <span className="font-label-caps text-label-caps text-outline">MARKET VALUE</span>
            <span className="font-data-mono text-data-mono text-on-background flex items-center gap-1.5">
              {addressPositions.isLoading ? "Scanning ledger…" : formatUsdcDisplay(addressPositions.totalValueRaw)}
              <SourceTag source="chain" />
            </span>
          </div>
          {addressPositions.error ? (
            <p className="px-6 py-8 text-center text-sm text-error" role="alert">{addressPositions.error}</p>
          ) : !activeHolder ? (
            <p className="px-6 py-8 text-center text-sm text-on-surface-variant">
              Connect a Stellar wallet or enter an address above to inspect on-chain positions.
            </p>
          ) : addressPositions.isLoading ? (
            <p className="px-6 py-8 text-center text-sm text-on-surface-variant" role="status">
              Reading Position entries from the market-core contract…
            </p>
          ) : addressPositions.rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-on-surface-variant">
              {addressPositions.totalMarkets === undefined || addressPositions.totalMarkets === 0n
                ? "No on-chain markets exist yet."
                : "This address holds no position shares on-chain."}
            </p>
          ) : (
            <>
              {addressPositions.rows.length > 0 && !isWatching && wallet.isConnected && (
                <div className="border-b border-outline-variant bg-surface-container/30 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all-positions"
                      aria-label="Select all unarchived positions for storage extension"
                      checked={
                        selectedMarketIds.size > 0 &&
                        selectedMarketIds.size === addressPositions.rows.filter((r) => !r.archived).length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-outline cursor-pointer"
                    />
                    <label htmlFor="select-all-positions" className="font-medium text-on-surface cursor-pointer">
                      Select all
                    </label>
                    {selectedMarketIds.size > 0 && (
                      <span className="text-on-surface-variant font-data-mono ms-1">
                        ({selectedMarketIds.size} selected)
                      </span>
                    )}
                  </div>

                  {selectedMarketIds.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="ttl-horizon-select" className="text-on-surface-variant font-medium">
                        Extend by:
                      </label>
                      <select
                        id="ttl-horizon-select"
                        aria-label="Choose storage extension horizon"
                        value={horizonDays}
                        onChange={(e) => setHorizonDays(Number(e.target.value))}
                        className="rounded border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface font-semibold"
                      >
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>180 days</option>
                      </select>
                      <button
                        type="button"
                        data-testid="keep-alive-btn"
                        disabled={isExtending}
                        onClick={() => void handleKeepAlive()}
                        className="rounded bg-primary px-3 py-1 font-semibold text-on-primary disabled:opacity-50"
                      >
                        {isExtending ? "Extending…" : "Keep alive"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="px-6 py-1.5 text-[11px] text-on-surface-variant border-b border-outline-variant italic">
                Storage extension preserves entry availability on-chain, but does not extend redemption or claim deadlines. Unredeemed shares remain subject to market settlement forfeiture.
              </p>
              {extendError && (
                <p className="px-6 py-2 text-xs text-error border-b border-outline-variant" role="alert">{extendError}</p>
              )}
              {restoreError && (
                <p className="px-6 py-2 text-xs text-error border-b border-outline-variant" role="alert">{restoreError}</p>
              )}
              <ul className="divide-y divide-outline-variant">
                {addressPositions.rows.map((row) => {
                  const settled = row.settlement !== null;
                  const speed = ledgerClock.getLedgerSpeed();
                  const posTtl = row.ttl?.position ? estimateTtl(row.ttl.position, speed) : null;
                  const mktTtl = row.ttl?.market ? estimateTtl(row.ttl.market, speed) : null;
                  let sooner: TtlEstimate | null = null;
                  if (posTtl && mktTtl) {
                    sooner = posTtl.ledgersLeft <= mktTtl.ledgersLeft ? posTtl : mktTtl;
                  } else {
                    sooner = posTtl ?? mktTtl;
                  }
                  const isArchived = row.archived || sooner?.archived;
                  const thresholds = settings.ttlThresholdsDays ?? [30, 7];
                  const [warnHigh, warnCrit] = [Math.max(...thresholds), Math.min(...thresholds)];
                  const daysLeft = sooner ? Math.round(sooner.etaSeconds / 86400) : null;
                  const minDays = sooner ? Math.round(sooner.etaRangeSeconds[0] / 86400) : null;
                  const maxDays = sooner ? Math.round(sooner.etaRangeSeconds[1] / 86400) : null;

                  return (
                    <li key={row.marketId.toString()} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3">
                      <div className="flex items-center gap-3 max-w-xl flex-1 truncate">
                        {!isWatching && wallet.isConnected && !row.archived && (
                          <input
                            type="checkbox"
                            aria-label={`Select market #${row.marketId.toString()} for storage extension`}
                            checked={selectedMarketIds.has(row.marketId.toString())}
                            onChange={() => toggleMarketSelection(row.marketId.toString())}
                            className="rounded border-outline cursor-pointer"
                          />
                        )}
                        <span className="truncate font-body-md text-body-md font-semibold text-on-surface">
                          {row.question ?? `Market #${row.marketId.toString()}`}
                        </span>
                      </div>
                      <span className="font-data-mono text-data-mono text-on-surface-variant">
                        {row.yes > 0n ? `${formatUsdc(row.yes, { maxDecimals: 2, grouping: true })} YES` : ""}
                        {row.yes > 0n && row.no > 0n ? " · " : ""}
                        {row.no > 0n ? `${formatUsdc(row.no, { maxDecimals: 2, grouping: true })} NO` : ""}
                      </span>
                      {row.yesBps !== null && (
                        <span className="font-data-mono text-data-mono text-on-surface-variant">
                          YES {row.yesBps / 100}%
                        </span>
                      )}
                      <span className="font-data-mono text-data-mono font-semibold text-on-background">
                        {row.valueRaw === null ? "—" : `${formatUsdc(row.valueRaw, { maxDecimals: 2, grouping: true })} USDC`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          row.settlement === "yes" || row.settlement === "no"
                            ? "bg-secondary-container text-on-secondary-container"
                            : row.settlement === "void"
                              ? "bg-surface-container-highest text-on-surface-variant"
                              : "bg-primary-container text-on-primary-container"
                        }`}>
                          {settled ? `Settled · ${row.settlement}` : "Open"}
                        </span>
                        <SourceTag source="chain" />
                      </div>
                      {isArchived ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            data-testid={`ttl-needs-restore-${row.marketId}`}
                            className="rounded bg-error-container px-2 py-0.5 text-[10px] font-bold text-tertiary-container"
                          >
                            Needs restore
                          </span>
                          {!isWatching && wallet.isConnected && (
                            <button
                              type="button"
                              data-testid={`restore-entry-${row.marketId}`}
                              disabled={restoringId === row.marketId.toString()}
                              onClick={() => void handleRestoreSingle(row)}
                              className="rounded border border-outline-variant px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-surface-container"
                            >
                              {restoringId === row.marketId.toString() ? "Restoring…" : "Restore"}
                            </button>
                          )}
                        </div>
                      ) : sooner && (row.ttl?.position?.liveUntil !== null || row.ttl?.market?.liveUntil !== null) ? (
                        <span
                          data-testid={`ttl-badge-${row.marketId}`}
                          title={`Storage expires in ~${daysLeft} days (estimated range: ${minDays}–${maxDays} days)`}
                          className={`rounded px-2 py-0.5 text-[10px] ${
                            daysLeft !== null && daysLeft <= warnCrit
                              ? "bg-error/20 font-bold text-error border border-error/40"
                              : daysLeft !== null && daysLeft <= warnHigh
                                ? "bg-warning/20 font-semibold text-warning border border-warning/40"
                                : "font-data-mono text-outline"
                          }`}
                        >
                          Storage expires in ~{daysLeft} days
                        </span>
                      ) : (
                        <span data-testid={`ttl-badge-${row.marketId}`} className="font-data-mono text-[10px] text-outline">
                          Storage expires: unknown
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {reconcileProgress && (
            <div className="border-t border-outline-variant px-6 py-2 flex items-center justify-between text-xs text-on-surface-variant">
              <span>Checking older markets… {reconcileProgress.scanned.toLocaleString()} / {reconcileProgress.total.toLocaleString()}</span>
              <button
                type="button"
                className="underline hover:text-primary ml-2"
                onClick={() => {
                  reconcileAbortRef.current?.abort();
                  setReconcileProgress(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {!reconcileProgress && addressPositions.scanLimited && (
            <p className="border-t border-outline-variant px-6 py-2 text-xs text-on-surface-variant">
              The scan limit was reached; the newest markets were checked first.
            </p>
          )}
        </div>
        {isWatching && (
          <p className="text-[11px] text-on-surface-variant mt-2 italic">
            Note: Trade and transaction history isn&apos;t available for watched addresses yet.
          </p>
        )}
      </section>

      {/* J4: Unified Gateway Balance Widget */}
      <section className="mb-12 bg-primary-container/10 border border-primary/20 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-on-primary">
            <Icon name="account_balance_wallet" />
          </div>
          <div>
            <h3 className="font-headline-sm text-headline-sm">Agent Treasury</h3>
            <p className="text-on-surface-variant text-sm">USDC the agent can trade with, capped on-chain by the treasury contract</p>
          </div>
        </div>
        <div className="flex gap-8">
          <div className="text-center">
            <div className="font-label-caps text-[10px] text-outline mb-1">AVAILABLE (STELLAR TESTNET)</div>
            <div className="font-data-mono font-bold text-lg text-primary">{summary?.availableCapitalRaw ? formatUsdcDisplay(BigInt(summary.availableCapitalRaw)) : "—"}</div>
          </div>
          <div className="w-px h-10 bg-outline-variant self-center"></div>
          <div className="text-center">
            <div className="font-label-caps text-[10px] text-outline mb-1">DEPLOYED (BACKEND RECORD)</div>
            <div className="font-data-mono font-bold text-lg text-secondary">
              {(() => {
                const raw = floatUsdcToRaw(summary?.deployedCapital ?? 0);
                return raw !== null ? formatUsdcDisplay(raw) : "—";
              })()}
            </div>
          </div>
        </div>
      </section>

      <TreasuryRiskLimits backendCapitalRaw={summary?.availableCapitalRaw} />

      <section className="mb-12 rounded-xl border border-outline-variant bg-white p-6 shadow-sm" aria-labelledby="connected-redemptions-title">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 id="connected-redemptions-title" className="font-headline-sm text-headline-sm text-on-surface">
              Connected wallet redemptions
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
              Scan on-chain positions for resolved markets and redeem them one at a time. Each transaction is signed separately by your wallet.
            </p>
            <div className="mt-2">
              <TxReviewPreferenceControl />
            </div>
            {redeemBatch.discovery && (
              <p className="mt-2 text-xs text-on-surface-variant" role="status">
                Scanned {redeemBatch.discovery.scannedMarkets.toString()} of {redeemBatch.discovery.totalMarkets.toString()} markets; found{" "}
                {redeemBatch.discovery.redeemables.length} redeemable position(s).
                {redeemBatch.discovery.scanLimited ? " The scan limit was reached; newer markets were checked first." : ""}
              </p>
            )}
            {redeemBatch.discovery && redeemBatch.discovery.redeemables.length > 0 && (
              <p className="mt-1 text-xs text-on-surface-variant">
                Expected total: {formatUsdc(expectedRedeemTotal, { maxDecimals: 2, grouping: true })} USDC ·
                {" "}{currentRedeemed.length} of {redeemBatch.discovery.redeemables.length} redeemed
                {currentRedeemed.length > 0
                  ? ` (${formatUsdc(redeemedPayoutTotal, { maxDecimals: 2, grouping: true })} USDC received)`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void redeemBatch.scan()}
              disabled={!wallet.isConnected || wallet.isWrongNetwork || redeemBatch.scanning || redeemBatch.running}
              className="rounded border border-outline-variant px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {redeemBatch.scanning ? "Scanning ledger…" : "Scan wallet"}
            </button>
            <button
              type="button"
              onClick={() => void redeemBatch.redeemAll(reviewRedeem)}
              disabled={!wallet.isConnected || wallet.isWrongNetwork || !redeemBatch.discovery?.redeemables.length || redeemBatch.running || redeemBatch.scanning}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Redeem all
            </button>
            {redeemBatch.running ? (
              <button type="button" onClick={redeemBatch.cancel} className="rounded border border-outline-variant px-4 py-2 text-sm font-semibold">
                Stop after current
              </button>
            ) : Object.values(redeemBatch.states).some((item) => item.s === "failed") ? (
              <button
                type="button"
                onClick={() => void redeemBatch.retryFailed(reviewRedeem)}
                className="rounded border border-outline-variant px-4 py-2 text-sm font-semibold"
              >
                Retry failed
              </button>
            ) : null}
          </div>
        </div>

        {!wallet.isConnected && <p className="mt-4 text-sm text-on-surface-variant">Connect a Stellar wallet to scan your positions.</p>}
        {wallet.isWrongNetwork && <p className="mt-4 text-sm text-error">Switch your wallet to {NETWORK_LABEL} to redeem positions.</p>}
        {redeemBatch.error && <p className="mt-4 text-sm text-error" role="alert">{redeemBatch.error}</p>}

        {redeemBatch.discovery && redeemBatch.discovery.redeemables.some((item) => item.archived) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            <span className="font-semibold text-on-surface">
              {redeemBatch.discovery.redeemables.filter((item) => item.archived).length} position(s) are archived and require restoring before redemption.
            </span>
            <button
              type="button"
              data-testid="redeem-restore-archived-btn"
              disabled={redeemBatch.restoring || redeemBatch.running || !wallet.isConnected}
              onClick={() => void redeemBatch.restoreArchived?.(reviewRedeem)}
              className="rounded bg-secondary px-3 py-1 font-semibold text-on-secondary disabled:opacity-50"
            >
              {redeemBatch.restoring ? "Restoring archived…" : "Restore archived first"}
            </button>
          </div>
        )}

        {redeemBatch.discovery && redeemBatch.discovery.redeemables.length > 0 && (
          <ul className="mt-5 divide-y divide-outline-variant rounded border border-outline-variant">
            {redeemBatch.discovery.redeemables.map((item) => {
              const id = item.marketId.toString();
              const itemState = redeemBatch.states[id] ?? { s: "queued" as const };
              const payout = formatUsdc(item.expectedPayout, { maxDecimals: 2, grouping: true });
              return (
                <li key={id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-on-surface">Market #{id} · {item.settlement.toUpperCase()} winner</p>
                    <p className="text-sm text-on-surface-variant">
                      Estimated payout: {payout} USDC
                      {item.archived ? " · archived ledger entry" : ""}
                    </p>
                    {itemState.s === "failed" && <p className="mt-1 text-sm text-error">{itemState.error}</p>}
                    {itemState.s === "redeemed" && <p className="mt-1 text-sm text-secondary">Redeemed · {formatUsdc(itemState.payout, { maxDecimals: 2, grouping: true })} USDC</p>}
                    {itemState.s === "signing" && <p className="mt-1 text-sm text-primary">Waiting for wallet signature…</p>}
                    {itemState.s === "submitting" && <p className="mt-1 text-sm text-primary">Submitted to Stellar…</p>}
                    {itemState.s === "skipped" && <p className="mt-1 text-sm text-on-surface-variant">Skipped</p>}
                  </div>
                  {!redeemBatch.running && itemState.s !== "redeemed" && itemState.s !== "skipped" && (
                    <button
                      type="button"
                      onClick={() => redeemBatch.skip(id)}
                      className="self-start rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant sm:self-center"
                    >
                      Skip
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {redeemBatch.discovery && redeemBatch.discovery.redeemables.length === 0 && (
          <p className="mt-5 text-sm text-on-surface-variant">No resolved positions are ready to redeem.</p>
        )}
        {resumedItems.length > 0 && (
          <div className="mt-5 border-t border-outline-variant pt-4">
            <h3 className="font-label-caps text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Saved batch progress
            </h3>
            <ul className="mt-2 space-y-2 text-sm">
              {resumedItems.map(([id, item]) => (
                <li key={id} className="flex flex-wrap justify-between gap-2">
                  <span>Market #{id}</span>
                  <span className={item.s === "failed" ? "text-error" : item.s === "redeemed" ? "text-secondary" : "text-on-surface-variant"}>
                    {item.s === "redeemed"
                      ? `Redeemed · ${formatUsdc(item.payout, { maxDecimals: 2, grouping: true })} USDC`
                      : item.s === "failed"
                        ? item.error
                        : "Skipped"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Detailed Positions Table */}
      <section className="bg-white border border-outline-variant rounded shadow-sm overflow-hidden mb-12">
        <div className="px-6 py-4 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-container-low gap-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Agent {status === 'OPEN' ? 'Open' : 'Resolved'} Positions</h2>
          <div className="flex items-center gap-4">
            <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant">
              <button 
                onClick={() => setStatus("OPEN")}
                className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "OPEN" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
              >
                Open
              </button>
              <button 
                onClick={() => setStatus("CLOSED")}
                className={`px-4 py-1.5 text-label-caps font-label-caps shadow-sm rounded-md transition-all ${status === "CLOSED" ? "bg-surface text-primary font-bold" : "text-on-surface-variant hover:text-primary"}`}
              >
                Resolved
              </button>
            </div>
          </div>
        </div>
        <div className="px-2 pb-2">
          <DataTable<PositionTableRow>
            caption={status === "OPEN" ? "Open positions" : "Resolved positions"}
            captionHidden
            columns={POSITION_COLUMNS}
            rows={positionRows}
            getRowId={positionRowId}
            loading={isPositionsLoading}
            emptyState="No active positions found."
            rowClassName={(row) => (row.resolved ? "bg-surface-container-highest" : undefined)}
            virtualize={{ estimateSize: 68, restorationKey: "portfolio_positions" }}
          />
        </div>
      </section>

      {/* Performance Log & Reasoning Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <TerminalLog />

        {/* AI Reasoning Sidebar (Oracle Insights) */}
        <aside className="flex flex-col gap-6">
          <div className="bg-surface-container-low border border-outline-variant rounded p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="psychology" filled className="text-primary" />
              <h3 className="font-headline-sm text-headline-sm">Oracle Insight</h3>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4 leading-relaxed">
              The current exposure to &quot;US Fed Rate Cut&quot; represents 42% of active portfolio risk. Sentiment analysis indicates a bullish divergence on Polymarket vs. prediction on Kalshi.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[12px] p-2 bg-white rounded border border-outline-variant">
                <span className="font-bold text-on-surface">Alpha Score</span>
                <span className="text-secondary font-black">8.4/10</span>
              </div>
              <div className="flex justify-between items-center text-[12px] p-2 bg-white rounded border border-outline-variant">
                <span className="font-bold text-on-surface">Risk Level</span>
                <span className="text-tertiary font-black">Moderate</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-outline-variant rounded overflow-hidden shadow-sm group">
            {/* SVG network graph replacing external image */}
            <div className="relative h-40 overflow-hidden bg-on-background">
              <svg
                className="w-full h-full"
                viewBox="0 0 320 160"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Connection lines */}
                <line x1="160" y1="80" x2="60"  y2="40"  stroke="#004655" strokeWidth="0.8" strokeOpacity="0.4" />
                <line x1="160" y1="80" x2="260" y2="35"  stroke="#004655" strokeWidth="0.8" strokeOpacity="0.4" />
                <line x1="160" y1="80" x2="55"  y2="130" stroke="#004655" strokeWidth="0.8" strokeOpacity="0.4" />
                <line x1="160" y1="80" x2="265" y2="125" stroke="#006c49" strokeWidth="0.8" strokeOpacity="0.4" />
                <line x1="160" y1="80" x2="160" y2="20"  stroke="#004655" strokeWidth="0.8" strokeOpacity="0.3" />
                <line x1="60"  y1="40" x2="160" y2="20"  stroke="#004655" strokeWidth="0.5" strokeOpacity="0.2" />
                <line x1="260" y1="35" x2="265" y2="125" stroke="#006c49" strokeWidth="0.5" strokeOpacity="0.2" />
                {/* Animated pulse lines */}
                <line x1="160" y1="80" x2="60"  y2="40"  stroke="#8bd1e8" strokeWidth="1.5" strokeOpacity="0.6">
                  <animate attributeName="stroke-dashoffset" from="0" to="-120" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="stroke-dasharray" values="4 116; 4 116" dur="2s" repeatCount="indefinite" />
                </line>
                <line x1="160" y1="80" x2="265" y2="125" stroke="#4edea3" strokeWidth="1.5" strokeOpacity="0.6">
                  <animate attributeName="stroke-dashoffset" from="0" to="-120" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="stroke-dasharray" values="4 116; 4 116" dur="3s" repeatCount="indefinite" />
                </line>
                {/* Nodes */}
                <circle cx="160" cy="80"  r="9" fill="#005f73" />
                <circle cx="160" cy="80"  r="14" fill="#005f73" fillOpacity="0.2" />
                <circle cx="60"  cy="40"  r="5" fill="#004655" />
                <circle cx="260" cy="35"  r="5" fill="#004655" />
                <circle cx="55"  cy="130" r="5" fill="#006c49" />
                <circle cx="265" cy="125" r="5" fill="#006c49" />
                <circle cx="160" cy="20"  r="4" fill="#004655" />
                <circle cx="100" cy="115" r="3" fill="#6f797c" />
                <circle cx="220" cy="110" r="3" fill="#6f797c" />
                {/* Label */}
                <text x="160" y="84" textAnchor="middle" fontSize="7" fill="#b2ebff" fontFamily="monospace">NODE</text>
                <text x="160" y="91" textAnchor="middle" fontSize="5" fill="#8bd1e8" fontFamily="monospace">0x71C</text>
              </svg>
              {/* Overlay scan line */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none animate-pulse" />
            </div>
            <div className="p-4">
              <h4 className="font-label-caps text-label-caps text-outline mb-2">NETWORK ACTIVITY</h4>
              <div className="flex items-center justify-between">
                <span className="font-body-md text-body-md font-bold">Mainnet Congestion</span>
                <span className="text-secondary font-bold">Low (12 Gwei)</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      {reviewModel && (
        <TxReview
          model={reviewModel.model}
          changedFrom={reviewModel.changedFrom}
          onConfirm={() => closeReview(true)}
          onCancel={() => closeReview(false)}
        />
      )}
      <ExportHistoryDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </main>
  );
}
