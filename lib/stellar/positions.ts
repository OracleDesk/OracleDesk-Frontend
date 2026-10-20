import { rpc } from "@stellar/stellar-sdk";
import { marketCore, rpcServer } from "./clients";
import { simulated } from "./typed-call";
import type { ViewedAddress } from "./identity";
import type { Market, Position } from "./generated/market-core";
import {
  chunks,
  isMarket,
  isPosition,
  marketLedgerKey,
  positionLedgerKey,
  readUdt,
  settlementOf,
  LEDGER_ENTRY_CHUNK_SIZE,
} from "./ledger-entries";
import { positionValue, type HolderPosition } from "./my-positions";

export type { HolderPosition };

/**
 * Fallback to per-market get_position contract simulation if ledger-entry
 * decoding fails or encounters an unreadable format.
 */
export async function fallbackGetPosition(
  marketId: bigint,
  holder: string,
): Promise<Position | null> {
  try {
    const tx = await marketCore().get_position({ market_id: marketId, holder });
    const pos = simulated(tx) as Position;
    return isPosition(pos) ? pos : null;
  } catch {
    return null;
  }
}

/**
 * Reads positions for a ViewedAddress across specified market IDs using batched
 * getLedgerEntries (up to 200 keys per RPC round trip).
 *
 * Gracefully falls back to get_position simulation if ledger-entry decoding fails.
 * Filters out zero positions (yes == 0 and no == 0).
 */
export async function fetchPositionsFor(
  holder: ViewedAddress,
  marketIds: bigint[],
  server: rpc.Server = rpcServer(),
): Promise<HolderPosition[]> {
  if (!holder || marketIds.length === 0) return [];

  const found = new Map<bigint, Position>();

  for (const idChunk of chunks(marketIds, LEDGER_ENTRY_CHUNK_SIZE)) {
    const keys = idChunk.map((id) => ({ id, key: positionLedgerKey(id, holder) }));
    let entries: rpc.Api.LedgerEntryResult[] = [];
    try {
      const response = await server.getLedgerEntries(...keys.map(({ key }) => key));
      entries = response.entries;
    } catch {
      // If batched getLedgerEntries fails, fall back to individual simulation for this chunk
      for (const { id } of keys) {
        const simPos = await fallbackGetPosition(id, holder);
        if (simPos && (simPos.yes > 0n || simPos.no > 0n)) {
          found.set(id, simPos);
        }
      }
      continue;
    }

    const idByKey = new Map(keys.map(({ id, key }) => [key.toXDR("base64"), id]));
    for (const entry of entries) {
      const id = idByKey.get(entry.key.toXDR("base64"));
      if (id === undefined) continue;

      let position: Position | null = null;
      try {
        const udt = readUdt<unknown>("Position", entry.val.contractData().val());
        if (isPosition(udt)) {
          position = udt;
        }
      } catch {
        // Fallback to contract simulation on decode failure
        position = await fallbackGetPosition(id, holder);
      }

      if (position && (position.yes > 0n || position.no > 0n)) {
        found.set(id, position);
      }
    }
  }

  if (found.size === 0) return [];

  // Batch read market entries for markets where user holds positions
  const holdingIds = [...found.keys()];
  const markets = new Map<bigint, Market>();
  const archivedIds = new Map<bigint, boolean>();
  let latestLedger = 0;

  for (const idChunk of chunks(holdingIds, LEDGER_ENTRY_CHUNK_SIZE)) {
    const keys = idChunk.map((id) => ({ id, key: marketLedgerKey(id) }));
    try {
      const response = await server.getLedgerEntries(...keys.map(({ key }) => key));
      latestLedger = Math.max(latestLedger, response.latestLedger);
      const idByKey = new Map(keys.map(({ id, key }) => [key.toXDR("base64"), id]));
      for (const entry of response.entries) {
        const id = idByKey.get(entry.key.toXDR("base64"));
        if (id === undefined) continue;
        try {
          const market = readUdt<unknown>("Market", entry.val.contractData().val());
          if (isMarket(market)) {
            markets.set(id, market);
            archivedIds.set(id, entry.liveUntilLedgerSeq !== undefined && entry.liveUntilLedgerSeq < latestLedger);
          }
        } catch {
          // ignore unreadable market entries
        }
      }
    } catch {
      // ignore getLedgerEntries errors for markets
    }
  }

  const positions: HolderPosition[] = [...found.entries()]
    .map(([marketId, position]) => {
      const market = markets.get(marketId) ?? null;
      const settlement = market ? settlementOf(market.status) : null;
      const valuation = market ? positionValue(position, market) : null;
      return {
        marketId,
        yes: position.yes,
        no: position.no,
        market,
        settlement,
        valueRaw: valuation?.valueRaw ?? null,
        yesBps: valuation?.yesBps ?? null,
        archived: archivedIds.get(marketId) ?? false,
      };
    })
    .sort((a, b) => (a.marketId < b.marketId ? 1 : a.marketId > b.marketId ? -1 : 0));

  return positions;
}
