import { apiClient } from "./client";

/** What the wallet must sign to copy a trace: market_core.buy. */
export interface CopyTradePayload {
  contractId: string;
  onChainMarketId: string;
  outcome: "Yes" | "No";
  collateralInRaw: string;
  userWallet: string;
  traceReference: string | null;
}

export interface InitiateCopyTradeParams {
  traceId: string;
  marketId: string;
  /** 7-decimal USDC base units, as a decimal string. */
  amountRaw: string;
}

export interface CopyTradeRecord {
  id: string;
  userId: string;
  traceId: string;
  marketId: string;
  direction: "YES" | "NO";
  amount: number;
  amountRaw: string | null;
  status: "PENDING" | "EXECUTED" | "FAILED";
  txHash?: string | null;
}

export async function initiateCopyTrade(params: InitiateCopyTradeParams) {
  const { data } = await apiClient.post<{
    copyTradeId: string;
    transactionPayload: CopyTradePayload;
    instructions: string;
  }>("/trade/copy", params);

  return data;
}

export async function confirmCopyTrade(id: string, txHash: string) {
  const { data } = await apiClient.patch<CopyTradeRecord>(`/trade/copy/${id}/confirm`, {
    txHash,
  });

  return data;
}
