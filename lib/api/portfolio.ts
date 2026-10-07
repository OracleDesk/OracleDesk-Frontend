import { apiClient } from "./client";
import type { MarketCategory, SettlementCurrency } from "./markets";

export interface PortfolioSummary {
  totalUsdc: number;
  deployedCapital: number;
  availableCapital: number;
  openPositions: number;
  totalPnl: number;
  dailyPnl: number;
  builderFeesEarned: number;
  correlationRisk: unknown;
  /** treasury.available_capital() read live; null if the read failed. */
  availableCapitalRaw: string | null;
}

export interface PlatformStats {
  subscriberCount: number;
  totalCopyVolume: number;
  builderFees: number;
  marketCount: number;
  onChainMarketCount: number;
  traceCount: number;
}

export interface Position {
  id: string;
  marketId: string;
  tradeId: string | null;
  status: "OPEN" | "CLOSED" | "STOP_LOSS" | "HEDGED";
  direction: "YES" | "NO";
  /** Position size in USDC (display). The backend field is `size`. */
  size: number;
  entryPrice: number;
  currentPrice: number | null;
  pnl: number | null;
  createdAt: string;
  market: {
    question: string;
    category: MarketCategory;
    settlementCurrency: SettlementCurrency;
    expiryTimestamp: string;
    onChainMarketId: string | null;
  };
  trade?: {
    direction: "YES" | "NO";
    amount: number;
    edgeDetected: number;
    kellyFraction: number;
    txHash: string | null;
  } | null;
}

export interface ListPositionsParams {
  status?: Position["status"] | "";
  page?: number;
  limit?: number;
}

export async function getPortfolio() {
  const { data } = await apiClient.get<PortfolioSummary>("/portfolio");
  return data;
}

export async function getPositions(params: ListPositionsParams = {}) {
  const { data, meta } = await apiClient.get<Position[]>("/portfolio/positions", { ...params });
  return { positions: data, meta };
}

export async function getPlatformStats() {
  const { data } = await apiClient.get<PlatformStats>("/portfolio/stats");
  return data;
}
