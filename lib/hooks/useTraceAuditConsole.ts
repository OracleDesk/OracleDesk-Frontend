"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getTraceAudit, runTraceAudit } from "@/lib/api/admin";
import { useScopedMutation } from "@/lib/query/useScopedMutation";
import { userKeys } from "@/lib/query/keys";
import { useUserScope } from "@/lib/query/scope";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import {
  isRegistryTraceReadError,
  readTracesByIds,
  verifyMany,
  type BrowserVerifyResult,
  type RegistryTraceRead,
  type VerifyItem,
} from "@/lib/stellar/market-audit";
import type { GatewayAttempt } from "@/lib/stellar/trace-core";

export interface TraceAuditFilterState {
  status?: string;
  agent?: string;
  market?: string;
  page: number;
  limit: number;
}

const STORAGE_KEY = "oracledesk:trace-audit:v1";

interface StoredBrowserResult {
  outcome: BrowserVerifyResult["outcome"];
  cidCheck: BrowserVerifyResult["cidCheck"];
  computedHash?: string;
  reason?: string;
  attempts?: GatewayAttempt[];
}

function storageKey(): string {
  return `${STORAGE_KEY}:${NETWORK_PASSPHRASE}`;
}

function loadStored(): Record<string, StoredBrowserResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) as Record<string, StoredBrowserResult> : {};
  } catch {
    return {};
  }
}

function saveStored(results: Record<string, StoredBrowserResult>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(), JSON.stringify(results));
  } catch {
    return;
  }
}

function restoreResult(id: string, stored: StoredBrowserResult): BrowserVerifyResult {
  const check = stored.computedHash
    ? stored.outcome === "verified"
      ? { status: "verified" as const, content: null, computedHash: stored.computedHash, attempts: stored.attempts }
      : { status: "mismatch" as const, computedHash: stored.computedHash, attempts: stored.attempts }
    : { status: "unavailable" as const, reason: stored.reason ?? "Unavailable", attempts: stored.attempts };
  return { traceId: id, outcome: stored.outcome, check, cidCheck: stored.cidCheck };
}

function toStored(result: BrowserVerifyResult): StoredBrowserResult {
  const check = result.check;
  return {
    outcome: result.outcome,
    cidCheck: result.cidCheck,
    computedHash: check.status === "unavailable" ? undefined : check.computedHash,
    reason: check.status === "unavailable" ? check.reason : undefined,
    attempts: check.attempts,
  };
}

export function useTraceAudit(filter: TraceAuditFilterState) {
  const scope = useUserScope();
  return useInfiniteQuery({
    queryKey: userKeys.traceAudit(scope, filter),
    queryFn: ({ pageParam, signal }) =>
      getTraceAudit(
        {
          status: filter.status,
          agentId: filter.agent,
          marketId: filter.market,
          page: pageParam,
          limit: filter.limit,
        },
        { expectScope: scope, signal, stepUp: { reason: "view trace audit" } },
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      return meta && meta.page < meta.totalPages ? meta.page + 1 : undefined;
    },
    enabled: Boolean(scope.wallet),
    retry: false,
  });
}

export interface BrowserVerificationJob {
  results: Record<string, BrowserVerifyResult>;
  running: boolean;
  done: number;
  total: number;
  start: (items: readonly VerifyItem[], opts?: { perGatewayLimit?: number; concurrency?: number }) => Promise<void>;
  pause: () => void;
  clear: () => void;
}

export function useBrowserVerification(): BrowserVerificationJob {
  const scope = useUserScope();
  const [results, setResults] = useState<Record<string, BrowserVerifyResult>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const stored = loadStored();
    setResults(Object.fromEntries(Object.entries(stored).map(([id, value]) => [id, restoreResult(id, value)])));
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
  }, [scope.wallet, scope.sessionId, NETWORK_PASSPHRASE]);

  const persist = useCallback((next: Record<string, BrowserVerifyResult>) => {
    saveStored(Object.fromEntries(Object.entries(next).map(([id, value]) => [id, toStored(value)])));
  }, []);

  const pause = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async (
    items: readonly VerifyItem[],
    opts: { perGatewayLimit?: number; concurrency?: number } = {},
  ) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    const remaining = items.filter((item) => !results[item.onChainTraceId]);
    setTotal(remaining.length);
    setDone(0);
    if (remaining.length === 0) return;
    setRunning(true);
    try {
      await verifyMany(remaining, {
        signal: nextController.signal,
        concurrency: opts.concurrency,
        perGatewayLimit: opts.perGatewayLimit,
        onItem: (result) => {
          if (nextController.signal.aborted) return;
          setResults((previous) => {
            const next = { ...previous, [result.traceId]: result };
            persist(next);
            return next;
          });
          setDone((value) => value + 1);
        },
      });
    } finally {
      if (controller.current === nextController) {
        controller.current = null;
        setRunning(false);
      }
    }
  }, [persist, results]);

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setResults({});
    setDone(0);
    setTotal(0);
    saveStored({});
  }, []);

  return { results, running, done, total, start, pause, clear };
}

export interface TraceAuditConsole {
  query: ReturnType<typeof useTraceAudit>;
  trigger: ReturnType<typeof useScopedMutation>;
  verification: BrowserVerificationJob;
  readRegistry: (ids: readonly bigint[]) => Promise<Map<string, RegistryTraceRead>>;
  activeRunId: string | null;
}

export function useTraceAuditConsole(filter: TraceAuditFilterState): TraceAuditConsole {
  const query = useTraceAudit(filter);
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const scope = useUserScope();
  const verification = useBrowserVerification();

  const trigger = useScopedMutation(
    async (_: void, options) => runTraceAudit({ ...options, stepUp: { reason: "run trace audit" } }),
    (data) => setActiveRunId(data.runId),
  );

  const refetch = query.refetch;
  useEffect(() => {
    if (!activeRunId) return;
    const timer = setInterval(() => void refetch(), 5_000);
    return () => clearInterval(timer);
  }, [activeRunId, refetch]);

  useEffect(() => {
    if (!activeRunId) return;
    const pages = query.data?.pages ?? [];
    const latest = pages.at(-1)?.latestRun;
    if (latest?.id !== activeRunId || !latest.finishedAt) return;
    setActiveRunId(null);
    void queryClient.invalidateQueries({ queryKey: userKeys.traceAudit(scope, filter) });
  }, [activeRunId, filter, query.data, queryClient, scope]);

  const readRegistry = useCallback(
    (ids: readonly bigint[]) => readTracesByIds(ids),
    [],
  );

  return { query, trigger, verification, readRegistry, activeRunId };
}

export { isRegistryTraceReadError };
