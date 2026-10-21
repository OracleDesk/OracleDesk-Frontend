"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { getMarketByOnChainId } from "@/lib/api/markets";
import { getPaymentEventsWithValidation } from "@/lib/api/traces";
import { useWallet } from "@/lib/contexts/WalletContext";
import { marketCore } from "@/lib/stellar/clients";
import { CONTRACTS, NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import {
  eventTopicFilter,
  fetchContractEvents,
  type RawContractEvent,
} from "@/lib/stellar/events";
import { priceYesBps } from "@/lib/stellar/generated/fpmm";
import {
  encodeCsvChunks,
  serializeExportRow,
  toCsvLines,
  toLedgerIsoTime,
  type ExportMeta,
  type ExportRow,
  type ExportSection,
} from "./export-csv";
import type { ExportWorkerRequest, ExportWorkerResponse } from "./export.worker";
import { replayWithRealizations, type PnlEvent } from "./pnl";

const MAX_RPC_PAGES = 50;
const WORKER_ROW_THRESHOLD = 2_000;
const QUESTION_CONCURRENCY = 4;

async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function parseRawMarketEvent(raw: RawContractEvent) {
  return marketCore().spec.parseEvent(raw.topics, raw.value);
}

export interface ExportRunOptions {
  sections: ExportSection[];
  includeHeaderNotes: boolean;
  excelBom: boolean;
}

export interface ExportEstimate {
  trade: number;
  redeem: number;
  payment: number;
  pnl: number;
}

export function useExportData() {
  const { address, ensureSession } = useWallet();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ExportEstimate | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    activeJobIdRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (workerRef.current && activeJobIdRef.current) {
      const cancelMsg: ExportWorkerRequest = {
        id: activeJobIdRef.current,
        cancel: true,
      };
      workerRef.current.postMessage(cancelMsg);
    }
    cleanupWorker();
    setIsExporting(false);
    setProgress(0);
  }, [cleanupWorker]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupWorker();
    };
  }, [cleanupWorker]);

  const gatherRows = useCallback(
    async (
      sections: readonly ExportSection[],
      signal: AbortSignal,
    ): Promise<{ rows: ExportRow[]; meta: ExportMeta }> => {
      if (!address) {
        throw new Error("Connect a wallet to export history.");
      }

      const wantSet = new Set<ExportSection>(sections);
      const needsChain =
        wantSet.has("trade") || wantSet.has("redeem") || wantSet.has("pnl");
      const needsPayments = wantSet.has("payment");

      let oldestLedger = 0;
      let latestLedger = 0;
      let partialRpc = false;

      const tradeEvents: RawContractEvent[] = [];
      const redeemEvents: RawContractEvent[] = [];
      const resolvedByMarket = new Map<
        string,
        { raw: RawContractEvent; outcome: "YES" | "NO" | null }
      >();

      if (needsChain) {
        const [tradeRead, redeemRead] = await Promise.all([
          fetchContractEvents({
            contractId: CONTRACTS.marketCore,
            topics: eventTopicFilter("Trade", { trader: address }),
            maxPages: MAX_RPC_PAGES,
            signal,
          }),
          fetchContractEvents({
            contractId: CONTRACTS.marketCore,
            topics: eventTopicFilter("Redeemed", { holder: address }),
            maxPages: MAX_RPC_PAGES,
            signal,
          }),
        ]);

        oldestLedger = Math.min(
          tradeRead.window.oldestLedger,
          redeemRead.window.oldestLedger,
        );
        latestLedger = Math.max(
          tradeRead.window.latestLedger,
          redeemRead.window.latestLedger,
        );
        partialRpc = tradeRead.partial || redeemRead.partial;
        tradeEvents.push(...tradeRead.events);
        redeemEvents.push(...redeemRead.events);

        if (wantSet.has("pnl") && redeemEvents.length > 0) {
          const redeemedMarketIds = new Set<bigint>();
          for (const ev of redeemEvents) {
            const parsed = parseRawMarketEvent(ev);
            const mId = parsed?.data?.market_id;
            if (typeof mId === "bigint") {
              redeemedMarketIds.add(mId);
            }
          }
          await mapConcurrent(
            [...redeemedMarketIds],
            QUESTION_CONCURRENCY,
            async (mId) => {
              const resRead = await fetchContractEvents({
                contractId: CONTRACTS.marketCore,
                topics: eventTopicFilter("MarketResolved", { market_id: mId }),
                maxPages: 5,
                signal,
              });
              for (const raw of resRead.events) {
                const parsed = parseRawMarketEvent(raw);
                if (parsed?.name === "MarketResolved") {
                  const tag = (
                    parsed.data.outcome as { tag?: unknown } | null | undefined
                  )?.tag;
                  const outcome =
                    tag === "Yes" ? "YES" : tag === "No" ? "NO" : null;
                  resolvedByMarket.set(String(mId), { raw, outcome });
                }
              }
            },
          );
        }
      }

      // Resolve unique market questions via cached getMarketByOnChainId
      const uniqueMarketIds = new Set<string>();
      const decodedTrades: Array<{
        raw: RawContractEvent;
        marketId: string;
        outcome: "YES" | "NO";
        isBuy: boolean;
        collateral: bigint;
        shares: bigint;
        fee: bigint;
        reserveYes: bigint;
        reserveNo: bigint;
      }> = [];

      for (const raw of tradeEvents) {
        const parsed = parseRawMarketEvent(raw);
        if (parsed?.name !== "Trade") continue;
        const d = parsed.data;
        const outcomeTag = (d.outcome as { tag?: unknown } | undefined)?.tag;
        if (
          typeof d.market_id !== "bigint" ||
          (outcomeTag !== "Yes" && outcomeTag !== "No") ||
          typeof d.is_buy !== "boolean" ||
          typeof d.collateral !== "bigint" ||
          typeof d.shares !== "bigint" ||
          typeof d.fee !== "bigint" ||
          typeof d.reserve_yes !== "bigint" ||
          typeof d.reserve_no !== "bigint"
        ) {
          continue;
        }
        const marketId = String(d.market_id);
        uniqueMarketIds.add(marketId);
        decodedTrades.push({
          raw,
          marketId,
          outcome: outcomeTag === "Yes" ? "YES" : "NO",
          isBuy: d.is_buy,
          collateral: d.collateral,
          shares: d.shares,
          fee: d.fee,
          reserveYes: d.reserve_yes,
          reserveNo: d.reserve_no,
        });
      }

      const decodedRedeems: Array<{
        raw: RawContractEvent;
        marketId: string;
        payout: bigint;
      }> = [];

      for (const raw of redeemEvents) {
        const parsed = parseRawMarketEvent(raw);
        if (parsed?.name !== "Redeemed") continue;
        const d = parsed.data;
        if (typeof d.market_id !== "bigint" || typeof d.payout !== "bigint") {
          continue;
        }
        const marketId = String(d.market_id);
        uniqueMarketIds.add(marketId);
        decodedRedeems.push({
          raw,
          marketId,
          payout: d.payout,
        });
      }

      const questionsByMarketId = new Map<string, string | null>();
      if (uniqueMarketIds.size > 0) {
        await mapConcurrent(
          [...uniqueMarketIds],
          QUESTION_CONCURRENCY,
          async (mId) => {
            signal.throwIfAborted();
            try {
              const market = await queryClient.fetchQuery({
                queryKey: ["market-by-chain-id", mId],
                queryFn: () => getMarketByOnChainId(mId),
                staleTime: 60_000,
              });
              questionsByMarketId.set(mId, market?.question ?? null);
            } catch (err) {
              if (err instanceof ApiError && err.status === 404) {
                questionsByMarketId.set(mId, null);
                return;
              }
              questionsByMarketId.set(mId, null);
            }
          },
        );
      }

      const rows: ExportRow[] = [];

      if (wantSet.has("trade")) {
        for (const t of decodedTrades) {
          rows.push({
            type: "trade",
            time: toLedgerIsoTime(t.raw.ledgerClosedAt),
            ledger: t.raw.ledger,
            txHash: t.raw.txHash,
            eventId: t.raw.id,
            marketId: t.marketId,
            question: questionsByMarketId.get(t.marketId) ?? null,
            side: t.isBuy ? "BUY" : "SELL",
            outcome: t.outcome,
            collateral: t.collateral,
            shares: t.shares,
            fee: t.fee,
            priceAfterBps: priceYesBps(t.reserveYes, t.reserveNo),
          });
        }
      }

      if (wantSet.has("redeem")) {
        for (const r of decodedRedeems) {
          rows.push({
            type: "redeem",
            time: toLedgerIsoTime(r.raw.ledgerClosedAt),
            ledger: r.raw.ledger,
            txHash: r.raw.txHash,
            eventId: r.raw.id,
            marketId: r.marketId,
            question: questionsByMarketId.get(r.marketId) ?? null,
            payout: r.payout,
          });
        }
      }

      let invalidPaymentRows = 0;
      let paymentCount = 0;
      if (needsPayments) {
        signal.throwIfAborted();
        const hasSession = await ensureSession();
        if (hasSession) {
          signal.throwIfAborted();
          const validated = await getPaymentEventsWithValidation();
          invalidPaymentRows = validated.invalidCount;
          paymentCount = validated.events.length;
          for (const p of validated.events) {
            const hasRaw = /^\d+$/.test(p.amountRaw);
            const isoTime = Number.isNaN(Date.parse(p.createdAt))
              ? p.createdAt
              : new Date(Date.parse(p.createdAt)).toISOString();
            rows.push({
              type: "payment",
              time: isoTime,
              txHash: p.txHash,
              kind: p.type,
              status: p.status ?? "CONFIRMED",
              amountRaw: hasRaw ? BigInt(p.amountRaw) : null,
              traceId: p.traceId ?? null,
              note: hasRaw ? "" : "backend did not record a raw amount",
            });
          }
        }
      }

      let pnlCount = 0;
      if (wantSet.has("pnl")) {
        const pnlEvents: PnlEvent[] = [];
        const eventTimeById = new Map<string, string>();

        for (const t of decodedTrades) {
          const iso = toLedgerIsoTime(t.raw.ledgerClosedAt);
          eventTimeById.set(t.raw.id, iso);
          pnlEvents.push({
            kind: "trade",
            marketId: t.marketId,
            ledger: t.raw.ledger,
            id: t.raw.id,
            outcome: t.outcome === "YES" ? "Yes" : "No",
            isBuy: t.isBuy,
            collateral: t.collateral,
            shares: t.shares,
            fee: t.fee,
            time: iso,
          });
        }

        for (const [marketId, res] of resolvedByMarket) {
          const iso = toLedgerIsoTime(res.raw.ledgerClosedAt);
          eventTimeById.set(res.raw.id, iso);
          pnlEvents.push({
            kind: "resolved",
            marketId,
            ledger: res.raw.ledger,
            id: res.raw.id,
            outcome: res.outcome === "YES" ? "Yes" : res.outcome === "NO" ? "No" : "Void",
            time: iso,
          });
        }

        for (const r of decodedRedeems) {
          const iso = toLedgerIsoTime(r.raw.ledgerClosedAt);
          eventTimeById.set(r.raw.id, iso);
          pnlEvents.push({
            kind: "redeem",
            marketId: r.marketId,
            ledger: r.raw.ledger,
            id: r.raw.id,
            payout: r.payout,
            time: iso,
          });
        }

        const { realizations } = replayWithRealizations(pnlEvents);
        pnlCount = realizations.length;
        for (const rel of realizations) {
          rows.push({
            type: "pnl",
            time: rel.time || eventTimeById.get(rel.id) || new Date(0).toISOString(),
            marketId: rel.marketId,
            outcome: rel.outcome,
            realized: rel.realized,
            costRemoved: rel.costRemoved,
            note: rel.note,
          });
        }
      }

      setCounts({
        trade: decodedTrades.length,
        redeem: decodedRedeems.length,
        payment: paymentCount,
        pnl: pnlCount,
      });

      const meta: ExportMeta = {
        wallet: address,
        networkPassphrase: NETWORK_PASSPHRASE,
        marketCoreContractId: CONTRACTS.marketCore,
        generatedAt: new Date().toISOString(),
        oldestLedger,
        latestLedger,
        partialRpc,
        maxPages: MAX_RPC_PAGES,
        invalidPaymentRows,
        paymentCap: 100,
      };

      return { rows, meta };
    },
    [address, ensureSession, queryClient],
  );

  const runExport = useCallback(
    async (opts: ExportRunOptions) => {
      if (!address) {
        setError("Connect a wallet to export history.");
        return;
      }
      if (opts.sections.length === 0) {
        setError("Select at least one section to export.");
        return;
      }

      setError(null);
      setIsExporting(true);
      setProgress(0.05);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { rows, meta } = await gatherRows(
          opts.sections,
          controller.signal,
        );
        controller.signal.throwIfAborted();

        let parts: ArrayBuffer[];
        if (rows.length < WORKER_ROW_THRESHOLD || typeof Worker === "undefined") {
          const lines = toCsvLines(rows, {
            sections: opts.sections,
            meta,
            includeHeaderNotes: opts.includeHeaderNotes,
            excelBom: opts.excelBom,
          });
          parts = encodeCsvChunks(lines, {
            isCancelled: () => controller.signal.aborted,
          });
          setProgress(1);
        } else {
          const jobId = `export-${Date.now()}`;
          activeJobIdRef.current = jobId;
          const worker = new Worker(
            new URL("./export.worker.ts", import.meta.url),
            { type: "module" },
          );
          workerRef.current = worker;

          parts = await new Promise<ArrayBuffer[]>((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
              const msg = event.data;
              if (msg.id !== jobId) return;
              if ("progress" in msg) {
                setProgress(Math.min(0.99, 0.1 + msg.progress * 0.9));
              } else if ("done" in msg && msg.done) {
                resolve(msg.parts);
              } else if ("error" in msg) {
                reject(new Error(msg.error));
              }
            };
            worker.onerror = (err) => {
              reject(new Error(err.message || "CSV worker failed"));
            };
            const req: ExportWorkerRequest = {
              id: jobId,
              sections: opts.sections,
              rows: rows.map(serializeExportRow),
              meta,
              options: {
                includeHeaderNotes: opts.includeHeaderNotes,
                excelBom: opts.excelBom,
              },
            };
            worker.postMessage(req);
          });
          cleanupWorker();
        }

        controller.signal.throwIfAborted();

        const blob = new Blob(parts, { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const datePart = meta.generatedAt.slice(0, 10);
        const filename = `oracledesk-${address.slice(0, 8)}-${datePart}.csv`;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to export history.",
        );
      } finally {
        setIsExporting(false);
        abortRef.current = null;
      }
    },
    [address, cleanupWorker, gatherRows],
  );

  return {
    address,
    isExporting,
    progress,
    error,
    counts,
    runExport,
    cancel,
  };
}
