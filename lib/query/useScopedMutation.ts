"use client";

import { useEffect, useRef } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { useUserScope, useUserScopeStore, scopeKey, ScopeChangedError, type UserScope } from "./scope";
import type { ApiRequestOptions } from "@/lib/api/client";

/** Abort old requests, discard late results and detach the old observer's spinner. */
export function useScopedMutation<T, V>(
  run: (variables: V, options: ApiRequestOptions) => Promise<T>,
  onSuccess?: (data: T, variables: V, scope: UserScope) => void | Promise<void>,
) {
  const scope = useUserScope();
  const store = useUserScopeStore();
  const mutation = useMutation({
    mutationKey: scopeKey(scope),
    meta: { scope },
    mutationFn: async (variables: V) => {
      const ticket = store?.capture(scope);
      ticket?.assertCurrent();
      try {
        const data = await run(variables, { expectScope: scope, signal: ticket?.signal });
        ticket?.assertCurrent();
        await onSuccess?.(data, variables, scope);
        return data;
      } catch (error) {
        ticket?.assertCurrent();
        throw error;
      }
    },
  });
  const previous = useRef(scope);
  const { reset } = mutation;
  useEffect(() => {
    if (previous.current !== scope) { previous.current = scope; reset(); }
  }, [scope, reset]);
  return { ...mutation, staleScope: mutation.error instanceof ScopeChangedError };
}

export function invalidateUserScope(client: QueryClient, scope: UserScope) {
  return client.invalidateQueries({ queryKey: scopeKey(scope) });
}
