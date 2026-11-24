"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { RequireWallet } from "@/components/require-wallet";
import { SafeTraceViewer } from "@/components/safe-trace-viewer";
import { VirtualList } from "@/components/ui/virtual-list";
import { useAdminPermissions } from "@/lib/admin/useAdminPermissions";
import { compare, type BrowserResult, type Disagreement } from "@/lib/admin/trace-audit-compare";
import type { TraceAuditFinding } from "@/lib/api/admin";
import { useWallet } from "@/lib/contexts/WalletContext";
import {
  useTraceAuditConsole,
  type TraceAuditFilterState,
} from "@/lib/hooks/useTraceAuditConsole";
import { csvCell } from "@/lib/portfolio/export-csv";
import { CONTRACTS, NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { shortAddress } from "@/lib/stellar/units";
import {
  isRegistryTraceReadError,
  type BrowserVerifyResult,
  type RegistryTraceRead,
  type VerifyItem,
} from "@/lib/stellar/market-audit";

const PAGE_SIZE = 50;
const MAX_FILTER_VERIFY = 200;

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : value;
}

function browserResult(result?: BrowserVerifyResult): BrowserResult | null {
  if (!result) return null;
  const check = result.check;
  return {
    outcome: result.outcome,
    computedHash: check.status === "unavailable" ? null : check.computedHash,
    cidCheck: result.cidCheck,
    statusCode: check.attempts?.find((attempt) => attempt.status)?.status,
  };
}

function registryOutcome(read?: RegistryTraceRead): BrowserResult["outcome"] | null {
  if (!read || !isRegistryTraceReadError(read)) return null;
  return read.error === "archived" ? "archived" : "not-on-chain";
}

function disagreementText(value: Disagreement | null): string {
  return value ? `${value.severity}: ${value.message}` : "—";
}

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function findingToItem(finding: TraceAuditFinding): VerifyItem | null {
  if (!finding.onChainTraceId || !finding.ipfsCid || !finding.onChainHash) return null;
  return {
    onChainTraceId: finding.onChainTraceId,
    ipfsCid: finding.ipfsCid,
    traceHash: finding.onChainHash,
    agent: finding.agent ?? undefined,
  };
}

export default function TraceAuditPage() {
  return (
    <RequireWallet
      title="Restricted Access"
      description="The trace audit console requires a secure wallet connection."
    >
      <TraceAuditContent />
    </RequireWallet>
  );
}

function TraceAuditContent() {
  const { address } = useWallet();
  const { can, isLoading: permissionsLoading } = useAdminPermissions();
  const [filter, setFilter] = useState<TraceAuditFilterState>({ page: 1, limit: PAGE_SIZE });
  const [selected, setSelected] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [registryReads, setRegistryReads] = useState<Record<string, RegistryTraceRead>>({});
  const consoleState = useTraceAuditConsole(filter);

  const findings = useMemo(
    () => consoleState.query.data?.pages.flatMap((page) => page.findings) ?? [],
    [consoleState.query.data],
  );
  const latestRun = consoleState.query.data?.pages.at(-1)?.latestRun ?? null;
  const counts = consoleState.query.data?.pages.at(-1)?.counts ?? {};
  const runFindings = findings.filter((finding) => latestRun && finding.runId === latestRun.id);
  const runCounts = runFindings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.status] = (acc[finding.status] ?? 0) + 1;
    return acc;
  }, {});

  const visible = findings.filter((finding) =>
    (!filter.agent || finding.agent === filter.agent) &&
    (!filter.market || finding.onChainMarketId === filter.market)
  );

  const selectedFinding = findings.find((finding) => finding.onChainTraceId === selected) ?? null;
  const selectedBrowser = selected ? consoleState.verification.results[selected] : undefined;
  const selectedBrowserResult = browserResult(selectedBrowser);
  const selectedDisagreement = selectedFinding
    ? compare(selectedFinding, selectedBrowserResult ?? {
        outcome: registryOutcome(registryReads[selected ?? ""]) ?? "unavailable",
        cidCheck: "unsupported",
      })
    : null;

  if (permissionsLoading) {
    return <main className="flex-grow flex items-center justify-center p-gutter"><p className="animate-pulse text-on-surface-variant">Resolving authorization…</p></main>;
  }

  if (!can("trace_audit.run")) {
    return (
      <main className="flex-grow flex items-center justify-center p-gutter">
        <div className="max-w-md w-full text-center space-y-3 bg-white p-10 rounded-xl border border-outline-variant">
          <h1 className="font-headline-md text-headline-md">Access Denied</h1>
          <p className="text-on-surface-variant">Your wallet is not authorized to run the trace audit console.</p>
          <p className="font-data-mono text-xs break-all text-on-surface-variant">{address}</p>
        </div>
      </main>
    );
  }

  const startVerification = async (items: readonly VerifyItem[]) => {
    const unique = [...new Map(items.map((item) => [item.onChainTraceId, item])).values()];
    if (unique.length) await consoleState.verification.start(unique, { perGatewayLimit: 2, concurrency: 4 });
  };

  const verifyRange = async () => {
    try {
      const from = BigInt(rangeFrom);
      const to = BigInt(rangeTo);
      if (from > to || to - from > 1_000n) throw new Error("Use a range of at most 1,001 ids.");
      const ids: bigint[] = [];
      for (let id = from; id <= to; id += 1n) ids.push(id);
      const reads = await consoleState.readRegistry(ids);
      setRegistryReads((previous) => ({ ...previous, ...Object.fromEntries(reads) }));
      const items = [...reads.values()]
        .filter((read): read is Extract<RegistryTraceRead, { ipfsCid: string }> => !isRegistryTraceReadError(read))
        .map((trace) => ({
          onChainTraceId: trace.onChainTraceId,
          ipfsCid: trace.ipfsCid,
          traceHash: trace.traceHash,
          agent: trace.agent,
        }));
      await startVerification(items);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Invalid id range");
    }
  };

  const reportRows = visible.map((finding) => {
    const browser = browserResult(consoleState.verification.results[finding.onChainTraceId ?? ""]);
    return {
      onChainTraceId: finding.onChainTraceId,
      traceId: finding.traceId,
      marketId: finding.onChainMarketId,
      agent: finding.agent,
      action: finding.action,
      backendStatus: finding.status,
      backendHash: finding.computedHash,
      onChainHash: finding.onChainHash,
      browserOutcome: browser?.outcome ?? null,
      browserHash: browser?.computedHash ?? null,
      disagreement: disagreementText(compare(finding, browser ?? { outcome: "unavailable", cidCheck: "unsupported" })),
    };
  });

  const exportJson = () => download(
    "trace-audit-discrepancies.json",
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      network: NETWORK_PASSPHRASE,
      contracts: CONTRACTS,
      latestRunId: latestRun?.id ?? null,
      items: reportRows,
    }, null, 2),
    "application/json",
  );

  const exportCsv = () => {
    const header = [
      "onChainTraceId", "traceId", "marketId", "agent", "action", "backendStatus",
      "backendHash", "onChainHash", "browserOutcome", "browserHash", "disagreement",
    ];
    const rows = reportRows.map((row) => [
      row.onChainTraceId ?? null, row.traceId ?? null, row.marketId ?? null, row.agent ?? null,
      row.action ?? null, row.backendStatus, row.backendHash ?? null, row.onChainHash ?? null,
      row.browserOutcome, row.browserHash ?? null, row.disagreement,
    ].map(csvCell).join(","));
    download("trace-audit-discrepancies.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  };

  const activeAttempts = selectedBrowser?.check.attempts ?? [];

  return (
    <main className="flex-grow max-w-container-max-width mx-auto px-gutter py-12 w-full space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-primary text-label-caps hover:underline">← Admin</Link>
          <h1 className="font-headline-lg text-headline-lg mt-2">Trace audit console</h1>
          <p className="text-on-surface-variant text-sm">Cross-check backend findings against in-browser verification.</p>
        </div>
        <button
          type="button"
          className="bg-primary text-on-primary rounded-lg px-5 py-2.5 font-label-caps disabled:opacity-50"
          disabled={consoleState.trigger.isPending || Boolean(consoleState.activeRunId)}
          onClick={() => void consoleState.trigger.mutateAsync()}
        >
          {consoleState.trigger.isPending || consoleState.activeRunId ? "Running…" : "Run audit"}
        </button>
      </header>

      <section className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm space-y-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Status</span>
            <select
              className="w-full border rounded-md p-2"
              value={filter.status ?? ""}
              onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value || undefined, page: 1 }))}
            >
              <option value="">All</option>
              {Object.keys(TRACE_STATUSES).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Agent</span>
            <input className="w-full border rounded-md p-2" placeholder="G…" value={filter.agent ?? ""}
              onChange={(event) => setFilter((current) => ({ ...current, agent: event.target.value || undefined }))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Market id</span>
            <input className="w-full border rounded-md p-2" placeholder="0" value={filter.market ?? ""}
              onChange={(event) => setFilter((current) => ({ ...current, market: event.target.value || undefined }))} />
          </label>
        </div>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <button type="button" className="border rounded-md px-3 py-1.5" onClick={() => void startVerification(visible.map(findingToItem).filter((item): item is VerifyItem => Boolean(item)))}>
            Verify this page
          </button>
          <button type="button" className="border rounded-md px-3 py-1.5" onClick={() => void startVerification(visible.slice(0, MAX_FILTER_VERIFY).map(findingToItem).filter((item): item is VerifyItem => Boolean(item)))}>
            Verify filter (up to {MAX_FILTER_VERIFY})
          </button>
          <input className="border rounded-md p-1.5 w-28" placeholder="From id" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} />
          <input className="border rounded-md p-1.5 w-28" placeholder="To id" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} />
          <button type="button" className="border rounded-md px-3 py-1.5" onClick={() => void verifyRange()}>Verify id range</button>
          {consoleState.verification.running && <button type="button" className="border rounded-md px-3 py-1.5" onClick={consoleState.verification.pause}>Pause</button>}
          <button type="button" className="border rounded-md px-3 py-1.5" onClick={exportJson}>Export JSON</button>
          <button type="button" className="border rounded-md px-3 py-1.5" onClick={exportCsv}>Export CSV</button>
        </div>
        {consoleState.verification.total > 0 && (
          <div className="space-y-1">
            <div className="h-2 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (consoleState.verification.done / consoleState.verification.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              {consoleState.verification.done}/{consoleState.verification.total} browser checks
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
          <h2 className="font-headline-sm text-headline-sm mb-3">Latest run</h2>
          {latestRun ? (
            <dl className="text-sm space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Run</dt><dd className="font-data-mono">{latestRun.id}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Started</dt><dd>{formatTime(latestRun.startedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Finished</dt><dd>{formatTime(latestRun.finishedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Cursor</dt><dd className="font-data-mono">{latestRun.cursorTraceId ?? "—"}</dd></div>
            </dl>
          ) : <p className="text-sm text-on-surface-variant">No audit run yet.</p>}
        </div>
        <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
          <h2 className="font-headline-sm text-headline-sm mb-3">Counts</h2>
          <p className="text-xs text-on-surface-variant mb-2">This run: non-verified findings only. All time: backend cumulative.</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(counts).sort().map(([status, count]) => (
              <div key={status} className="flex justify-between gap-2 border-b border-outline-variant pb-1">
                <span>{status}</span><span className="font-data-mono">{runCounts[status] ?? 0} / {count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-outline-variant flex justify-between items-center">
          <h2 className="font-headline-sm text-headline-sm">Findings</h2>
          <span className="text-xs text-on-surface-variant">{visible.length} loaded</span>
        </div>
        <VirtualList
          items={visible}
          ariaLabel="Trace audit findings"
          getKey={(finding, index) => finding.id ?? finding.onChainTraceId ?? String(index)}
          estimateSize={() => 76}
          renderItem={(finding, _index, a11y) => {
            const browser = browserResult(consoleState.verification.results[finding.onChainTraceId ?? ""]);
            const disagreement = compare(finding, browser ?? { outcome: "unavailable", cidCheck: "unsupported" });
            return (
              <button
                type="button"
                {...a11y}
                onClick={() => setSelected(finding.onChainTraceId ?? finding.id)}
                className="w-full text-left px-6 py-4 border-b border-outline-variant hover:bg-surface-container-low flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"
              >
                <span className="font-data-mono w-28 shrink-0">{finding.onChainTraceId ? shortAddress(finding.onChainTraceId) : "n/a"}</span>
                <span className="w-40 shrink-0">{finding.status}</span>
                <span className="w-36 shrink-0">{finding.agent ? shortAddress(finding.agent) : "—"}</span>
                <span className="flex-1 min-w-[160px]">{disagreementText(disagreement)}</span>
                <span className="font-data-mono text-xs">{browser?.outcome ?? "not checked"}</span>
              </button>
            );
          }}
        />
        {consoleState.query.hasNextPage && (
          <div className="p-4 text-center">
            <button type="button" className="border rounded-md px-4 py-2 text-sm" onClick={() => void consoleState.query.fetchNextPage()}>
              Load more
            </button>
          </div>
        )}
      </section>

      {selectedFinding && (
        <section className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="font-headline-sm text-headline-sm">Trace {selectedFinding.onChainTraceId ?? selectedFinding.traceId}</h2>
              <p className="text-xs text-on-surface-variant">CID {selectedFinding.ipfsCid ?? "—"}</p>
            </div>
            <button type="button" className="text-sm text-primary" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-1">Backend detail</h3>
              <pre className="bg-surface-container-low rounded-lg p-3 overflow-auto text-xs">{JSON.stringify(selectedFinding.detail ?? {}, null, 2)}</pre>
            </div>
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-1">Comparison</h3>
              <p>{disagreementText(selectedDisagreement)}</p>
              <p className="text-xs text-on-surface-variant mt-1">Hashes: backend {selectedFinding.computedHash ?? "—"} / browser {browserResult(selectedBrowser)?.computedHash ?? "—"}</p>
            </div>
          </div>
          {activeAttempts.length > 0 && (
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-1">Gateway attempts</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr className="text-left"><th>Gateway</th><th>Outcome</th><th>Status</th><th>ms</th><th>Bytes</th></tr></thead>
                  <tbody>
                    {activeAttempts.map((attempt, index) => (
                      <tr key={`${attempt.gateway}-${index}`}>
                        <td className="font-data-mono pr-3">{attempt.gateway}</td><td className="pr-3">{attempt.outcome}</td>
                        <td className="pr-3">{attempt.status ?? "—"}</td><td className="pr-3">{attempt.ms}</td><td>{attempt.bytes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {selectedBrowser?.outcome === "verified" && selectedBrowser.check.status === "verified" && (
            <SafeTraceViewer
              content={selectedBrowser.check.content}
              ipfsCid={selectedFinding.ipfsCid}
              traceHash={selectedFinding.onChainHash}
              title="Browser-verified trace"
            />
          )}
        </section>
      )}
    </main>
  );
}

const TRACE_STATUSES = {
  VERIFIED: true, HASH_MISMATCH: true, UNAVAILABLE: true, UNKNOWN_TO_BACKEND: true,
  WRONG_MARKET: true, UNLINKED_IN_DB: true, NOT_ON_CHAIN: true, FOREIGN_AGENT: true, ARCHIVED: true,
};
