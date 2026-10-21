"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";

export interface UserScope { wallet: string | null; sessionId: string | null }
export const anonymousScope: UserScope = { wallet: null, sessionId: null };
export const scopeKey = (s: UserScope) => ["scope", s.wallet ?? "-", s.sessionId ?? "-"] as const;
export const sameScope = (a: UserScope, b: UserScope) => a.wallet === b.wallet && a.sessionId === b.sessionId;

export class ScopeChangedError extends Error {
  readonly staleScope = true;
  readonly code = "SCOPE_CHANGED";
  constructor() { super("Your account changed; this result was not applied."); }
}

/** One per provider. Transitions happen synchronously before subscribers render. */
export class UserScopeStore {
  private scope = anonymousScope;
  private epoch = 0;
  private controller = new AbortController();
  private listeners = new Set<() => void>();
  constructor(private readonly client: QueryClient) {}
  getSnapshot = () => this.scope;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  capture(scope = this.scope) {
    const epoch = this.epoch;
    return {
      signal: this.controller.signal,
      assertCurrent: () => {
        if (epoch !== this.epoch || !sameScope(scope, this.scope)) throw new ScopeChangedError();
      },
    };
  }
  resetUserScope(next: UserScope, reason: "disconnect" | "account-change" | "token-invalid" | "signed-in") {
    if (sameScope(this.scope, next)) return;
    const previous = this.scope;
    this.epoch++;
    this.controller.abort();
    this.controller = new AbortController();
    // cancelQueries initiates cancellation synchronously. Remove before publishing
    // the new identity; a late fetch cannot recreate a removed query.
    void this.client.cancelQueries({ queryKey: scopeKey(previous) });
    this.client.removeQueries({ queryKey: scopeKey(previous) });
    if (reason !== "signed-in") {
      void this.client.cancelQueries({ queryKey: ["stellar"] });
      this.client.removeQueries({ queryKey: ["stellar"] });
    }
    for (const mutation of this.client.getMutationCache().getAll()) {
      const scope = mutation.meta?.scope as UserScope | undefined;
      if (scope && sameScope(scope, previous)) this.client.getMutationCache().remove(mutation);
    }
    this.scope = next;
    this.listeners.forEach((listener) => listener());
  }
}

export const UserScopeContext = createContext<UserScopeStore | null>(null);
export function useUserScopeStore() { return useContext(UserScopeContext); }
export function useUserScope(): UserScope {
  const store = useUserScopeStore();
  return useSyncExternalStore(store?.subscribe ?? (() => () => {}), store?.getSnapshot ?? (() => anonymousScope), () => anonymousScope);
}
