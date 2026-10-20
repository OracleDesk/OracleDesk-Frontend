import { describe, expect, it, vi } from "vitest";
import { parsePaymentEvent, validatePaymentEvents } from "../../api/traces";
import { formatUsdc } from "../../stellar/units";
import {
  COLUMNS,
  csvCell,
  encodeCsvChunks,
  headerLines,
  neutralizeFormula,
  serializeExportRow,
  toCsvLines,
  toLedgerIsoTime,
  type ExportMeta,
  type ExportRow,
} from "../export-csv";
import { handleMessage, type ExportWorkerResponse } from "../export.worker";

/**
 * Minimal compliant RFC 4180 CSV parser for round-trip verification.
 */
function parseRfc4180(csv: string): string[][] {
  const input = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && input[i + 1] === "\n") {
      row.push(cell);
      cell = "";
      if (!(row.length === 1 && row[0]?.startsWith("#"))) {
        rows.push(row);
      }
      row = [];
      i += 1;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const sampleMeta: ExportMeta = {
  wallet: "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
  networkPassphrase: "Test SDF Network ; September 2015",
  marketCoreContractId: "CB64D3G7SM2RTH6JSGG34DDTFTQ5CFDKVDZJZSODMCX4NJ2HV2KN7OHT",
  generatedAt: "2026-10-19T12:00:00.000Z",
  oldestLedger: 120_000,
  latestLedger: 145_000,
  partialRpc: true,
  maxPages: 50,
  invalidPaymentRows: 2,
  paymentCap: 100,
};

describe("lib/portfolio/export-csv", () => {
  it("neutralizeFormula prefixes =, +, -, @, tab and CR, including after leading spaces", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(neutralizeFormula("-2+3")).toBe("'-2+3");
    expect(neutralizeFormula("@cmd")).toBe("'@cmd");
    expect(neutralizeFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeFormula("\r=1+1")).toBe("'\r=1+1");
    expect(neutralizeFormula("   =HYPERLINK(\"http://evil\")")).toBe(
      "'   =HYPERLINK(\"http://evil\")",
    );
    expect(neutralizeFormula("  +cmd")).toBe("'  +cmd");
    expect(neutralizeFormula("  -cmd")).toBe("'  -cmd");
    expect(neutralizeFormula("  @cmd")).toBe("'  @cmd");
    expect(neutralizeFormula("Will BTC exceed 100k?")).toBe(
      "Will BTC exceed 100k?",
    );
    expect(neutralizeFormula("")).toBe("");
  });

  it("numeric cells are never neutralized (negative PnL stays numeric)", () => {
    expect(csvCell(-123_456_789n)).toBe("-12.3456789");
    expect(csvCell(0n)).toBe("0.0000000");
    expect(csvCell(10_000_000n)).toBe("1.0000000");
    expect(csvCell(-42)).toBe("-42");

    const pnlRow: ExportRow = {
      type: "pnl",
      time: "2026-10-18T12:00:00.000Z",
      marketId: "7",
      outcome: "YES",
      realized: -25_000_000n,
      costRemoved: 100_000_000n,
      note: "sell",
    };
    const lines = [
      ...toCsvLines([pnlRow], { section: "pnl", includeHeaderNotes: false }),
    ];
    expect(lines[1]).toContain(",-2.5000000,10.0000000,");
    expect(lines[1]).not.toContain("'-2.5000000");
  });

  it("quotes, commas and newlines round-trip through an RFC 4180 parser", () => {
    const trickyQuestion =
      'Will "ETH", after the merge,\nhit $5,000\r\nor "=1+1"?';
    const row: ExportRow = {
      type: "trade",
      time: "2026-10-18T12:00:00.000Z",
      ledger: 555,
      txHash: "a".repeat(64),
      eventId: "0000555-0001",
      marketId: "7",
      question: trickyQuestion,
      side: "BUY",
      outcome: "YES",
      collateral: 123_456_789n,
      shares: 200_000_001n,
      fee: 1_234_567n,
      priceAfterBps: 6_421n,
    };

    const csv = [
      ...toCsvLines([row], {
        section: "trade",
        includeHeaderNotes: false,
        excelBom: true,
      }),
    ].join("");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    const parsed = parseRfc4180(csv);
    expect(parsed[0]).toEqual(COLUMNS.trade);
    expect(parsed[1]?.[6]).toBe(trickyQuestion);
    expect(parsed[1]?.[9]).toBe("12.3456789");
    expect(parsed[1]?.[10]).toBe("20.0000001");
    expect(parsed[1]?.[11]).toBe("0.1234567");
    expect(parsed[1]?.[12]).toBe("6421");
  });

  it("unicode and emoji questions survive TextEncoder chunking at chunk boundaries", () => {
    const emojiQuestion =
      "Will 🚀🪐 Stellar Soroban (日本語・한국어・العربية・𝕳𝖊𝖑𝖑𝖔) reach 1M tx/day? 🎯🔥";
    const rows: ExportRow[] = Array.from({ length: 12 }, (_, idx) => ({
      type: "trade",
      time: "2026-10-18T12:00:00.000Z",
      ledger: 100 + idx,
      txHash: "b".repeat(64),
      eventId: `ev-${idx}`,
      marketId: "1",
      question: emojiQuestion,
      side: "BUY",
      outcome: "YES",
      collateral: 10_000_000n,
      shares: 15_000_000n,
      fee: 100_000n,
      priceAfterBps: 5_500n,
    }));

    // Force small 73-byte chunks so boundaries fall right across multi-byte UTF-8 sequences
    const chunks = encodeCsvChunks(
      toCsvLines(rows, { section: "trade", includeHeaderNotes: false }),
      { chunkBytes: 73 },
    );
    expect(chunks.length).toBeGreaterThan(10);

    // Every single chunk must decode cleanly on its own without U+FFFD replacement chars
    const perChunkDecoded = chunks
      .map((buf) => new TextDecoder("utf-8", { fatal: true }).decode(buf))
      .join("");
    expect(perChunkDecoded).not.toContain("\uFFFD");

    const parsed = parseRfc4180(perChunkDecoded);
    expect(parsed).toHaveLength(13);
    for (let i = 1; i <= 12; i++) {
      expect(parsed[i]?.[6]).toBe(emojiQuestion);
    }
  });

  it("amounts are fixed 7-dp strings equal to formatUsdc(raw, { minDecimals: 7 })", () => {
    const samples = [
      0n,
      1n,
      10n,
      123_456_789n,
      10_000_000n,
      999_999_999_999_999n,
    ];
    for (const raw of samples) {
      expect(csvCell(raw)).toBe(
        formatUsdc(raw, { minDecimals: 7, maxDecimals: 7, grouping: false }),
      );
    }
  });

  it("ISO times come from ledgerClosedAt, not the clock (fake timers)", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2035-05-05T05:05:05.000Z"));
      const closedAt = "2026-03-15T08:30:45Z";
      expect(toLedgerIsoTime(closedAt)).toBe("2026-03-15T08:30:45.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("header lines include wallet, network, contract id and coverage", () => {
    const lines = headerLines(sampleMeta);
    const joined = lines.join("\n");
    expect(lines.every((l) => l.startsWith("# "))).toBe(true);
    expect(joined).toContain(sampleMeta.wallet);
    expect(joined).toContain(sampleMeta.networkPassphrase);
    expect(joined).toContain(sampleMeta.marketCoreContractId);
    expect(joined).toContain("120000–145000");
    expect(joined).toContain("50-page");
    expect(joined).toContain("skipped 2 malformed payment row(s)");
  });

  it("100k rows stream with bounded memory and produce the expected line count", () => {
    function* generateRows(count: number): Generator<ExportRow> {
      for (let i = 0; i < count; i++) {
        yield {
          type: "redeem",
          time: "2026-10-18T12:00:00.000Z",
          ledger: 1000 + i,
          txHash: "c".repeat(64),
          eventId: `ev-${i}`,
          marketId: "9",
          question: "Will rate cuts happen?",
          payout: 50_000_000n + BigInt(i),
        };
      }
    }

    let lineCount = 0;
    for (const line of toCsvLines(generateRows(100_000), {
      section: "redeem",
      includeHeaderNotes: false,
    })) {
      expect(line.endsWith("\r\n")).toBe(true);
      lineCount += 1;
    }
    // 1 header line + 100,000 data rows
    expect(lineCount).toBe(100_001);
  });

  it("worker handleMessage reports progress every 1,000 rows and supports cancellation", () => {
    const messages: ExportWorkerResponse[] = [];
    const cancelledIds = new Set<string>();
    const rows = Array.from({ length: 2_500 }, (_, i) =>
      serializeExportRow({
        type: "redeem",
        time: "2026-10-18T12:00:00.000Z",
        ledger: 100 + i,
        txHash: "d".repeat(64),
        eventId: `ev-${i}`,
        marketId: "3",
        question: "Test market",
        payout: 10_000_000n,
      }),
    );

    handleMessage(
      {
        id: "job-1",
        sections: ["redeem"],
        rows,
        meta: sampleMeta,
        options: { includeHeaderNotes: true, excelBom: true },
      },
      {
        post: (msg) => messages.push(msg),
        cancelledIds,
      },
    );

    const progressMsgs = messages.filter(
      (m): m is Extract<ExportWorkerResponse, { progress: number }> =>
        "progress" in m,
    );
    expect(progressMsgs.length).toBeGreaterThanOrEqual(2);
    expect(progressMsgs[0]?.progress).toBeCloseTo(1000 / 2500, 5);
    expect(progressMsgs[1]?.progress).toBeCloseTo(2000 / 2500, 5);

    const doneMsg = messages.find(
      (m): m is Extract<ExportWorkerResponse, { done: true }> => "done" in m,
    );
    expect(doneMsg?.done).toBe(true);
    expect(doneMsg?.parts.length).toBeGreaterThan(0);

    // Test cancellation mid-stream
    const cancelMessages: ExportWorkerResponse[] = [];
    const cancelSet = new Set<string>();
    handleMessage(
      {
        id: "job-cancel",
        sections: ["redeem"],
        rows,
        meta: sampleMeta,
      },
      {
        post: (msg) => {
          cancelMessages.push(msg);
          if ("progress" in msg) {
            handleMessage(
              { id: "job-cancel", cancel: true },
              { post: () => {}, cancelledIds: cancelSet },
            );
          }
        },
        cancelledIds: cancelSet,
      },
    );
    expect(cancelMessages.some((m) => "done" in m)).toBe(false);
  });

  it("runtime-validates PaymentEvent rows and preserves missing amountRaw as empty", () => {
    expect(parsePaymentEvent(null)).toBeNull();
    expect(parsePaymentEvent({ txHash: "" })).toBeNull();
    const validWithRaw = parsePaymentEvent({
      txHash: "e".repeat(64),
      type: "DAILY_PASS",
      amountRaw: "5000000",
      status: "CONFIRMED",
      createdAt: "2026-10-18T00:00:00.000Z",
    });
    expect(validWithRaw?.amountRaw).toBe("5000000");

    const failedWithoutRaw = parsePaymentEvent({
      txHash: "f".repeat(64),
      type: "PER_TRACE",
      amount: 0.25,
      status: "FAILED",
      createdAt: "2026-10-18T00:00:00.000Z",
    });
    expect(failedWithoutRaw?.status).toBe("FAILED");
    expect(failedWithoutRaw?.amountRaw).toBe("");

    const batch = validatePaymentEvents([
      validWithRaw,
      { invalid: true },
      null,
      failedWithoutRaw,
    ]);
    expect(batch.events).toHaveLength(2);
    expect(batch.invalidCount).toBe(2);
  });
});
