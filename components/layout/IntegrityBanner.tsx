"use client";

import React from "react";
import { useContractIntegrity, type IntegrityResult } from "@/lib/stellar/contract-check";
import { explorerAccount } from "@/lib/stellar/config";
import { AlertTriangle, ShieldAlert, ExternalLink, RefreshCw } from "lucide-react";

export function IntegrityBanner() {
  const { data: integrity, isLoading, refetch, isFetching } = useContractIntegrity();

  if (isLoading || !integrity) {
    return null;
  }

  const results = Object.values(integrity) as IntegrityResult[];
  const failingContracts = results.filter(
    (r) => r.status === "mismatch" || r.status === "not-found" || r.status === "wrong-kind",
  );
  const uncheckedContracts = results.filter((r) => r.status === "unchecked");

  const allNotFound = results.length > 0 && results.every((r) => r.status === "not-found");

  if (failingContracts.length > 0) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full bg-destructive/15 border-b border-destructive/40 text-destructive-foreground px-4 py-3 text-sm z-50 sticky top-0 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-destructive flex items-center gap-2">
                Contract Interface Mismatch · Trading Disabled
              </div>
              <p className="text-on-surface-variant text-xs mt-0.5">
                {allNotFound
                  ? "None of the configured contracts were found on-chain. The Stellar testnet may have been reset. Contact the operator."
                  : "The frontend was built against a different contract specification than what is running on-chain. Contact the operator."}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {failingContracts.map((f) => (
                  <li key={f.contract} className="flex flex-wrap items-center gap-1.5 text-on-surface">
                    <span className="font-mono font-medium text-destructive">{f.contract}:</span>
                    <a
                      href={explorerAccount(f.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      {f.id.slice(0, 6)}…{f.id.slice(-6)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-on-surface-variant">
                      {f.status === "not-found"
                        ? "Instance entry not found on-chain"
                        : f.status === "wrong-kind"
                          ? (f.detail ?? "Executable kind differs")
                          : (f.detail ?? "Contract spec differs")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="self-end md:self-center px-3 py-1.5 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive text-xs font-medium inline-flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Recheck
          </button>
        </div>
      </div>
    );
  }

  if (uncheckedContracts.length > 0) {
    const isArchived = uncheckedContracts.some((u) => u.detail === "archived");
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs z-40 sticky top-0 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isArchived
                ? "Contract entry archived (TTL expired). Reads will attempt state restoration."
                : "Contract integrity check is temporarily unchecked due to RPC connectivity issues. Writes are still enabled."}
            </span>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="text-amber-300 hover:text-amber-100 font-medium inline-flex items-center gap-1 shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
