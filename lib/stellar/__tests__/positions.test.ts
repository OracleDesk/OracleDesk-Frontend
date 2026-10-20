import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, rpc } from "@stellar/stellar-sdk";

const decodeValue = vi.fn();
const mockGetPosition = vi.fn();

vi.mock("../clients", () => ({
  marketCore: () => ({
    spec: { scValToNative: decodeValue },
    get_position: mockGetPosition,
  }),
  rpcServer: () => ({ getLedgerEntries: vi.fn() }),
}));

vi.mock("../typed-call", () => ({
  simulated: vi.fn((val: unknown) => val),
}));

import { fetchPositionsFor } from "../positions";
import { marketLedgerKey, positionLedgerKey } from "../ledger-entries";
import { toViewedAddress, ViewedAddress } from "../identity";

interface FakeEntry {
  key: { toXDR(format: "base64"): string };
  val: { contractData(): { val(): { id: bigint; kind: "Position" | "Market" } } };
  liveUntilLedgerSeq?: number;
}

function fakeEntry(
  key: FakeEntry["key"],
  kind: "Position" | "Market",
  id: bigint,
  liveUntilLedgerSeq?: number,
): FakeEntry {
  return {
    key,
    val: { contractData: () => ({ val: () => ({ kind, id }) }) },
    ...(liveUntilLedgerSeq === undefined ? {} : { liveUntilLedgerSeq }),
  } as FakeEntry;
}

describe("positions - fetchPositionsFor", () => {
  const holder = toViewedAddress(Keypair.random().publicKey())!;

  beforeEach(() => {
    decodeValue.mockImplementation((value: { id: bigint; kind: string }) =>
      value.kind === "Position"
        ? value.id === 5n
          ? { yes: 0n, no: 0n } // zero position
          : { yes: 1_000_000n, no: 500_000n }
        : {
            close_time: 0n,
            sets_minted: 1n,
            reserve_yes: 1n,
            reserve_no: 1n,
            status: { tag: "Open" },
          },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("encodes DataKey::Position ledger keys properly", () => {
    const key = positionLedgerKey(10n, holder);
    expect(key.switch().name).toBe("contractData");
    const contractData = key.contractData();
    expect(contractData.durability().name).toBe("persistent");
  });

  it("batches getLedgerEntries in chunks of 200 and excludes zero positions", async () => {
    const marketIds = Array.from({ length: 250 }, (_, i) => BigInt(i));
    const keyToId = new Map<string, bigint>();
    for (const id of marketIds) {
      keyToId.set(positionLedgerKey(id, holder).toXDR("base64"), id);
      keyToId.set(marketLedgerKey(id).toXDR("base64"), id);
    }

    const server = {
      getLedgerEntries: vi.fn(async (...keys: FakeEntry["key"][]) => {
        const entries = keys
          .map((k) => {
            const id = keyToId.get(k.toXDR("base64"));
            if (id === undefined) return null;
            return fakeEntry(k, "Position", id);
          })
          .filter(Boolean);
        return { entries, latestLedger: 1000 };
      }),
    };

    const results = await fetchPositionsFor(
      holder,
      marketIds,
      server as unknown as rpc.Server,
    );

    // 250 market IDs chunked at 200 -> 2 position calls, then market calls for found holdings
    expect(server.getLedgerEntries.mock.calls[0].length).toBe(200);
    expect(server.getLedgerEntries.mock.calls[1].length).toBe(50);

    // Market 5 had { yes: 0, no: 0 } and must be excluded
    expect(results.some((r) => r.marketId === 5n)).toBe(false);
    expect(results.length).toBe(249);
    // Must be sorted descending (newest first)
    expect(results[0].marketId).toBe(249n);
    expect(results[results.length - 1].marketId).toBe(0n);
  });

  it("falls back to get_position simulation when ledger-entry decoding throws", async () => {
    // Decoding fails for position
    decodeValue.mockImplementation((value: { id: bigint; kind: string }) => {
      if (value.kind === "Position") {
        throw new Error("UDT decode error");
      }
      return {
        close_time: 0n,
        sets_minted: 1n,
        reserve_yes: 1n,
        reserve_no: 1n,
        status: { tag: "Open" },
      };
    });

    mockGetPosition.mockResolvedValue({
      yes: 2_000_000n,
      no: 1_000_000n,
    });

    const marketIds = [42n];
    const key = positionLedgerKey(42n, holder);
    const server = {
      getLedgerEntries: vi.fn(async () => ({
        entries: [fakeEntry(key, "Position", 42n)],
        latestLedger: 1000,
      })),
    };

    const results = await fetchPositionsFor(
      holder,
      marketIds,
      server as unknown as rpc.Server,
    );

    expect(mockGetPosition).toHaveBeenCalledWith({ market_id: 42n, holder });
    expect(results.length).toBe(1);
    expect(results[0].marketId).toBe(42n);
    expect(results[0].yes).toBe(2_000_000n);
  });

  it("returns empty array for empty marketIds or missing holder", async () => {
    expect(
      await fetchPositionsFor(null as unknown as ViewedAddress, [1n]),
    ).toEqual([]);
    expect(await fetchPositionsFor(holder, [])).toEqual([]);
  });
});
