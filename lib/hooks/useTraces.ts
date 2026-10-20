"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserScope } from "@/lib/query/scope";
import { userKeys } from "@/lib/query/keys";
import { useScopedMutation } from "@/lib/query/useScopedMutation";
import {
  getPaymentEvents,
  getSpendingAllowance,
  getTrace,
  listTraces,
  setSpendingAllowance,
  unlockDailyPass,
  verifyTrace,
  type ListTracesParams,
} from "@/lib/api/traces";
import { useWallet } from "@/lib/contexts/WalletContext";

export function useTraces(params: ListTracesParams = {}) {
  const scope = useUserScope();
  return useQuery({
    queryKey: userKeys.traces(scope, params),
    queryFn: ({ signal }) => listTraces(params, { expectScope: scope, signal }),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/** Newest-first trace feed with cursorless page-number pagination; stops when
 * the backend omits pagination meta or the last page is exhausted. */
export function useInfiniteTraces(params: Omit<ListTracesParams, "page"> = {}) {
  const scope = useUserScope();
  return useInfiniteQuery({
    queryKey: userKeys.infiniteTraces(scope, params),
    queryFn: ({ pageParam, signal }) => listTraces({ ...params, page: pageParam }, { expectScope: scope, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      if (!meta || meta.page >= meta.totalPages) return undefined;
      return meta.page + 1;
    },
    staleTime: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useTrace(id: string | undefined) {
  const scope = useUserScope();
  return useQuery({
    queryKey: userKeys.trace(scope, id),
    queryFn: ({ signal }) => getTrace(id!, { expectScope: scope, signal }),
    enabled: Boolean(id),
  });
}

export function useVerifyTrace() {
  return useScopedMutation((traceId: string, options) => verifyTrace(traceId, options));
}

export function useUnlockTrace() {
  const queryClient = useQueryClient();

  return useScopedMutation(
    (params: { traceId: string; txHash: string; amountRaw: string }, options) =>
      unlockDailyPass(params.traceId, params.txHash, params.amountRaw, options),
    (_data, variables, scope) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.trace(scope, variables.traceId) });
      void queryClient.invalidateQueries({ queryKey: userKeys.traces(scope) });
      void queryClient.invalidateQueries({ queryKey: userKeys.payments(scope) });
    },
  );
}

export function useSpendingAllowance() {
  const scope = useUserScope();
  const { address, isAuthenticated } = useWallet();
  return useQuery({
    queryKey: userKeys.allowance(scope),
    queryFn: ({ signal }) => getSpendingAllowance({ expectScope: scope, signal }),
    enabled: Boolean(address && isAuthenticated),
  });
}

export function useSetSpendingAllowance() {
  const queryClient = useQueryClient();
  return useScopedMutation(
    (next: Parameters<typeof setSpendingAllowance>[0], options) => setSpendingAllowance(next, options),
    (_data, _next, scope) => { void queryClient.invalidateQueries({ queryKey: userKeys.allowance(scope) }); },
  );
}

export function usePaymentEvents() {
  const scope = useUserScope();
  const { address, isAuthenticated } = useWallet();
  return useQuery({
    queryKey: userKeys.payments(scope),
    queryFn: ({ signal }) => getPaymentEvents({ expectScope: scope, signal }),
    enabled: Boolean(address && isAuthenticated),
  });
}
