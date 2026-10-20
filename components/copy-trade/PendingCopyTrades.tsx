"use client";

import { useState } from "react";
import { useCopyTradeOutbox } from "@/lib/hooks/useCopyTrade";
import { useWallet } from "@/lib/contexts/WalletContext";
import { explorerAccount, explorerTx } from "@/lib/stellar/config";
import { formatUsdc } from "@/lib/stellar/units";

export function PendingCopyTrades() {
  const { entries, retry, dismiss, needsSession } = useCopyTradeOutbox();
  const { address, ensureSession } = useWallet();
  const [signingIn, setSigningIn] = useState(false);
  const visible = entries.filter((entry) => !entry.dismissed);
  if (!address || !visible.length) return null;
  const signIn = async () => {
    setSigningIn(true);
    try { if (await ensureSession()) for (const entry of visible) if (entry.needsSession) retry(entry.copyTradeId); }
    finally { setSigningIn(false); }
  };
  const unresolved = visible.filter((entry) => entry.state !== "confirmed");
  return (
    <section aria-label="Copy-trade recording" className="my-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm">
      <h2 className="font-bold">{unresolved.length ? "Unconfirmed copy trades" : "Copy trades recorded"}</h2>
      <p className="mt-1 text-on-surface-variant">Recording a trade does not place another buy.</p>
      {needsSession && <button type="button" disabled={signingIn} onClick={() => void signIn()} className="my-3 rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">
        {signingIn ? "Signing in…" : `Sign in to finish recording ${unresolved.filter((entry) => entry.needsSession).length} copy trades`}
      </button>}
      <ul className="divide-y divide-outline-variant">
        {visible.map((entry) => <li key={entry.copyTradeId} className="py-3">
          <p>Market #{entry.onChainMarketId} · {entry.outcome.toUpperCase()} · {formatUsdc(BigInt(entry.collateralInRaw))} USDC</p>
          <p role="status" className="mt-1">{entry.state === "confirmed" ? "Trade done and recorded." : entry.state === "initiated" ? "No submitted transaction has been recorded yet." : entry.state}</p>
          {entry.lastError && <p className="mt-1 text-on-surface-variant">{entry.lastError}</p>}
          <div className="mt-2 flex flex-wrap gap-4">
            <a href={entry.txHash ? explorerTx(entry.txHash) : explorerAccount(address)} target="_blank" rel="noopener noreferrer" className="underline">{entry.txHash ? "View transaction" : "Check account history"}</a>
            {entry.state !== "confirmed" && <button type="button" disabled={!entry.txHash || entry.state === "mismatch" || entry.state === "abandoned" || entry.needsSession} onClick={() => retry(entry.copyTradeId)} className="underline disabled:opacity-40">Retry recording</button>}
            <button type="button" onClick={() => dismiss(entry.copyTradeId)} className="underline">Dismiss</button>
          </div>
        </li>)}
      </ul>
    </section>
  );
}
