"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RequireWallet } from "@/components/require-wallet";
import { useAdminPermissions } from "@/lib/admin/useAdminPermissions";
import { useContractIntegrity, diffSpecs, bundledSpec, type ContractKey } from "@/lib/stellar/contract-check";
import { getSpecCompat } from "@/lib/api/admin";
import { compareSkew, type ContractSkewRow, type SkewVerdict } from "@/lib/admin/spec-skew";
import provenance from "@/lib/stellar/generated/provenance.json";
import { explorerAccount } from "@/lib/stellar/config";
import { RefreshCw, ExternalLink, ChevronDown, ChevronRight, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

function verdictBadge(verdict: SkewVerdict) {
  switch (verdict) {
    case "all-equal":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">All Equal</span>;
    case "frontend-behind-chain":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">Frontend Behind</span>;
    case "backend-behind-chain":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-700 dark:text-blue-300">Backend Behind</span>;
    case "frontend-backend-differ":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300">FE & BE Differ</span>;
    case "different-deployments":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/15 text-destructive font-semibold">Different Deployments</span>;
    default:
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-container text-on-surface-variant">Unknown</span>;
  }
}

export default function AdminContractsPage() {
  const { hasPermission, isLoading: permsLoading } = useAdminPermissions();
  const { data: integrity, refetch: refetchIntegrity, isFetching: integrityFetching } = useContractIntegrity();

  const {
    data: specCompat,
    refetch: refetchSpecCompat,
    isFetching: compatFetching,
  } = useQuery({
    queryKey: ["admin", "spec-compat"],
    queryFn: () => getSpecCompat(),
    staleTime: 60_000,
  });

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (contract: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(contract)) next.delete(contract);
      else next.add(contract);
      return next;
    });
  };

  const handleRecheck = () => {
    void refetchIntegrity();
    void refetchSpecCompat();
  };

  const isRechecking = integrityFetching || compatFetching;

  const rows: ContractSkewRow[] = integrity
    ? compareSkew(integrity, specCompat?.report ?? null, {
        frontend: provenance.contractsCommit,
      })
    : [];

  return (
    <RequireWallet>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant uppercase tracking-wider font-label-caps">
              <Link href="/admin" className="hover:text-primary">Admin</Link>
              <span>/</span>
              <span>Contracts Matrix</span>
            </div>
            <h1 className="text-headline-md font-headline-md mt-1">Cross-System Contract Skew Matrix</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Compares canonical spec fingerprints (odspec-v1), deployed bytecode hashes, and pinned repo commits across frontend, backend, and on-chain Soroban state.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRecheck}
            disabled={isRechecking}
            className="self-start md:self-center px-4 py-2 rounded-lg bg-primary text-on-primary font-medium text-sm inline-flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRechecking ? "animate-spin" : ""}`} />
            Re-check now
          </button>
        </header>

        {specCompat?.report && (
          <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-wrap gap-6 text-xs text-on-surface-variant">
            <div>
              <span className="font-semibold text-on-surface">Backend Mode:</span>{" "}
              <span className="font-mono uppercase">{specCompat.mode}</span>
            </div>
            <div>
              <span className="font-semibold text-on-surface">Backend Commit:</span>{" "}
              <span className="font-mono">{specCompat.report.bindingsCommit.slice(0, 7)}</span>
            </div>
            <div>
              <span className="font-semibold text-on-surface">Frontend Commit:</span>{" "}
              <span className="font-mono">{provenance.contractsCommit.slice(0, 7)}</span>
            </div>
            <div>
              <span className="font-semibold text-on-surface">Backend Evaluated At:</span>{" "}
              <span>{new Date(specCompat.report.checkedAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-4">Contract</th>
                <th className="py-3 px-4">Contract ID</th>
                <th className="py-3 px-4">WASM Hash (FE / BE)</th>
                <th className="py-3 px-4">Fingerprint (FE Bundled / On-Chain)</th>
                <th className="py-3 px-4">Verdict</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-data-mono text-xs">
              {rows.map((row) => {
                const isExpanded = expandedRows.has(row.contract);
                return (
                  <React.Fragment key={row.contract}>
                    <tr className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-3 px-4 font-sans font-medium text-on-surface">
                        {row.contract}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {row.frontend.id ? (
                          <a
                            href={explorerAccount(row.frontend.id) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {row.frontend.id.slice(0, 6)}…{row.frontend.id.slice(-6)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div>FE: {row.frontend.wasmHash ? `${row.frontend.wasmHash.slice(0, 8)}…` : "—"}</div>
                        <div>BE: {row.backend.wasmHash ? `${row.backend.wasmHash.slice(0, 8)}…` : "—"}</div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div>B: {row.frontend.bundled ? `${row.frontend.bundled.slice(0, 8)}…` : "—"}</div>
                        <div>C: {row.frontend.onChain ? `${row.frontend.onChain.slice(0, 8)}…` : "—"}</div>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        {verdictBadge(row.verdict)}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => toggleExpand(row.contract)}
                          className="px-2 py-1 rounded text-primary hover:bg-primary-container/10 inline-flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {isExpanded ? "Hide" : "Inspect"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-container-low font-sans">
                        <td colSpan={6} className="p-4 space-y-4">
                          <div>
                            <h4 className="font-semibold text-xs text-on-surface uppercase tracking-wider mb-2">
                              Skew Diagnostic Reasons
                            </h4>
                            <ul className="list-disc list-inside text-xs space-y-1 text-on-surface-variant">
                              {row.reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>

                          {row.backend.diffs.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-xs text-on-surface uppercase tracking-wider mb-2">
                                Backend Spec Diffs ({row.backend.diffs.length})
                              </h4>
                              <div className="space-y-1 text-xs">
                                {row.backend.diffs.map((d, i) => (
                                  <div key={i} className="flex items-center gap-2 font-mono">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                        d.severity === "breaking"
                                          ? "bg-destructive/20 text-destructive"
                                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                      }`}
                                    >
                                      {d.severity}
                                    </span>
                                    <span className="font-semibold">{d.item}:</span>
                                    <span>{d.change}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {row.frontend.status === "mismatch" && (
                            <div>
                              <h4 className="font-semibold text-xs text-on-surface uppercase tracking-wider mb-2">
                                Frontend Spec Diff (Bundled vs On-Chain)
                              </h4>
                              <pre className="p-3 rounded-lg bg-surface-container font-mono text-xs overflow-x-auto whitespace-pre-wrap border border-outline-variant">
                                {row.frontend.status === "mismatch" && integrity?.[row.contract]?.detail
                                  ? integrity[row.contract].detail
                                  : "No structural textual diff available."}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </RequireWallet>
  );
}
