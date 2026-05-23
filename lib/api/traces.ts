import { apiClient } from "./client";
import type { MarketCategory, SettlementCurrency } from "./markets";

export type AgentType = "MARKET_MAKER" | "TRADER";
export type UnlockType = "PER_TRACE" | "DAILY_PASS";

export interface ReasoningSource {
  source: string;
  weight: number;
  signal: string;
}

export interface ReasoningTrace {
  id: string;
  marketId: string;
  agentType: AgentType;
  decisionType: string;
  edge: number;
  probabilityEstimate: number;
  marketProbability: number;
  confidenceInterval: { lower: number; upper: number };
  verified: boolean;
  ipfsCid: string | null;
  previewSources: ReasoningSource[] | null;
  sourcesUsed?: ReasoningSource[];
  betFraction?: number;
  betSizeUsdc?: number;
  hedgeConditions?: string[];
  market: {
    question: string;
    category: MarketCategory;
    settlementCurrency: SettlementCurrency;
  };
  createdAt: string;
}

export interface ListTracesParams {
  agentType?: AgentType | "";
  page?: number;
  limit?: number;
}

export interface TraceVerification {
  verified: boolean;
  storedHash: string;
  computedHash: string;
  ipfsCid?: string;
}

export interface SpendingAllowance {
  id?: string;
  dailyLimit: number;
  perTraceLimit: number;
  currency: SettlementCurrency;
}

export async function listTraces(params: ListTracesParams = {}) {
  const { data, meta } = await apiClient.get<ReasoningTrace[]>("/traces", { ...params });
  return { traces: data, meta };
}

export async function getTrace(id: string) {
  const { data } = await apiClient.get<ReasoningTrace>(`/traces/${id}`);
  return data;
}

export async function verifyTrace(traceId: string) {
  const { data } = await apiClient.post<TraceVerification>("/traces/verify", {
    traceId,
  });

  return data;
}

export async function unlockTrace(
  traceId: string,
  txHash: string,
  amount: number,
  type: UnlockType,
) {
  const { data } = await apiClient.post<{
    subscription: unknown;
    trace: ReasoningTrace;
  }>(`/traces/${traceId}/unlock`, { txHash, amount, type });

  return data;
}

export async function getSpendingAllowance() {
  const { data } = await apiClient.get<SpendingAllowance | null>("/traces/access/allowance");
  return data;
}

export async function setSpendingAllowance(allowance: {
  dailyLimit: number;
  perTraceLimit: number;
  currency?: SettlementCurrency;
}) {
  const { data } = await apiClient.put<SpendingAllowance>("/traces/access/allowance", allowance);
  return data;
}

export async function getPaymentEvents() {
  const { data } = await apiClient.get<unknown[]>("/traces/payments");
  return data;
}
