import { apiClient } from "./client";

export type MarketCategory = "FED" | "ECB" | "ELECTION" | "GEOPOLITICAL" | "CRYPTO" | "MACRO" | "SPORTS" | "ENTERTAINMENT" | "POLITICS";
export type MarketStatus = "PENDING" | "ACTIVE" | "RESOLVING" | "RESOLVED" | "CANCELLED";
export type SettlementCurrency = "USDC" | "EURC";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Market {
  id: string;
  question: string;
  category: MarketCategory;
  status: MarketStatus;
  settlementCurrency: SettlementCurrency;
  initialYesProb: number;
  currentYesProb: number | null;
  confidenceInterval: { lower: number; upper: number };
  totalLiquidity: number;
  expiryTimestamp: string;
  onChainAddress: string | null;
  createdAt: string;
  marketUrl?: string | null;
  reasoningTraces?: MarketTracePreview[];
  _count?: {
    trades?: number;
    reasoningTraces?: number;
    positions?: number;
  };
}

export interface MarketTracePreview {
  id: string;
  agentType: "MARKET_MAKER" | "TRADER";
  edge: number;
  probabilityEstimate: number;
  verified: boolean;
  createdAt: string;
}

export interface MarketDetail extends Market {
  reasoningTraces: MarketTracePreview[];
}

export interface ListMarketsParams {
  status?: MarketStatus | "";
  category?: MarketCategory | "";
  currency?: SettlementCurrency | "";
  page?: number;
  limit?: number;
}

export async function listMarkets(params: ListMarketsParams = {}) {
  const { data, meta } = await apiClient.get<Market[]>("/markets", { ...params });
  return { markets: data, meta: meta as PaginationMeta | undefined };
}

export async function getMarket(id: string) {
  const { data } = await apiClient.get<MarketDetail>(`/markets/${id}`);
  return data;
}

export async function triggerMarketGeneration(params: {
  question: string;
  category: string;
  expiry: string;
}) {
  const { data } = await apiClient.post<{
    jobId: string;
    message: string;
    statusUrl: string;
    hint: string;
  }>("/markets/generate", params);

  return data;
}

export async function getMarketGenerationStatus(jobId: string) {
  const { data } = await apiClient.get<{
    jobId: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    startedAt: string;
    completedAt: string | null;
    elapsedMs: number;
    marketId?: string;
    question?: string;
    category?: MarketCategory;
    marketUrl?: string;
    error?: string;
  }>(`/markets/generation-status/${jobId}`);

  return data;
}
