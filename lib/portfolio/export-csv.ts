import { formatUsdc } from "../stellar/units";

export type ExportSection = "trade" | "redeem" | "payment" | "pnl";

export type ExportRow =
  | {
      type: "trade";
      /** ISO timestamp from ledgerClosedAt */
      time: string;
      ledger: number;
      txHash: string;
      eventId: string;
      marketId: string;
      question: string | null;
      side: "BUY" | "SELL";
      outcome: "YES" | "NO";
      collateral: bigint;
      shares: bigint;
      fee: bigint;
      priceAfterBps: bigint;
    }
  | {
      type: "redeem";
      time: string;
      ledger: number;
      txHash: string;
      eventId: string;
      marketId: string;
      question: string | null;
      payout: bigint;
    }
  | {
      type: "payment";
      time: string;
      txHash: string;
      kind: string;
      status: string;
      amountRaw: bigint | null;
      traceId: string | null;
      note?: string;
    }
  | {
      type: "pnl";
      time: string;
      marketId: string;
      outcome: "YES" | "NO" | "BOTH";
      realized: bigint;
      costRemoved: bigint;
      note: string;
    };

export type SerializedExportRow =
  | {
      type: "trade";
      time: string;
      ledger: number;
      txHash: string;
      eventId: string;
      marketId: string;
      question: string | null;
      side: "BUY" | "SELL";
      outcome: "YES" | "NO";
      collateral: string;
      shares: string;
      fee: string;
      priceAfterBps: string;
    }
  | {
      type: "redeem";
      time: string;
      ledger: number;
      txHash: string;
      eventId: string;
      marketId: string;
      question: string | null;
      payout: string;
    }
  | {
      type: "payment";
      time: string;
      txHash: string;
      kind: string;
      status: string;
      amountRaw: string | null;
      traceId: string | null;
      note?: string;
    }
  | {
      type: "pnl";
      time: string;
      marketId: string;
      outcome: "YES" | "NO" | "BOTH";
      realized: string;
      costRemoved: string;
      note: string;
    };

export interface ExportMeta {
  wallet: string;
  networkPassphrase: string;
  marketCoreContractId: string;
  generatedAt: string;
  oldestLedger: number;
  latestLedger: number;
  partialRpc?: boolean;
  maxPages?: number;
  invalidPaymentRows?: number;
  paymentCap?: number;
}

export interface CsvExportOptions {
  section?: ExportSection;
  sections?: readonly ExportSection[];
  meta?: ExportMeta;
  includeHeaderNotes?: boolean;
  excelBom?: boolean;
}

export const COLUMNS: Record<ExportRow["type"], string[]> = {
  trade: [
    "record_type",
    "time",
    "ledger",
    "tx_hash",
    "event_id",
    "market_id",
    "question",
    "side",
    "outcome",
    "collateral_usdc",
    "shares",
    "fee_usdc",
    "price_after_bps",
  ],
  redeem: [
    "record_type",
    "time",
    "ledger",
    "tx_hash",
    "event_id",
    "market_id",
    "question",
    "payout_usdc",
  ],
  payment: [
    "record_type",
    "time",
    "tx_hash",
    "kind",
    "status",
    "amount_usdc",
    "trace_id",
    "note",
  ],
  pnl: [
    "record_type",
    "time",
    "market_id",
    "outcome",
    "realized_usdc",
    "cost_removed_usdc",
    "note",
  ],
};

export const UNIFIED_COLUMNS: string[] = [
  "record_type",
  "time",
  "ledger",
  "tx_hash",
  "event_id",
  "market_id",
  "question",
  "side",
  "outcome",
  "collateral_usdc",
  "shares",
  "fee_usdc",
  "price_after_bps",
  "payout_usdc",
  "kind",
  "status",
  "amount_usdc",
  "trace_id",
  "realized_usdc",
  "cost_removed_usdc",
  "note",
];

const FORMULA_TRIGGER_RE = /^[\t\r]|^\s*[=+\-@\t\r]/;

/**
 * Neutralises spreadsheet formula injection per OWASP recommendations.
 * If `s` begins with `=`, `+`, `-`, `@`, `\t`, or `\r` (including after leading
 * whitespace), prefixes a single quote `'`.
 */
export function neutralizeFormula(s: string): string {
  if (s.length === 0) return s;
  if (FORMULA_TRIGGER_RE.test(s)) {
    return `'${s}`;
  }
  return s;
}

/**
 * Formats an exact 7-decimal base-unit `bigint` as a plain decimal string without
 * grouping. Negative values receive a leading ASCII `-`.
 */
export function formatExact7(raw: bigint): string {
  if (raw < 0n) {
    return `-${formatUsdc(-raw, { minDecimals: 7, maxDecimals: 7, grouping: false })}`;
  }
  return formatUsdc(raw, { minDecimals: 7, maxDecimals: 7, grouping: false });
}

function quoteRfc4180(s: string): string {
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Encodes a single CSV cell:
 * - `null`: empty cell `""`
 * - `bigint`: exact 7-decimal string via `formatUsdc(raw, { minDecimals: 7 })`
 *   (never formula-neutralised so negative PnL stays numeric)
 * - `number`: decimal string (never formula-neutralised)
 * - `string`: `neutralizeFormula` followed by RFC 4180 quoting
 */
export function csvCell(value: string | number | bigint | null): string {
  if (value === null) return "";
  if (typeof value === "bigint") {
    return formatExact7(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return quoteRfc4180(neutralizeFormula(value));
}

/**
 * Converts a ledger close timestamp into a canonical UTC ISO-8601 string with `Z` suffix.
 */
export function toLedgerIsoTime(ledgerClosedAt: string): string {
  const ms = Date.parse(ledgerClosedAt);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid ledgerClosedAt timestamp: ${ledgerClosedAt}`);
  }
  return new Date(ms).toISOString();
}

/**
 * Builds the `#` header comment lines documenting wallet, network, contract id,
 * generation timestamp, units, and retention/pagination coverage.
 */
export function headerLines(meta: ExportMeta): string[] {
  const lines = [
    `# OracleDesk export · wallet ${meta.wallet} · network "${meta.networkPassphrase}"`,
    `# market-core ${meta.marketCoreContractId} · generated ${meta.generatedAt} · source: Stellar RPC getEvents (ledgers ${meta.oldestLedger}–${meta.latestLedger}) + OracleDesk API /traces/payments`,
    "# amounts: USDC, 7 decimal places, exact on-chain values; shares: base units at 7 decimals",
    `# history before ledger ${meta.oldestLedger} is unavailable from RPC (retention)`,
    `# payments: OracleDesk API /traces/payments returns at most the newest ${meta.paymentCap ?? 100} rows`,
  ];
  if (meta.partialRpc) {
    lines.push(
      `# warning: RPC event paging stopped at the ${meta.maxPages ?? 50}-page safety cap; older events in the retention window may be omitted`,
    );
  }
  if (meta.invalidPaymentRows && meta.invalidPaymentRows > 0) {
    lines.push(
      `# warning: skipped ${meta.invalidPaymentRows} malformed payment row(s) from /traces/payments`,
    );
  }
  return lines;
}

function encodeSectionRow(row: ExportRow): string {
  switch (row.type) {
    case "trade":
      return [
        csvCell(row.type),
        csvCell(row.time),
        csvCell(row.ledger),
        csvCell(row.txHash),
        csvCell(row.eventId),
        csvCell(row.marketId),
        csvCell(row.question),
        csvCell(row.side),
        csvCell(row.outcome),
        csvCell(row.collateral),
        csvCell(row.shares),
        csvCell(row.fee),
        // priceAfterBps is an integer basis-point value (0..10000), not 7-dp USDC
        String(row.priceAfterBps),
      ].join(",");
    case "redeem":
      return [
        csvCell(row.type),
        csvCell(row.time),
        csvCell(row.ledger),
        csvCell(row.txHash),
        csvCell(row.eventId),
        csvCell(row.marketId),
        csvCell(row.question),
        csvCell(row.payout),
      ].join(",");
    case "payment": {
      const note =
        row.note ??
        (row.amountRaw === null ? "backend did not record a raw amount" : "");
      return [
        csvCell(row.type),
        csvCell(row.time),
        csvCell(row.txHash),
        csvCell(row.kind),
        csvCell(row.status),
        csvCell(row.amountRaw),
        csvCell(row.traceId),
        csvCell(note),
      ].join(",");
    }
    case "pnl":
      return [
        csvCell(row.type),
        csvCell(row.time),
        csvCell(row.marketId),
        csvCell(row.outcome),
        csvCell(row.realized),
        csvCell(row.costRemoved),
        csvCell(row.note),
      ].join(",");
  }
}

function encodeUnifiedRow(row: ExportRow): string {
  switch (row.type) {
    case "trade":
      return [
        csvCell("trade"),
        csvCell(row.time),
        csvCell(row.ledger),
        csvCell(row.txHash),
        csvCell(row.eventId),
        csvCell(row.marketId),
        csvCell(row.question),
        csvCell(row.side),
        csvCell(row.outcome),
        csvCell(row.collateral),
        csvCell(row.shares),
        csvCell(row.fee),
        String(row.priceAfterBps),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(",");
    case "redeem":
      return [
        csvCell("redeem"),
        csvCell(row.time),
        csvCell(row.ledger),
        csvCell(row.txHash),
        csvCell(row.eventId),
        csvCell(row.marketId),
        csvCell(row.question),
        "",
        "",
        "",
        "",
        "",
        "",
        csvCell(row.payout),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(",");
    case "payment": {
      const note =
        row.note ??
        (row.amountRaw === null ? "backend did not record a raw amount" : "");
      return [
        csvCell("payment"),
        csvCell(row.time),
        "",
        csvCell(row.txHash),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        csvCell(row.kind),
        csvCell(row.status),
        csvCell(row.amountRaw),
        csvCell(row.traceId),
        "",
        "",
        csvCell(note),
      ].join(",");
    }
    case "pnl":
      return [
        csvCell("pnl"),
        csvCell(row.time),
        "",
        "",
        "",
        csvCell(row.marketId),
        "",
        "",
        csvCell(row.outcome),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        csvCell(row.realized),
        csvCell(row.costRemoved),
        csvCell(row.note),
      ].join(",");
  }
}

/**
 * Pure, streaming generator that yields RFC 4180 CSV lines (each ending with `\r\n`).
 *
 * When `opts.section` is set, emits `COLUMNS[opts.section]` and filters rows to
 * that section. When `opts.sections` is provided with multiple sections, emits
 * `UNIFIED_COLUMNS` with a `record_type` discriminator column.
 */
export function* toCsvLines(
  rows: Iterable<ExportRow>,
  opts: CsvExportOptions = {},
): Generator<string> {
  const singleSection =
    opts.section ??
    (opts.sections && opts.sections.length === 1 ? opts.sections[0] : undefined);
  const allowedSections = opts.sections
    ? new Set<ExportSection>(opts.sections)
    : singleSection
      ? new Set<ExportSection>([singleSection])
      : null;

  let firstPrefix = opts.excelBom ? "\uFEFF" : "";
  const emit = (line: string): string => {
    if (firstPrefix) {
      const out = `${firstPrefix}${line}\r\n`;
      firstPrefix = "";
      return out;
    }
    return `${line}\r\n`;
  };

  if (opts.meta && (opts.includeHeaderNotes ?? true)) {
    for (const h of headerLines(opts.meta)) {
      yield emit(h);
    }
  }

  const headerCols = singleSection ? COLUMNS[singleSection] : UNIFIED_COLUMNS;
  yield emit(headerCols.join(","));

  for (const row of rows) {
    if (allowedSections && !allowedSections.has(row.type)) continue;
    yield emit(
      singleSection ? encodeSectionRow(row) : encodeUnifiedRow(row),
    );
  }
}

/**
 * Encodes an iterable of CSV lines into UTF-8 `ArrayBuffer` chunks of approximately
 * `chunkBytes` (default 64 KB), never splitting inside a UTF-8 multi-byte code point.
 */
export function encodeCsvChunks(
  lines: Iterable<string>,
  opts: {
    chunkBytes?: number;
    onLine?: (lineIndex: number) => void;
    isCancelled?: () => boolean;
  } = {},
): ArrayBuffer[] {
  const targetBytes = Math.max(64, opts.chunkBytes ?? 64 * 1024);
  const encoder = new TextEncoder();
  const parts: ArrayBuffer[] = [];
  let pending: Uint8Array[] = [];
  let pendingLen = 0;
  let lineIndex = 0;

  const flushPending = () => {
    if (pendingLen === 0) return;
    const merged = new Uint8Array(pendingLen);
    let offset = 0;
    for (const chunk of pending) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    parts.push(merged.buffer);
    pending = [];
    pendingLen = 0;
  };

  // Find a safe UTF-8 code-point boundary at or before `maxEnd` so no multi-byte
  // sequence (e.g. emoji / surrogate pair) is ever split across two chunks.
  const findUtf8Boundary = (bytes: Uint8Array, maxEnd: number): number => {
    if (maxEnd >= bytes.byteLength) return bytes.byteLength;
    let idx = maxEnd;
    // UTF-8 continuation bytes match 0b10xxxxxx (0x80..0xBF).
    while (idx > 0 && (bytes[idx]! & 0b1100_0000) === 0b1000_0000) {
      idx -= 1;
    }
    return idx > 0 ? idx : maxEnd;
  };

  for (const line of lines) {
    if (opts.isCancelled?.()) {
      return [];
    }
    const encoded = encoder.encode(line);
    let cursor = 0;
    while (cursor < encoded.byteLength) {
      const spaceLeft = targetBytes - pendingLen;
      if (encoded.byteLength - cursor <= spaceLeft) {
        const slice = encoded.subarray(cursor);
        pending.push(slice);
        pendingLen += slice.byteLength;
        cursor = encoded.byteLength;
        if (pendingLen >= targetBytes) {
          flushPending();
        }
      } else {
        const boundary = findUtf8Boundary(encoded, cursor + spaceLeft);
        if (boundary > cursor) {
          const slice = encoded.subarray(cursor, boundary);
          pending.push(slice);
          pendingLen += slice.byteLength;
          cursor = boundary;
        }
        flushPending();
        // If a single multi-byte character is larger than targetBytes, emit it whole.
        if (boundary === cursor && cursor < encoded.byteLength) {
          let charEnd = cursor + 1;
          while (
            charEnd < encoded.byteLength &&
            (encoded[charEnd]! & 0b1100_0000) === 0b1000_0000
          ) {
            charEnd += 1;
          }
          const slice = encoded.subarray(cursor, charEnd);
          pending.push(slice);
          pendingLen += slice.byteLength;
          cursor = charEnd;
          flushPending();
        }
      }
    }
    lineIndex += 1;
    opts.onLine?.(lineIndex);
  }

  flushPending();
  return parts;
}

export function serializeExportRow(row: ExportRow): SerializedExportRow {
  switch (row.type) {
    case "trade":
      return {
        ...row,
        collateral: row.collateral.toString(),
        shares: row.shares.toString(),
        fee: row.fee.toString(),
        priceAfterBps: row.priceAfterBps.toString(),
      };
    case "redeem":
      return {
        ...row,
        payout: row.payout.toString(),
      };
    case "payment":
      return {
        ...row,
        amountRaw: row.amountRaw !== null ? row.amountRaw.toString() : null,
      };
    case "pnl":
      return {
        ...row,
        realized: row.realized.toString(),
        costRemoved: row.costRemoved.toString(),
      };
  }
}

export function deserializeExportRow(row: SerializedExportRow): ExportRow {
  switch (row.type) {
    case "trade":
      return {
        ...row,
        collateral: BigInt(row.collateral),
        shares: BigInt(row.shares),
        fee: BigInt(row.fee),
        priceAfterBps: BigInt(row.priceAfterBps),
      };
    case "redeem":
      return {
        ...row,
        payout: BigInt(row.payout),
      };
    case "payment":
      return {
        ...row,
        amountRaw: row.amountRaw !== null ? BigInt(row.amountRaw) : null,
      };
    case "pnl":
      return {
        ...row,
        realized: BigInt(row.realized),
        costRemoved: BigInt(row.costRemoved),
      };
  }
}
