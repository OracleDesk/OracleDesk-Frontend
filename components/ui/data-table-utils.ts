/**
 * Pure helpers for `DataTable`: typed, stable sorting and live-row merging.
 * Money sorts as `bigint`; nothing here ever compares formatted strings.
 */

export type SortValue = bigint | number | string | Date | null;
export type SortDirection = "ascending" | "descending";

const collator = new Intl.Collator(undefined, { numeric: true });

const rank = (v: Exclude<SortValue, null>): number => (typeof v === "bigint" ? 0 : typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);

/**
 * Ascending comparison of two non-null-aware sort values. `null` sorts last.
 * bigint compares exactly (no Number conversion); bigint vs number compares
 * mathematically; strings use a numeric-aware collator; dates compare by time.
 */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  if ((typeof a === "bigint" || typeof a === "number") && (typeof b === "bigint" || typeof b === "number")) {
    // Mixed bigint/number: JS compares these exactly, without precision loss.
    if (typeof a === "number" && Number.isNaN(a)) return typeof b === "number" && Number.isNaN(b) ? 0 : 1;
    if (typeof b === "number" && Number.isNaN(b)) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) {
    const x = a.getTime();
    const y = b.getTime();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);
  // Different kinds: group by kind so the order stays total and deterministic.
  return rank(a) - rank(b);
}

/**
 * Stable sort by a typed key. Equal keys keep their input order in both
 * directions (index tie-break), and `null` keys always sort last, so a live
 * feed that prepends newest-first stays newest-first among equal keys.
 */
export function sortRows<Row>(rows: readonly Row[], sortValue: (row: Row) => SortValue, direction: SortDirection): Row[] {
  const sign = direction === "ascending" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: sortValue(row) }))
    .sort((x, y) => {
      if (x.key === null || y.key === null) {
        if (x.key === y.key) return x.index - y.index;
        return x.key === null ? 1 : -1;
      }
      const result = compareSortValues(x.key, y.key) * sign;
      return result !== 0 ? result : x.index - y.index;
    })
    .map((entry) => entry.row);
}

/**
 * Merges newly received rows in front of the existing ones (newest first),
 * dropping duplicates by id (socket reconnects replay events) and capping the
 * length. The first occurrence wins, so an already-shown row keeps its place.
 */
export function mergePrepend<Row>(existing: readonly Row[], incoming: readonly Row[], getRowId: (row: Row) => string, maxRows: number): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of [...incoming, ...existing]) {
    const id = getRowId(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= maxRows) break;
  }
  return out;
}

/** Rows whose ids are in `rows` but not in `known`. */
export function newRowsSince<Row>(rows: readonly Row[], known: ReadonlySet<string>, getRowId: (row: Row) => string): Row[] {
  return rows.filter((row) => !known.has(getRowId(row)));
}

/** Minimum gap between live announcements. */
export const ANNOUNCE_INTERVAL_MS = 5000;

/**
 * Rate-limits announcements to one per `ANNOUNCE_INTERVAL_MS`. Returns either
 * what to announce right now or how long to wait to announce the batch.
 */
export function planAnnouncement(now: number, lastAnnouncedAt: number | null, queued: number, interval = ANNOUNCE_INTERVAL_MS): { kind: "none" } | { kind: "now"; count: number } | { kind: "later"; delayMs: number } {
  if (queued <= 0) return { kind: "none" };
  if (lastAnnouncedAt === null || now - lastAnnouncedAt >= interval) return { kind: "now", count: queued };
  return { kind: "later", delayMs: interval - (now - lastAnnouncedAt) };
}
