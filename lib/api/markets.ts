import { apiClient } from "./client";

export type MarketCategory = "FED" | "ECB" | "ELECTION" | "GEOPOLITICAL" | "CRYPTO" | "MACRO" | "SPORTS" | "ENTERTAINMENT" | "POLITICS";
export type MarketStatus = "PENDING" | "ACTIVE" | "RESOLVING" | "RESOLVED" | "CANCELLED";
/** market-core takes one collateral token; EURC was dropped (docs/api.md). */
export type SettlementCurrency = "USDC";
export type ContractCategory = "Crypto" | "Macro" | "Geopolitics" | "Sports" | "Culture" | "Other";

export type ResolutionSpec =
  | { kind: "signers"; signers: string[]; threshold: number; disputeWindow: number }
  | {
      kind: "price";
      reflector: string;
      asset: { kind: "stellar"; address: string } | { kind: "other"; symbol: string };
      threshold: string;
      direction: "Above" | "AtOrAbove" | "Below" | "AtOrBelow";
      maxStaleness: number;
    };

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
  contractCategory: ContractCategory;
  status: MarketStatus;
  settlementCurrency: SettlementCurrency;
  initialYesProb: number;
  currentYesProb: number | null;
  confidenceInterval: { lower: number; upper: number };
  totalLiquidity: number;
  expiryTimestamp: string;
  /** market-core u64 id as a decimal string; null until created on-chain. */
  onChainMarketId: string | null;
  creationTxHash: string | null;
  seedAmountRaw: string | null;
  questionHash: string | null;
  metaUri: string | null;
  resolutionHash: string | null;
  resolutionSpec: ResolutionSpec | null;
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
  onChainTraceId?: string | null;
  createdAt: string;
}

export interface MarketDetail extends Market {
  reasoningTraces: MarketTracePreview[];
}

export interface ListMarketsParams {
  status?: MarketStatus | "";
  category?: MarketCategory | "";
  currency?: SettlementCurrency | "";
  onChain?: boolean;
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

export async function getMarketByOnChainId(onChainMarketId: string) {
  const { data } = await apiClient.get<MarketDetail>(`/markets/on-chain/${onChainMarketId}`);
  return data;
}

export interface ResolutionStatus {
  marketId: string;
  onChainMarketId: string;
  resolverState: "Unconfigured" | "SignersPending" | "Finalized";
  marketStatus: { tag: "Open" } | { tag: "Resolved"; outcome: "Yes" | "No" } | { tag: "Void" };
  resolutionHash: string | null;
  resolutionSpec: ResolutionSpec | null;
  dbStatus: MarketStatus;
}

export async function getResolution(marketId: string) {
  const { data } = await apiClient.get<ResolutionStatus>(`/oracle/markets/${marketId}/resolution`);
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
    onChainMarketId?: string | null;
    question?: string;
    category?: MarketCategory;
    marketUrl?: string;
    error?: string;
  }>(`/markets/generation-status/${jobId}`);

  return data;
}
