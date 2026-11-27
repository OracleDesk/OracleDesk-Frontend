"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import {
  ANNOUNCE_INTERVAL_MS,
  planAnnouncement,
  sortRows,
  type SortDirection,
  type SortValue,
} from "./data-table-utils";
import { VirtualTableBody } from "./virtual-list";

export type { SortDirection, SortValue } from "./data-table-utils";

export interface ColumnDef<Row> {
  id: string;
  /** Visible header text, sentence case. */
  header: string;
  /** Display only. Never sorted by. */
  cell: (row: Row) => ReactNode;
  /** Typed sort key (bigint / number / string / Date). Enables sorting. */
  sortValue?: (row: Row) => SortValue;
  align?: "start" | "end" | "center";
  /** tabular-nums + end alignment. */
  numeric?: boolean;
  /** Renders `<th scope="row">` instead of `<td>`. */
  isRowHeader?: boolean;
  /** Label in the card layout; defaults to `header`. */
  mobileLabel?: string;
  hideOnMobile?: boolean;
}

export interface DataTableLive<Row> {
  mode: "prepend";
  /** Spoken text for one new row. */
  announce: (row: Row) => string;
  /** Spoken text for a burst of `count` new rows, e.g. "3 new trades". */
  announceCount?: (count: number) => string;
  /** Text of the button shown while new rows are held back, e.g. "3 new trades — show". */
  pendingLabel?: (count: number) => string;
  /** Rows beyond this count are not shown. */
  maxRows: number;
}

export interface DataTableProps<Row> {
  caption: string;
  captionHidden?: boolean;
  /** Extra content inside the caption (e.g. a "Sample rows" note or demo badge). */
  captionExtra?: ReactNode;
  columns: ColumnDef<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  initialSort?: { columnId: string; direction: SortDirection };
  emptyState: ReactNode;
  loading?: boolean;
  live?: DataTableLive<Row>;
  className?: string;
  rowClassName?: (row: Row) => string | undefined;
  /**
   * Window-virtualize the table body (card layout below `md` is not
   * virtualized). Rows get `aria-rowindex`; the table gets `aria-rowcount`.
   */
  virtualize?: { estimateSize: number; restorationKey?: string };
}

const SCROLL_HOLD_MS = 5000;

type Layout = { numeric?: boolean; align?: "start" | "end" | "center" };

const alignClass = (column: Layout) => {
  const align = column.numeric ? "end" : (column.align ?? "start");
  return align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
};

const cellClass = (column: Layout) =>
  `py-3 ${alignClass(column)}${column.numeric ? " font-data-mono tabular-nums" : ""}`;

function SortIcon({ direction }: { direction: SortDirection | null }) {
  return (
    <span aria-hidden="true" className="ms-1 inline-block w-3 text-[10px] leading-none">
      {direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "↕"}
    </span>
  );
}

/**
 * Accessible, typed data table: required caption, `scope` headers,
 * `aria-sort` on the active column, keyboard-operable sorting on typed keys,
 * a labelled card layout below `md`, and a live-update mode that never moves
 * content under the reader.
 */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  captionExtra,
  columns,
  rows,
  getRowId,
  initialSort,
  emptyState,
  loading = false,
  live,
  className = "",
  rowClassName,
  virtualize,
}: DataTableProps<Row>) {
  const uid = useId();
  const captionId = `${uid}-caption`;
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(initialSort ?? null);

  // --- live mode: hold rows back while the reader is inside the table ---
  const [frozen, setFrozen] = useState<readonly Row[] | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusInside = useRef(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const hold = useCallback(() => {
    setFrozen((current) => current ?? rowsRef.current);
  }, []);
  const release = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = null;
    setFrozen(null);
  }, []);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  const liveRows = live ? rows.slice(0, live.maxRows) : rows;
  const shownRows = live && frozen ? frozen : liveRows;
  const frozenIds = useMemo(() => (frozen ? new Set(frozen.map(getRowId)) : null), [frozen, getRowId]);
  const pendingCount = live && frozenIds ? liveRows.filter((row) => !frozenIds.has(getRowId(row))).length : 0;

  // --- live mode: polite, rate-limited announcements ---
  const [announcement, setAnnouncement] = useState("");
  const seenIds = useRef<Set<string> | null>(null);
  const queued = useRef<Row[]>([]);
  const lastAnnouncedAt = useRef<number | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const flushAnnouncement = useCallback(() => {
    announceTimer.current = null;
    const batch = queued.current;
    const config = liveRef.current;
    if (!config || batch.length === 0) return;
    queued.current = [];
    lastAnnouncedAt.current = Date.now();
    setAnnouncement(batch.length === 1 ? config.announce(batch[0]) : (config.announceCount?.(batch.length) ?? `${batch.length} new rows`));
  }, []);

  useEffect(() => {
    if (!live) return;
    const known = seenIds.current;
    if (known === null) {
      // First render: nothing is "new".
      seenIds.current = new Set(rows.map(getRowId));
      return;
    }
    const fresh = rows.filter((row) => !known.has(getRowId(row)));
    if (fresh.length === 0) return;
    for (const row of fresh) known.add(getRowId(row));
    queued.current = [...fresh, ...queued.current];
    const plan = planAnnouncement(Date.now(), lastAnnouncedAt.current, queued.current.length, ANNOUNCE_INTERVAL_MS);
    if (announceTimer.current) return;
    const delay = plan.kind === "later" ? plan.delayMs : 0;
    announceTimer.current = setTimeout(flushAnnouncement, delay);
  }, [rows, live, getRowId, flushAnnouncement]);

  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  // --- sorting ---
  const activeColumn = sort ? columns.find((c) => c.id === sort.columnId && c.sortValue) : undefined;
  const sortedRows = useMemo(
    () => (sort && activeColumn?.sortValue ? sortRows(shownRows, activeColumn.sortValue, sort.direction) : [...shownRows]),
    [shownRows, sort, activeColumn],
  );
  const toggleSort = (columnId: string) =>
    setSort((current) => ({
      columnId,
      direction: current?.columnId === columnId && current.direction === "ascending" ? "descending" : "ascending",
    }));

  const rowHeaderId = columns.find((c) => c.isRowHeader)?.id;
  const sortable = columns.filter((c) => c.sortValue);
  const colSpan = columns.length;

  const wrapperHandlers = live
    ? {
        onFocus: () => {
          focusInside.current = true;
          hold();
        },
        onBlur: (event: FocusEvent<HTMLElement>) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          focusInside.current = false;
          if (!scrollTimer.current) release();
        },
        onScroll: () => {
          hold();
          if (scrollTimer.current) clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => {
            scrollTimer.current = null;
            if (!focusInside.current) setFrozen(null);
          }, SCROLL_HOLD_MS);
        },
      }
    : {};

  const emptyOrLoading = loading ? "Loading…" : emptyState;

  const renderRow = (row: Row, ariaRowIndex?: number) => (
    <tr
      key={getRowId(row)}
      aria-rowindex={ariaRowIndex}
      data-virtual-table-row={ariaRowIndex !== undefined ? ariaRowIndex - 2 : undefined}
      className={`border-b border-outline-variant/30 transition-colors hover:bg-surface-container ${rowClassName?.(row) ?? ""}`}
    >
      {columns.map((column) =>
        column.id === rowHeaderId ? (
          <th key={column.id} scope="row" className={`${cellClass(column)} font-normal`}>
            {column.cell(row)}
          </th>
        ) : (
          <td key={column.id} className={cellClass(column)}>
            {column.cell(row)}
          </td>
        ),
      )}
    </tr>
  );

  return (
    <div className={className}>
      {live && (
        <>
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </div>
          {pendingCount > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={release}
                className="rounded border border-primary px-3 py-1 text-xs font-bold text-primary hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary"
              >
                {live.pendingLabel?.(pendingCount) ?? `${pendingCount} new rows — show`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Table layout from md up. display:none below md keeps it out of the accessibility tree. */}
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        aria-busy={loading || undefined}
        className="hidden overflow-x-auto focus-visible:ring-2 focus-visible:ring-primary md:block"
        {...wrapperHandlers}
      >
        <table className="w-full text-start" aria-rowcount={virtualize && sortedRows.length > 0 ? sortedRows.length + 1 : undefined}>
          <caption id={captionId} className={captionHidden ? "sr-only" : "pb-3 text-start text-sm font-bold text-on-surface"}>
            {caption}
            {captionExtra ? <> {captionExtra}</> : null}
          </caption>
          <thead>
            <tr aria-rowindex={virtualize ? 1 : undefined} className="border-b border-outline-variant">
              {columns.map((column) => {
                const active = sort?.columnId === column.id && column.sortValue ? sort.direction : null;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={active ?? undefined}
                    className={`pb-3 text-label-caps text-on-surface-variant ${alignClass(column)}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className="inline-flex items-center rounded font-[inherit] hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {column.header}
                        <SortIcon direction={active} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {sortedRows.length === 0 ? (
            <tbody className="font-data-mono text-body-md">
              <tr>
                <td colSpan={colSpan} className="py-6 text-center text-on-surface-variant">
                  {emptyOrLoading}
                </td>
              </tr>
            </tbody>
          ) : virtualize ? (
            <VirtualTableBody
              items={sortedRows}
              colSpan={colSpan}
              getKey={(row) => getRowId(row)}
              estimateSize={() => virtualize.estimateSize}
              restorationKey={virtualize.restorationKey}
              renderRow={(row, _index, a11y) => renderRow(row, a11y["aria-rowindex"])}
            />
          ) : (
            <tbody className="font-data-mono text-body-md">{sortedRows.map((row) => renderRow(row))}</tbody>
          )}
        </table>
      </div>

      {/* Card layout below md. display:none from md up. */}
      <div className="md:hidden" {...wrapperHandlers}>
        <p className={captionHidden ? "sr-only" : "pb-2 text-sm font-bold text-on-surface"}>
          {caption}
          {captionExtra ? <> {captionExtra}</> : null}
        </p>
        {sortable.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs text-on-surface-variant">
            <label htmlFor={`${uid}-sort`}>Sort by</label>
            <select
              id={`${uid}-sort`}
              value={sort?.columnId ?? ""}
              onChange={(event) => {
                const columnId = event.target.value;
                setSort(columnId ? { columnId, direction: sort?.direction ?? "ascending" } : null);
              }}
              className="rounded border border-outline-variant bg-white px-2 py-1"
            >
              <option value="">Default order</option>
              {sortable.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.header}
                </option>
              ))}
            </select>
            {sort && (
              <button
                type="button"
                onClick={() => setSort({ ...sort, direction: sort.direction === "ascending" ? "descending" : "ascending" })}
                className="rounded border border-outline-variant px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary"
              >
                {sort.direction === "ascending" ? "Ascending" : "Descending"}
              </button>
            )}
          </div>
        )}
        {sortedRows.length === 0 ? (
          <p className="py-6 text-center text-on-surface-variant">{emptyOrLoading}</p>
        ) : (
          <ul aria-label={caption} className="space-y-3">
            {sortedRows.map((row) => (
              <li key={getRowId(row)} className={`rounded-lg border border-outline-variant bg-white p-3 ${rowClassName?.(row) ?? ""}`}>
                <dl className="space-y-1">
                  {columns
                    .filter((column) => !column.hideOnMobile)
                    .map((column) => (
                      <div key={column.id} className="flex items-baseline justify-between gap-3">
                        <dt className="text-xs text-on-surface-variant">{column.mobileLabel ?? column.header}</dt>
                        <dd className={`min-w-0 break-words text-end${column.numeric ? " font-data-mono tabular-nums" : ""}`}>{column.cell(row)}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
