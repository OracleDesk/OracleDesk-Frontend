"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useWallet } from "@/lib/contexts/WalletContext";
import { useUserScope, useUserScopeStore, ScopeChangedError } from "@/lib/query/scope";
import { initiateCopyTrade, confirmCopyTrade } from "@/lib/api/trade";
import { CONTRACTS } from "@/lib/stellar/config";
import { checkTransaction } from "@/lib/stellar/tx-lifecycle";
import { describeError } from "@/lib/stellar/errors";
import { useBuy, type BuyParams, type PreparedBuy } from "./useStellar";
import {
  emptyOutbox, isTerminal, MAX_OUTBOX_ENTRIES, readOutbox, reconcileEntry, refreshOutbox,
  subscribeOutbox, updateOutbox, writeOutbox, type OutboxEntry,
} from "@/lib/copy-trade/outbox";

export { verifyCopyBuy } from "@/lib/copy-trade/outbox";
const inFlight = new Set<string>();

export function useCopyTradeOutbox() {
  const { address } = useWallet();
  const entries = useSyncExternalStore(subscribeOutbox, () => readOutbox(address), emptyOutbox);
  return {
    entries,
    needsSession: entries.some((entry) => entry.needsSession && !isTerminal(entry) && !entry.dismissed),
    retry: (id: string) => { if (address) updateOutbox(address, id, { nextAttemptAt: 0 }); },
    dismiss: (id: string) => { if (address) updateOutbox(address, id, { dismissed: true }); },
  };
}

/** Mounted once in the root layout; panels only observe this persisted store. */
export function useCopyTradeReconciler() {
  const { address, isWrongNetwork, rpcNetwork } = useWallet();
  const scope = useUserScope(); const store = useUserScopeStore();
  useEffect(() => {
    if (!address || isWrongNetwork || rpcNetwork.status === "mismatch") return;
    let live = true;
    const tick = async () => {
      if (!live || document.hidden) return;
      for (const entry of readOutbox(address)) {
        if (!live || isTerminal(entry) || entry.dismissed) continue;
        const id = `${address}:${entry.copyTradeId}`;
        if (inFlight.has(id)) continue;
        inFlight.add(id);
        const ticket = store?.capture(scope);
        try {
          ticket?.assertCurrent();
          const resume = entry.needsSession && scope.sessionId && entry.pausedSessionId !== scope.sessionId;
          if (entry.txHash && !entry.needsSession && entry.nextAttemptAt <= Date.now()) {
            updateOutbox(address, entry.copyTradeId, { state: "confirming" });
          }
          const next = await reconcileEntry(resume ? { ...entry, nextAttemptAt: 0 } : entry, address, {
            now: Date.now, sessionId: scope.sessionId, check: checkTransaction,
            confirm: (copyTradeId, hash) => confirmCopyTrade(copyTradeId, hash, { expectScope: scope, signal: ticket?.signal }),
            assertCurrent: () => { ticket?.assertCurrent(); },
          });
          // Updating address A's outbox is safe even if B connected while the
          // request failed. Never write to the connected account's key here.
          if (next !== entry) {
            const latest = readOutbox(address).find((e) => e.copyTradeId === entry.copyTradeId);
            if (latest && !latest.dismissed && latest.txHash === entry.txHash) updateOutbox(address, entry.copyTradeId, next);
          }
        } catch { /* cancelled scope; the next connection owns the next attempt */ }
        finally { inFlight.delete(id); }
      }
    };
    const wake = () => { void tick(); };
    const timer = window.setInterval(wake, 1_000);
    const first = window.setTimeout(wake, 0);
    const off = subscribeOutbox(wake);
    const onStorage = (event: StorageEvent) => { if (event.key === `oracledesk_copy_outbox:${address}`) refreshOutbox(address); };
    document.addEventListener("visibilitychange", wake); window.addEventListener("storage", onStorage);
    return () => { live = false; clearInterval(timer); clearTimeout(first); off(); document.removeEventListener("visibilitychange", wake); window.removeEventListener("storage", onStorage); };
  }, [address, scope, store, isWrongNetwork, rpcNetwork.status]);
}

export function useCopyTrade() {
  const wallet = useWallet(); const store = useUserScopeStore(); const buy = useBuy();
  const run = async (input: BuyParams & { traceId: string; backendMarketId: string; prepared?: PreparedBuy }) => {
    const trader = wallet.address;
    if (!trader || !(await wallet.ensureSession())) throw new Error("Sign in with your wallet to copy trades.");
    const scope = store?.getSnapshot();
    if (scope && scope.wallet !== trader) throw new ScopeChangedError();
    const ticket = store?.capture(scope);
    ticket?.assertCurrent();
    if (readOutbox(trader).filter((entry) => !isTerminal(entry) && !entry.dismissed).length >= MAX_OUTBOX_ENTRIES) {
      throw new Error("Finish or dismiss a pending copy trade before starting another.");
    }
    const intent = await initiateCopyTrade({ traceId: input.traceId, marketId: input.backendMarketId, amountRaw: input.collateralIn.toString() }, { expectScope: scope, signal: ticket?.signal });
    ticket?.assertCurrent();
    const payload = intent.transactionPayload;
    const entry: OutboxEntry = {
      copyTradeId: intent.copyTradeId, traceId: input.traceId, marketId: input.backendMarketId,
      onChainMarketId: payload.onChainMarketId, outcome: payload.outcome, collateralInRaw: payload.collateralInRaw,
      state: "initiated", txHash: null, attempts: 0, nextAttemptAt: 0, createdAt: Date.now(),
    };
    const durable = writeOutbox(trader, [...readOutbox(trader), entry]);
    // Never sign a changed backend payload without another explicit review.
    if (payload.userWallet !== trader || payload.contractId !== CONTRACTS.marketCore ||
        payload.onChainMarketId !== String(input.marketId) || payload.outcome !== input.outcome || payload.collateralInRaw !== input.collateralIn.toString()) {
      updateOutbox(trader, entry.copyTradeId, { state: "abandoned", lastError: "The server's copy-trade payload changed. Review the trade again." });
      throw new Error("The server's copy-trade payload does not match your reviewed trade.");
    }
    try {
      ticket?.assertCurrent();
      const result = await buy.mutateAsync({ ...input, onSigned: (hash) => {
        updateOutbox(trader, entry.copyTradeId, { state: "signed", txHash: hash.toLowerCase(), nextAttemptAt: 0 });
        input.onSigned?.(hash);
      } });
      updateOutbox(trader, entry.copyTradeId, { state: "signed", txHash: result.txHash, nextAttemptAt: 0,
        lastError: result.txHash ? undefined : "No transaction hash was returned. Check your account history." });
      ticket?.assertCurrent();
      // Chain finality is independent of backend recording. The root worker
      // confirms it without holding up this result or asking for another buy.
      return { ...result, recording: "pending" as const, copyTradeId: entry.copyTradeId, durable };
    } catch (error) {
      const saved = readOutbox(trader).find((e) => e.copyTradeId === entry.copyTradeId);
      if (!saved?.txHash) {
        updateOutbox(trader, entry.copyTradeId, { state: "abandoned", lastError: describeError(error).message });
      } else {
        updateOutbox(trader, entry.copyTradeId, { state: "signed", lastError: "Submission could not be confirmed yet. Checking the saved hash automatically." });
      }
      throw error;
    }
  };
  return { run, phase: buy.phase, isPending: buy.isPending };
}
