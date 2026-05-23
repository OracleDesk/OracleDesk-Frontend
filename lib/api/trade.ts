import { apiClient } from "./client";
import type { SettlementCurrency } from "./markets";

export interface CopyTradePayload {
  marketAddress: string | null;
  direction: "YES" | "NO";
  amount: number;
  price: number;
  userWallet: string;
  builderCode: string;
  settlementToken: string;
  estimatedFee: number;
  traceReference: string | null;
}

export interface InitiateCopyTradeParams {
  traceId: string;
  marketId: string;
  amount: number;
  userWallet: string;
}

export interface CopyTradeRecord {
  id: string;
  userId: string;
  traceId: string;
  marketId: string;
  direction: "YES" | "NO";
  amount: number;
  status: "PENDING" | "EXECUTED" | "FAILED";
  builderFee: number;
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

export type { SettlementCurrency };
