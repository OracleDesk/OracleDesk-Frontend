"use client";

import { useWalletNetwork } from "@/lib/contexts/WalletContext";
import { NETWORK_LABEL } from "@/lib/stellar/config";

export function NetworkConsistencyBanner() {
  const { rpcNetwork, retryRpcNetwork } = useWalletNetwork();
  if (rpcNetwork.status !== "mismatch" && rpcNetwork.status !== "unreachable") return null;
  return (
    <div role="alert" className="border-b border-error bg-error-container px-6 py-3 text-sm text-on-error-container">
      {rpcNetwork.status === "mismatch"
        ? `The RPC server is on a different network from ${NETWORK_LABEL}. Chain reads and signing are disabled. Contact the operator to correct the RPC configuration.`
        : "Couldn't reach the Stellar network. Check your connection and retry."}
      <button type="button" onClick={() => void retryRpcNetwork()} className="ml-3 underline">Retry network check</button>
    </div>
  );
}
