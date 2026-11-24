import { scopeKey, type UserScope } from "./scope";
import type { ListTracesParams } from "@/lib/api/traces";
import type { ListPositionsParams } from "@/lib/api/portfolio";
import type { ListMarketsParams } from "@/lib/api/markets";

// If the backend route uses requireAuth or optionalAuth, use userKeys.
export const userKeys = {
  root: scopeKey,
  trace: (s: UserScope, id?: string) => [...scopeKey(s), "trace", id] as const,
  traces: (s: UserScope, p?: ListTracesParams) => p ? [...scopeKey(s), "traces", p] as const : [...scopeKey(s), "traces"] as const,
  infiniteTraces: (s: UserScope, p: ListTracesParams) => [...scopeKey(s), "traces", "infinite", p] as const,
  allowance: (s: UserScope) => [...scopeKey(s), "trace-allowance"] as const,
  payments: (s: UserScope) => [...scopeKey(s), "trace-payments"] as const,
  positions: (s: UserScope, p: ListPositionsParams) => [...scopeKey(s), "positions", p] as const,
  portfolio: (s: UserScope) => [...scopeKey(s), "portfolio"] as const,
  marketGeneration: (s: UserScope, jobId: string) => [...scopeKey(s), "market-generation", jobId] as const,
  x402Journal: (s: UserScope, network: string, wallet: string | null) => [...scopeKey(s), "x402", "journal", network, wallet] as const,
  adminRoles: (s: UserScope) => [...scopeKey(s), "admin", "roles"] as const,
  adminAdmins: (s: UserScope) => [...scopeKey(s), "admin", "admins"] as const,
  traceAudit: (s: UserScope, p?: { status?: string; page?: number; limit?: number }) =>
    p ? [...scopeKey(s), "admin", "trace-audit", p] as const : [...scopeKey(s), "admin", "trace-audit"] as const,
  adminPermissions: (s: UserScope) => [...scopeKey(s), "admin", "permissions"] as const,
  reconcileRuns: (s: UserScope) => [...scopeKey(s), "admin", "reconciliation", "runs"] as const,
  reconcileRun: (s: UserScope, id: string) => [...scopeKey(s), "admin", "reconciliation", "runs", id] as const,
};
export const publicKeys = {
  markets: (p: ListMarketsParams) => ["markets", p] as const,
  market: (id?: string) => ["market", id] as const,
  platformStats: ["platform-stats"] as const,
};
