"use client";

import React, { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ExportSection } from "@/lib/portfolio/export-csv";
import { useExportData } from "@/lib/portfolio/useExportData";

const SECTION_LABELS: Array<{ id: ExportSection; label: string; detail: string }> = [
  {
    id: "trade",
    label: "Trades",
    detail: "On-chain market-core Trade events (exact 7-dp collateral, shares, fee)",
  },
  {
    id: "redeem",
    label: "Redemptions",
    detail: "On-chain market-core Redeemed payouts",
  },
  {
    id: "payment",
    label: "Premium payments",
    detail: "Verified trace & daily-pass payments (newest 100 from /traces/payments)",
  },
  {
    id: "pnl",
    label: "PnL ledger",
    detail: "Average-cost realized PnL and cost-basis removals",
  },
];

export function ExportHistoryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { address, isExporting, progress, error, counts, runExport, cancel } =
    useExportData();
  const [selected, setSelected] = useState<Record<ExportSection, boolean>>({
    trade: true,
    redeem: true,
    payment: true,
    pnl: true,
  });
  const [excelBom, setExcelBom] = useState(true);
  const [includeHeaderNotes, setIncludeHeaderNotes] = useState(true);

  if (!open) return null;

  const activeSections = (Object.keys(selected) as ExportSection[]).filter(
    (k) => selected[k],
  );
  const estimatedTotal = counts
    ? activeSections.reduce((acc, s) => acc + counts[s], 0)
    : null;

  const toggleSection = (id: ExportSection) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-history-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-outline-variant bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-4">
          <div>
            <h2
              id="export-history-title"
              className="font-headline-sm text-headline-sm text-on-surface"
            >
              Export my history (CSV)
            </h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Connected wallet:{" "}
              <span className="font-data-mono font-semibold text-on-surface">
                {address ?? "Not connected"}
              </span>{" "}
              · excludes the agent treasury book
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isExporting) cancel();
              onClose();
            }}
            aria-label="Close export dialog"
            className="text-outline hover:text-on-surface"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2" disabled={isExporting}>
            <legend className="font-label-caps text-label-caps text-outline">
              SECTIONS TO INCLUDE
            </legend>
            {SECTION_LABELS.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 rounded border border-outline-variant p-3 hover:bg-surface-container-low"
              >
                <input
                  type="checkbox"
                  checked={selected[item.id]}
                  onChange={() => toggleSection(item.id)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="flex-1 text-sm">
                  <span className="font-semibold text-on-surface">
                    {item.label}
                  </span>
                  {counts && (
                    <span className="ml-2 font-data-mono text-xs text-outline">
                      ({counts[item.id]} rows)
                    </span>
                  )}
                  <span className="block text-xs text-on-surface-variant">
                    {item.detail}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2 border-t border-outline-variant pt-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="text-on-surface">
                Excel compatible (UTF-8 BOM)
              </span>
              <input
                type="checkbox"
                checked={excelBom}
                disabled={isExporting}
                onChange={(e) => setExcelBom(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="text-on-surface">
                Include header notes (# metadata &amp; coverage lines)
              </span>
              <input
                type="checkbox"
                checked={includeHeaderNotes}
                disabled={isExporting}
                onChange={(e) => setIncludeHeaderNotes(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="rounded bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            {estimatedTotal !== null
              ? `Estimated rows from last scan: ${estimatedTotal}`
              : "Amounts are exported with exact 7-decimal base-unit precision and formula-injection protection."}
          </div>

          {isExporting && (
            <div className="space-y-1" role="status" aria-live="polite">
              <div className="flex justify-between text-xs font-data-mono text-on-surface-variant">
                <span>Generating CSV…</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-outline-variant pt-4">
          {isExporting ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
            >
              Close
            </button>
          )}
          <button
            type="button"
            disabled={isExporting || !address || activeSections.length === 0}
            onClick={() =>
              void runExport({
                sections: activeSections,
                includeHeaderNotes,
                excelBom,
              })
            }
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" className="text-[16px]" />
            {isExporting ? "Exporting…" : "Download CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
