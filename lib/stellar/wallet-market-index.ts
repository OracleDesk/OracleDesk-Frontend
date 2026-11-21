import type { rpc } from "@stellar/stellar-sdk";
import { rpcServer } from "./clients";
import { CONTRACTS, NETWORK_PASSPHRASE } from "./config";
import {
  decodeMarketCoreEvent,
  eventTopicFilter,
  eventWindow,
  fetchContractEvents,
  type DecodedEvent,
} from "./events";
import { chunks, isPosition, positionLedgerKey, readUdt, LEDGER_ENTRY_CHUNK_SIZE } from "./ledger-entries";

export interface WalletMarketIndex {
  v: 1;
  holder: string;
  networkPassphrase: string;
  marketCoreId: string;
  marketIds: string[]; // decimal u64, sorted, unique
  processedToLedger: number; // events applied through this ledger
  seededFromLedger: number; // oldest ledger covered by event seeding
  reconciled: {
    throughMarketId: string | null;
    completedAt: number | null;
    cursorId: string | null;
  };
  creatorScanThroughMarketId: string | null;
}

const DB_NAME = "oracledesk-wallet-index";
const DB_VERSION = 1;
const STORE = "indexes";

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

const memoryStore = new Map<string, WalletMarketIndex>();
const MEMORY_MAX = 32;

function memoryKey(networkPassphrase: string, marketCoreId: string, holder: string): string {
  return `${networkPassphrase}:${marketCoreId}:${holder}`;
}

function remember(index: WalletMarketIndex): void {
  const k = memoryKey(index.networkPassphrase, index.marketCoreId, index.holder);
  memoryStore.delete(k);
  memoryStore.set(k, index);
  if (memoryStore.size > MEMORY_MAX) {
    memoryStore.delete(memoryStore.keys().next().value!);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    request.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

export async function getIndex(
  holder: string,
  networkPassphrase = NETWORK_PASSPHRASE,
  marketCoreId = CONTRACTS.marketCore,
): Promise<WalletMarketIndex | null> {
  const k = memoryKey(networkPassphrase, marketCoreId, holder);
  if (!idbAvailable()) return memoryStore.get(k) ?? null;
  try {
    const db = await openDb();
    const value = await new Promise<WalletMarketIndex | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(k);
      request.onsuccess = () => resolve((request.result as WalletMarketIndex | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
    });
    db.close();
    if (!value || value.v !== 1 || !Array.isArray(value.marketIds)) {
      return memoryStore.get(k) ?? null;
    }
    remember(value);
    return value;
  } catch {
    return memoryStore.get(k) ?? null;
  }
}

export async function saveIndex(index: WalletMarketIndex): Promise<boolean> {
  remember(index);
  if (!idbAvailable()) return false;
  const k = memoryKey(index.networkPassphrase, index.marketCoreId, index.holder);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(index, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function clearIndex(
  holder: string,
  networkPassphrase = NETWORK_PASSPHRASE,
  marketCoreId = CONTRACTS.marketCore,
): Promise<void> {
  const k = memoryKey(networkPassphrase, marketCoreId, holder);
  memoryStore.delete(k);
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"));
    });
    db.close();
  } catch {
    // Ignore error
  }
}

export async function dropAllIndexes(): Promise<void> {
  memoryStore.clear();
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB clear failed"));
    });
    db.close();
  } catch {
    // Ignore error
  }
}

export function sortAndDedupeMarketIds(ids: (string | bigint)[]): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    set.add(id.toString());
  }
  return [...set].sort((a, b) => {
    const diff = BigInt(a) - BigInt(b);
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });
}

/**
 * Seeds the discovery index for a holder from Trade, Redeemed, and MarketCreated events.
 */
export async function seedIndex(
  holder: string,
  opts?: {
    server?: rpc.Server;
    signal?: AbortSignal;
    networkPassphrase?: string;
    marketCoreId?: string;
  },
): Promise<WalletMarketIndex> {
  const networkPassphrase = opts?.networkPassphrase ?? NETWORK_PASSPHRASE;
  const marketCoreId = opts?.marketCoreId ?? CONTRACTS.marketCore;
  const existing = await getIndex(holder, networkPassphrase, marketCoreId);

  const w = await eventWindow(opts?.server as any);
  const startLedger = existing ? existing.processedToLedger + 1 : w.oldestLedger;
  const endLedger = w.latestLedger + 1;

  const foundIds = new Set<string>(existing?.marketIds ?? []);

  if (startLedger < endLedger) {
    // 1. Fetch Trade and Redeemed events for holder
    try {
      const topicFilters = [
        eventTopicFilter("Trade", { trader: holder }),
        eventTopicFilter("Redeemed", { holder }),
      ];
      const readResult = await fetchContractEvents({
        contractId: marketCoreId,
        startLedger,
        endLedger,
        topicFilters,
        signal: opts?.signal,
      });

      for (const ev of readResult.events) {
        const decoded = decodeMarketCoreEvent(ev as any);
        if (decoded && (decoded.kind === "Trade" || decoded.kind === "Redeemed")) {
          foundIds.add(decoded.marketId.toString());
        }
      }
    } catch {
      // Continue with partial seeding
    }

    // 2. Fetch MarketCreated for creator leftovers (creator is in data payload)
    try {
      const topicFilters = [eventTopicFilter("MarketCreated")];
      const readResult = await fetchContractEvents({
        contractId: marketCoreId,
        startLedger,
        endLedger,
        topicFilters,
        signal: opts?.signal,
      });

      for (const ev of readResult.events) {
        const decoded = decodeMarketCoreEvent(ev as any);
        if (decoded && decoded.kind === "MarketCreated" && decoded.creator === holder) {
          foundIds.add(decoded.marketId.toString());
        }
      }
    } catch {
      // Continue with partial seeding
    }
  }

  const updated: WalletMarketIndex = {
    v: 1,
    holder,
    networkPassphrase,
    marketCoreId,
    marketIds: sortAndDedupeMarketIds([...foundIds]),
    processedToLedger: Math.max(existing?.processedToLedger ?? 0, w.latestLedger),
    seededFromLedger: existing?.seededFromLedger ?? w.oldestLedger,
    reconciled: existing?.reconciled ?? { throughMarketId: null, completedAt: null, cursorId: null },
    creatorScanThroughMarketId: existing?.creatorScanThroughMarketId ?? null,
  };

  await saveIndex(updated);
  return updated;
}

/**
 * Reconciles the index in background across all market ids from totalMarkets - 1 down to 0.
 * Rate-limited to <= 2 chunk calls per second.
 */
export async function reconcileIndex(
  holder: string,
  totalMarkets: bigint,
  opts?: {
    server?: rpc.Server;
    signal?: AbortSignal;
    onProgress?: (scanned: number, total: number) => void;
    networkPassphrase?: string;
    marketCoreId?: string;
  },
): Promise<WalletMarketIndex> {
  const server = opts?.server ?? rpcServer();
  const networkPassphrase = opts?.networkPassphrase ?? NETWORK_PASSPHRASE;
  const marketCoreId = opts?.marketCoreId ?? CONTRACTS.marketCore;
  let index = (await getIndex(holder, networkPassphrase, marketCoreId)) ?? (await seedIndex(holder, opts));

  if (totalMarkets <= 0n) return index;

  const totalNum = Number(totalMarkets);
  const startId = index.reconciled.cursorId ? BigInt(index.reconciled.cursorId) : totalMarkets - 1n;

  const allIds: bigint[] = [];
  for (let id = startId; id >= 0n; id--) {
    allIds.push(id);
  }

  const chunkList = chunks(allIds, LEDGER_ENTRY_CHUNK_SIZE);
  let scannedCount = totalNum - allIds.length;
  const discoveredIds = new Set<string>(index.marketIds);

  for (const chunk of chunkList) {
    if (opts?.signal?.aborted) break;

    const keys = chunk.map((id) => ({ id, key: positionLedgerKey(id, holder) }));
    const response = await server.getLedgerEntries(...keys.map(({ key }) => key));
    const idByKey = new Map(keys.map(({ id, key }) => [key.toXDR("base64"), id]));

    for (const entry of response.entries) {
      const id = idByKey.get(entry.key.toXDR("base64"));
      if (id === undefined) continue;
      const position = readUdt<unknown>("Position", entry.val.contractData().val());
      if (isPosition(position) && (position.yes > 0n || position.no > 0n)) {
        discoveredIds.add(id.toString());
      }
    }

    scannedCount += chunk.length;
    opts?.onProgress?.(scannedCount, totalNum);

    const lastId = chunk[chunk.length - 1];
    index = {
      ...index,
      marketIds: sortAndDedupeMarketIds([...discoveredIds]),
      reconciled: {
        throughMarketId: lastId.toString(),
        cursorId: lastId > 0n ? (lastId - 1n).toString() : null,
        completedAt: lastId === 0n ? Date.now() : null,
      },
    };
    await saveIndex(index);

    // Rate-limit: wait 500 ms (max 2 chunk calls per second)
    if (chunk !== chunkList[chunkList.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return index;
}
