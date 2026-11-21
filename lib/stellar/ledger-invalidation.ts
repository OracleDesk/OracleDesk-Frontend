import type { QueryClient } from "@tanstack/react-query";
import { xdr, scValToNative, type rpc } from "@stellar/stellar-sdk";
import { CONTRACTS } from "./config";
import { decodeMarketCoreEvent, type DecodedEvent } from "./events";
import { rpcServer } from "./clients";
import { ledgerClock, type LedgerInfo } from "./ledger-clock";
import { marketPriceStore, type MarketPriceStore } from "@/lib/realtime/market-price-store";

export interface InvalidatorOptions {
  queryClient: QueryClient;
  getUserAddress?: () => string | null;
  server?: Pick<rpc.Server, "getEvents">;
  marketCoreId?: string;
  usdcId?: string;
  priceStore?: MarketPriceStore;
  onDecodedEvents?: (events: DecodedEvent[], currentLedger: number, gapTriggered: boolean) => void;
}

export interface InvalidationSummary {
  invalidatedKeys: (readonly unknown[])[];
  eventsCount: number;
  gapTriggered: boolean;
}

export type DecodedEventListener = (
  events: DecodedEvent[],
  currentLedger: number,
  gapTriggered: boolean,
) => void;

export class LedgerInvalidator {
  private lastSeenLedger: number | null = null;
  private unsubscribeClock: (() => void) | null = null;
  private unsubscribeStall: (() => void) | null = null;
  private isProcessing = false;
  private deferredKeys = new Map<string, (readonly unknown[])[]>();
  private eventListeners = new Set<DecodedEventListener>();

  constructor(private readonly opts: InvalidatorOptions) {
    if (opts.onDecodedEvents) {
      this.eventListeners.add(opts.onDecodedEvents);
    }
  }

  onDecodedEvents(listener: DecodedEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  get lastSeen(): number | null {
    return this.lastSeenLedger;
  }

  setLastSeen(ledger: number | null): void {
    this.lastSeenLedger = ledger;
  }

  start(): () => void {
    if (this.unsubscribeClock) return this.unsubscribeClock;
    const store = this.opts.priceStore ?? marketPriceStore;
    this.unsubscribeStall = store.subscribeStall((marketId, isHealthy) => {
      if (!isHealthy) {
        this.flushDeferred(marketId);
      }
    });
    this.unsubscribeClock = ledgerClock.subscribe((ledger) => {
      if (ledger) {
        void this.handleNewLedger(ledger.sequence);
      }
    });
    return () => this.stop();
  }

  stop(): void {
    if (this.unsubscribeClock) {
      this.unsubscribeClock();
      this.unsubscribeClock = null;
    }
    if (this.unsubscribeStall) {
      this.unsubscribeStall();
      this.unsubscribeStall = null;
    }
    this.deferredKeys.clear();
  }

  flushDeferred(marketId: string): (readonly unknown[])[] {
    const keys = this.deferredKeys.get(marketId);
    if (!keys || keys.length === 0) return [];
    this.deferredKeys.delete(marketId);
    const store = this.opts.priceStore ?? marketPriceStore;
    store.resetDeferral(marketId);
    for (const key of keys) {
      this.opts.queryClient.invalidateQueries({ queryKey: key });
    }
    return keys;
  }

  async handleNewLedger(currentLedger: number): Promise<InvalidationSummary> {
    if (this.isProcessing) {
      return { invalidatedKeys: [], eventsCount: 0, gapTriggered: false };
    }

    if (this.lastSeenLedger === null) {
      this.lastSeenLedger = currentLedger;
      return { invalidatedKeys: [], eventsCount: 0, gapTriggered: false };
    }

    if (currentLedger <= this.lastSeenLedger) {
      return { invalidatedKeys: [], eventsCount: 0, gapTriggered: false };
    }

    const gap = currentLedger - this.lastSeenLedger;
    if (gap > 120) {
      // Gap > 120 ledgers: skip event parsing and broad invalidate
      this.lastSeenLedger = currentLedger;
      const keys = this.broadInvalidate();
      for (const listener of this.eventListeners) {
        listener([], currentLedger, true);
      }
      return { invalidatedKeys: keys, eventsCount: 0, gapTriggered: true };
    }

    this.isProcessing = true;
    try {
      const startLedger = this.lastSeenLedger + 1;
      const server = this.opts.server ?? rpcServer();
      const marketCoreId = this.opts.marketCoreId ?? CONTRACTS.marketCore;
      const usdcId = this.opts.usdcId ?? CONTRACTS.usdc;

      const filters: rpc.Api.EventFilter[] = [
        { type: "contract", contractIds: [marketCoreId] },
        { type: "contract", contractIds: [usdcId] },
      ];

      const response = await server.getEvents({
        startLedger,
        endLedger: currentLedger + 1,
        filters,
      });

      const events = response.events ?? [];
      const userAddress = this.opts.getUserAddress ? this.opts.getUserAddress() : null;
      const summary = this.invalidateForEvents(events, userAddress);
      this.lastSeenLedger = currentLedger;
      return summary;
    } catch {
      // If event query fails, keep lastSeenLedger so next tick can retry range or trigger gap
      return { invalidatedKeys: [], eventsCount: 0, gapTriggered: false };
    } finally {
      this.isProcessing = false;
    }
  }

  broadInvalidate(): (readonly unknown[])[] {
    const keys: (readonly unknown[])[] = [
      ["stellar"],
      ["markets"],
      ["positions"],
      ["portfolio"],
      ["traces"],
    ];
    for (const key of keys) {
      this.opts.queryClient.invalidateQueries({ queryKey: key });
    }
    return keys;
  }

  invalidateForEvents(
    events: rpc.Api.EventResponse[],
    userAddress: string | null
  ): InvalidationSummary {
    const invalidatedKeys: (readonly unknown[])[] = [];
    const seenKeys = new Set<string>();
    const decodedEvents: DecodedEvent[] = [];

    const recordKey = (key: readonly unknown[]) => {
      const serial = JSON.stringify(key);
      if (!seenKeys.has(serial)) {
        seenKeys.add(serial);
        invalidatedKeys.push(key);
        this.opts.queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const marketCoreId = this.opts.marketCoreId ?? CONTRACTS.marketCore;
    const usdcId = this.opts.usdcId ?? CONTRACTS.usdc;

    for (const event of events) {
      const contractId =
        typeof event.contractId === "string"
          ? event.contractId
          : event.contractId?.contractId();

      if (contractId === marketCoreId) {
        let decoded: DecodedEvent | null = null;
        try {
          decoded = decodeMarketCoreEvent(event);
        } catch {
          // If contract spec fails, check raw topics below
        }

        if (decoded) {
          decodedEvents.push(decoded);
          switch (decoded.kind) {
            case "Trade": {
              const id = decoded.marketId.toString();
              const store = this.opts.priceStore ?? marketPriceStore;
              if (store.shouldDeferInvalidation(id)) {
                // Stream is healthy for this market and within bounds: defer per-market invalidation
                this.deferredKeys.set(id, [
                  ["onChainMarket", id],
                  ["stellar", "market", id],
                  ["market", id],
                ]);
              } else {
                this.flushDeferred(id);
                recordKey(["onChainMarket", id]);
                recordKey(["stellar", "market", id]);
                recordKey(["market", id]);
              }
              recordKey(["markets"]);
              recordKey(["stellar", "markets"]);
              break;
            }
            case "MarketCreated": {
              recordKey(["markets"]);
              recordKey(["stellar", "markets"]);
              recordKey(["stellar", "marketCount"]);
              break;
            }
            case "MarketResolved": {
              const id = decoded.marketId.toString();
              recordKey(["onChainMarket", id]);
              recordKey(["stellar", "market", id]);
              recordKey(["market", id]);
              recordKey(["markets"]);
              recordKey(["positions"]);
              recordKey(["portfolio"]);
              recordKey(["stellar", "myPositions"]);
              break;
            }
            case "Redeemed": {
              const id = decoded.marketId.toString();
              recordKey(["positions"]);
              recordKey(["portfolio"]);
              recordKey(["stellar", "myPositions"]);
              recordKey(["stellar", "usdcBalance", decoded.holder]);
              recordKey(["usdcBalance", decoded.holder]);
              break;
            }
          }
        } else {
          // Fallback parsing for raw topics if spec parse was unavailable
          const topicStrings = this.extractTopicStrings(event.topic);
          if (topicStrings.some((t) => /trade/i.test(t))) {
            recordKey(["markets"]);
            recordKey(["stellar", "markets"]);
          }
          if (topicStrings.some((t) => /market_created/i.test(t))) {
            recordKey(["markets"]);
            recordKey(["stellar", "markets"]);
          }
          if (topicStrings.some((t) => /market_resolved/i.test(t))) {
            recordKey(["markets"]);
            recordKey(["positions"]);
            recordKey(["portfolio"]);
          }
        }
      } else if (contractId === usdcId || event.type === "contract") {
        // USDC Token event: check if user address is involved
        if (userAddress) {
          const involved = this.isAddressInEvent(event, userAddress);
          if (involved) {
            recordKey(["stellar", "usdcBalance", userAddress]);
            recordKey(["usdcBalance", userAddress]);
          }
        }
      }
    }

    for (const listener of this.eventListeners) {
      listener(decodedEvents, this.lastSeenLedger ?? 0, false);
    }

    return {
      invalidatedKeys,
      eventsCount: events.length,
      gapTriggered: false,
    };
  }

  private isAddressInEvent(event: rpc.Api.EventResponse, targetAddress: string): boolean {
    const topics = this.extractTopicStrings(event.topic as unknown[]);
    if (topics.some((t) => t.includes(targetAddress))) {
      return true;
    }
    const valNative = this.scValOrStringToNative(event.value);
    if (valNative && JSON.stringify(valNative).includes(targetAddress)) {
      return true;
    }
    return false;
  }

  private extractTopicStrings(topics?: unknown[]): string[] {
    if (!topics) return [];
    return topics.flatMap((t) => {
      const native = this.scValOrStringToNative(t);
      return native !== null && native !== undefined ? [String(native)] : [];
    });
  }

  private scValOrStringToNative(val: unknown): unknown {
    if (!val) return null;
    if (typeof val === "string") {
      try {
        return scValToNative(xdr.ScVal.fromXDR(val, "base64"));
      } catch {
        return val;
      }
    }
    try {
      return scValToNative(val as xdr.ScVal);
    } catch {
      return val;
    }
  }
}
