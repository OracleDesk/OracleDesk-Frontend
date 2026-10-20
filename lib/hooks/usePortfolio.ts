"use client";

import { useQuery } from "@tanstack/react-query";
import { useUserScope } from "@/lib/query/scope";
import { userKeys, publicKeys } from "@/lib/query/keys";
import {
  getPlatformStats,
  getPortfolio,
  getPositions,
  type ListPositionsParams,
} from "@/lib/api/portfolio";

export function usePortfolio() {
  const scope = useUserScope();
  return useQuery({
    queryKey: userKeys.portfolio(scope),
    queryFn: ({ signal }) => getPortfolio({ expectScope: scope, signal }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function usePositions(params: ListPositionsParams = {}) {
  const scope = useUserScope();
  return useQuery({
    queryKey: userKeys.positions(scope, params),
    queryFn: ({ signal }) => getPositions(params, { expectScope: scope, signal }),
    staleTime: 15_000,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: publicKeys.platformStats,
    queryFn: getPlatformStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
