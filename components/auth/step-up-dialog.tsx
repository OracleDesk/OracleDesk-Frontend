"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { registerStepUpHandler } from "@/lib/auth/step-up";
import { stepUpWithWallet } from "@/lib/api/auth";
import { shortAddress } from "@/lib/stellar/units";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { useWalletAddress, useWalletNetwork, useWalletSigner } from "@/lib/stellar/WalletProvider";
import { useUserScopeStore } from "@/lib/query/scope";
import type { StepUpRequest, StepUpResult } from "@/lib/auth/step-up";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiveRegion } from "@/components/ui/live-region";

/** Mounted once in the wallet provider; answers scoped step-up prompts. */
export function StepUpDialog() {
  const address = useWalletAddress();
  const signer = useWalletSigner();
  const { isWrongNetwork } = useWalletNetwork();
  const scopeStore = useUserScopeStore();
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((result: StepUpResult) => void) | null>(null);

  const dismiss = useCallback((result: StepUpResult) => {
    setRequest(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
  }, []);

  useEffect(() => registerStepUpHandler(async (req: StepUpRequest) => {
    const scope = scopeStore?.getSnapshot();
    if (!address || !signer || address !== req.wallet || isWrongNetwork ||
        req.networkPassphrase !== NETWORK_PASSPHRASE ||
        !scope || scope.wallet !== req.wallet || scope.sessionId !== req.sessionId) {
      return "cancelled";
    }
    return await new Promise<StepUpResult>((resolve) => {
      resolver.current = resolve;
      setRequest(req);
    });
  }), [address, signer, isWrongNetwork, scopeStore]);

  useEffect(() => {
    if (!request) return;
    const onAbort = () => dismiss("cancelled");
    request.signal.addEventListener("abort", onAbort);
    return () => request.signal.removeEventListener("abort", onAbort);
  }, [request, dismiss]);

  const confirm = async () => {
    if (!request || !signer) return;
    setBusy(true);
    try {
      const signTransaction = async (xdr: string, networkPassphrase: string): Promise<string> => {
        if (networkPassphrase !== request.networkPassphrase) throw new Error("Network changed");
        const signed = await signer.signTransaction(xdr, { networkPassphrase: request.networkPassphrase });
        return typeof signed === "string" ? signed : (signed as { signedTxXdr: string }).signedTxXdr;
      };
      await stepUpWithWallet(
        { wallet: request.wallet, sessionId: request.sessionId },
        signTransaction,
        request.signal,
      );
      dismiss("ok");
    } catch {
      dismiss("cancelled");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <LiveRegion message={request ? `Confirm it's you to ${request.reason}.` : ""} />
      <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) dismiss("cancelled"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it&apos;s you</DialogTitle>
            <DialogDescription>
              {request ? `Additional wallet authentication is required to ${request.reason}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-on-surface-variant">
            <p>{request ? shortAddress(request.wallet) : ""}</p>
            <p>Your wallet will ask you to sign a login challenge. No funds move and no transaction is submitted.</p>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => dismiss("cancelled")} disabled={busy}>Cancel</button>
            <button type="button" onClick={() => void confirm()} disabled={busy}>
              {busy ? "Waiting for wallet…" : "Sign with wallet"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
