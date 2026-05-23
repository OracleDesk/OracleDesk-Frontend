"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPaymentEvents,
  getSpendingAllowance,
  getTrace,
  listTraces,
  setSpendingAllowance,
  unlockTrace,
  verifyTrace,
  type ListTracesParams,
  type UnlockType,
} from "@/lib/api/traces";

export function useTraces(params: ListTracesParams = {}) {
  return useQuery({
    queryKey: ["traces", params],
    queryFn: () => listTraces(params),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useTrace(id: string | undefined) {
  return useQuery({
    queryKey: ["trace", id],
    queryFn: () => getTrace(id!),
    enabled: Boolean(id),
  });
}

export function useVerifyTrace() {
  return useMutation({
    mutationFn: (traceId: string) => verifyTrace(traceId),
  });
}

export function useUnlockTrace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      traceId: string;
      txHash: string;
      amount: number;
      type: UnlockType;
    }) => unlockTrace(params.traceId, params.txHash, params.amount, params.type),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trace", variables.traceId] });
      queryClient.invalidateQueries({ queryKey: ["traces"] });
    },
  });
}

export function useSpendingAllowance() {
  return useQuery({
    queryKey: ["trace-allowance"],
    queryFn: getSpendingAllowance,
  });
}

export function useSetSpendingAllowance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setSpendingAllowance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-allowance"] });
    },
  });
}

export function usePaymentEvents() {
  return useQuery({
    queryKey: ["trace-payments"],
    queryFn: getPaymentEvents,
  });
}
