"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMarkets } from "@/lib/api/markets";
import { useWalletAddress } from "@/lib/contexts/WalletContext";
import { describeError } from "@/lib/stellar/errors";
import { scanHolderPositions, withBackendQuestions } from "@/lib/stellar/my-positions";
import { useMarketCount, stellarKeys } from "@/lib/hooks/useStellar";
import type { ViewedAddress } from "@/lib/stellar/identity";

/**
 * On-chain positions for any holder address, driven by market-core ledger entries.
 */
export function useAddressPositions(holder: ViewedAddress | string | null | undefined) {
  const count = useMarketCount();
  const totalMarkets = count.data;

  const query = useQuery({
    queryKey: stellarKeys.myPositions(holder ?? "", totalMarkets?.toString() ?? "?"),
    enabled: Boolean(holder) && totalMarkets !== undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const scan = await scanHolderPositions(holder as string, totalMarkets as bigint);
      let backend: { onChainMarketId: string | null; question: string }[] = [];
      try {
        const { markets } = await listMarkets({ onChain: true, limit: 500 });
        backend = markets;
      } catch {
        backend = [];
      }
      const questions = new Map(
        withBackendQuestions(scan.positions, backend).map((row) => [row.marketId.toString(), row.question]),
      );
      return {
        ...scan,
        rows: scan.positions.map((position) => ({
          ...position,
          question: questions.get(position.marketId.toString()) ?? null,
        })),
      };
    },
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const totalValueRaw = useMemo(
    () => rows.reduce((total, row) => total + (row.valueRaw ?? 0n), 0n),
    [rows],
  );

  return {
    rows,
    totalValueRaw,
    isLoading: query.isLoading,
    error: query.error ? describeError(query.error).message : null,
    scanLimited: query.data?.scanLimited ?? false,
    totalMarkets,
  };
}

/**
 * The connected wallet's own on-chain positions (issue #50), driven by
 * market-core ledger entries rather than the agent's backend book.
 */
export function useMyPositions() {
  const { address } = useWalletAddress();
  return useAddressPositions(address);
}
