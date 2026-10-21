"use client";

import React from "react";
import { useViewedAddress } from "@/lib/hooks/useViewedAddress";
import { explorerAccount } from "@/lib/stellar/config";
import { shortAddress } from "@/lib/stellar/units";
import { Eye, ExternalLink, X, AlertCircle } from "lucide-react";

export function ViewingBanner() {
  const { viewed, isWatching, watchError, clearWatch } = useViewedAddress();

  if (watchError) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-900 px-4 py-2.5 text-xs z-50 sticky top-0 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Watch Error:</strong> {watchError}
            </span>
          </div>
          <button
            type="button"
            onClick={clearWatch}
            className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!isWatching || !viewed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-primary/10 border-b border-primary/30 text-on-surface px-4 py-2.5 text-xs z-50 sticky top-0 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary shrink-0" />
          <span>
            Viewing <span className="font-mono font-bold text-primary">{shortAddress(viewed, 6, 4)}</span> in <strong>Watch-Only Mode</strong>.
            {" "}Balances and positions reflect this address; signing is bound to your connected wallet.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={explorerAccount(viewed)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
          >
            Stellar Expert
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={clearWatch}
            className="inline-flex items-center gap-1 font-semibold text-on-primary bg-primary hover:bg-primary/90 px-2.5 py-1 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            Stop watching
          </button>
        </div>
      </div>
    </div>
  );
}
