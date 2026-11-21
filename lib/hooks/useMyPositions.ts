"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMarkets } from "@/lib/api/markets";
import { useWalletAddress } from "@/lib/contexts/WalletContext";
import { describeError } from "@/lib/stellar/errors";
import { readHolderPositions, withBackendQuestions } from "@/lib/stellar/my-positions";
import { getIndex, seedIndex } from "@/lib/stellar/wallet-market-index";
import { useMarketCount, stellarKeys } from "@/lib/hooks/useStellar";
import type { ViewedAddress } from "@/lib/stellar/identity";

export interface PositionsCoverage {
  eventsFromLedger: number;
  reconciledThrough: string | null;
  complete: boolean;
}

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
      let index = await getIndex(holder as string);
      if (!index) {
        index = await seedIndex(holder as string);
      }
      const ids = index.marketIds.map(BigInt);
      const positions = await readHolderPositions(holder as string, ids);
      let backend: { onChainMarketId: string | null; question: string }[] = [];
      try {
        const { markets } = await listMarkets({ onChain: true, limit: 500 });
        backend = markets;
      } catch {
        backend = [];
      }
      const questions = new Map(
        withBackendQuestions(positions, backend).map((row) => [row.marketId.toString(), row.question]),
      );
      const isComplete =
        index.reconciled.completedAt !== null ||
        (totalMarkets !== undefined && BigInt(index.marketIds.length) >= totalMarkets);
      const coverage: PositionsCoverage = {
        eventsFromLedger: index.seededFromLedger,
        reconciledThrough: index.reconciled.throughMarketId,
        complete: isComplete,
      };
      return {
        positions,
        coverage,
        scanLimited: !isComplete,
        rows: positions.map((position) => ({
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
    coverage: query.data?.coverage ?? { eventsFromLedger: 0, reconciledThrough: null, complete: false },
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
