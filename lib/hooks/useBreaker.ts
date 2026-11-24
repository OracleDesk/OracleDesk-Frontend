"use client";

import { useQuery } from "@tanstack/react-query";
import { marketCore } from "@/lib/stellar/clients";
import type { BandState, BreakerConfig } from "@/lib/stellar/generated/market-core";
import { measured } from "@/lib/stellar/hooks/telemetry";
import { simulated } from "@/lib/stellar/tx";
import { isCurrentBand } from "@/lib/stellar/breaker";

export interface BreakerStateView {
  config: BreakerConfig | null;
  band: BandState | null;
  ledger: number | null;
  currentBand: boolean;
  supported: boolean;
}

export async function fetchBreakerState(marketId: string | bigint): Promise<BreakerStateView> {
  const id = BigInt(marketId);
  const [configTx, bandTx] = await Promise.all([
    measured("breaker_config", () => marketCore().breaker_config({ market_id: id })),
    measured("breaker_state", () => marketCore().breaker_state({ market_id: id })),
  ]);
  const config = simulated(configTx);
  const band = simulated(bandTx);
  const ledger = typeof bandTx.simulation?.latestLedger === "number" ? bandTx.simulation.latestLedger : null;
  return {
    config,
    band,
    ledger,
    currentBand: ledger !== null && isCurrentBand(band, ledger),
    supported: true,
  };
}

export function useBreaker(marketId: string | bigint, enabled = true) {
  return useQuery<BreakerStateView>({
    queryKey: ["stellar", "breaker", String(marketId)],
    enabled: enabled && marketId !== "" && marketId !== null && marketId !== undefined,
    queryFn: () => fetchBreakerState(marketId),
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
