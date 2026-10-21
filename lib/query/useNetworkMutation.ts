"use client";

import { useEffect, useRef } from "react";
import { useMutation, type DefaultError, type UseMutationOptions } from "@tanstack/react-query";
import { useWalletNetwork } from "@/lib/contexts/WalletContext";

/** Detach the old pending observer when a wallet/network transition cancels a prompt. */
export function useNetworkMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
  const { networkEpoch } = useWalletNetwork();
  const mutation = useMutation(options);
  const previous = useRef(networkEpoch);
  const { reset } = mutation;
  useEffect(() => {
    if (previous.current !== networkEpoch) { previous.current = networkEpoch; reset(); }
  }, [networkEpoch, reset]);
  return mutation;
}
