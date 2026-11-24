import { deserializePoints, serializePoints, type SerializedPricePoint } from "@/lib/stellar/price-history";
import type { ExactEquityPoint, ExactEquityOptions, LedgerEntry } from "./equity";

export type SerializedLedgerEntry = Record<string, unknown>;

const str = (value: bigint | undefined): string | undefined => value === undefined ? undefined : value.toString();
const big = (value: unknown): bigint => BigInt(String(value));

export function serializeLedger(entries: readonly LedgerEntry[]): SerializedLedgerEntry[] {
  return entries.map((entry) => ({
    ...entry,
    ...(entry.fee !== undefined ? { fee: str(entry.fee) } : {}),
    ...(entry.kind === "buy" || entry.kind === "sell"
      ? { collateral: str(entry.collateral), shares: str(entry.shares) }
      : {}),
    ...(entry.kind === "seed"
      ? { seed: str(entry.seed), yesShares: str(entry.yesShares), noShares: str(entry.noShares) }
      : {}),
    ...(entry.kind === "redeem" || entry.kind === "pool-claim" ? { payout: str(entry.payout) } : {}),
  }));
}

export function deserializeLedger(entries: readonly SerializedLedgerEntry[]): LedgerEntry[] {
  return entries.map((raw) => {
    const base = {
      id: raw.id as string | undefined,
      ledger: raw.ledger as number | undefined,
      time: raw.time as number,
      marketId: raw.marketId as string,
      txHash: raw.txHash as string,
      fee: raw.fee === undefined ? undefined : big(raw.fee),
    };
    switch (raw.kind) {
      case "buy":
      case "sell":
        return { ...base, kind: raw.kind, outcome: raw.outcome as "Yes" | "No", collateral: big(raw.collateral), shares: big(raw.shares) };
      case "seed":
        return { ...base, kind: "seed", seed: big(raw.seed), yesShares: big(raw.yesShares), noShares: big(raw.noShares) };
      case "redeem":
        return { ...base, kind: "redeem", payout: big(raw.payout) };
      case "pool-claim":
        return { ...base, kind: "pool-claim", payout: big(raw.payout) };
      default:
        throw new Error(`Unknown ledger entry kind: ${String(raw.kind)}`);
    }
  });
}

export interface SerializedExactOptions {
  streams: Record<string, SerializedPricePoint[]>;
  feeBps: Record<string, string>;
  finals: ExactEquityOptions["finals"];
  closeTimes?: Record<string, string>;
  coverage?: ExactEquityOptions["coverage"];
  basis?: ExactEquityOptions["basis"];
  reconcileFinals?: boolean;
}

export function serializeExactOptions(opts: ExactEquityOptions): SerializedExactOptions {
  return {
    streams: Object.fromEntries(Object.entries(opts.streams).map(([id, points]) => [id, serializePoints(points)])),
    feeBps: Object.fromEntries(Object.entries(opts.feeBps).map(([id, value]) => [id, value.toString()])),
    finals: { ...opts.finals },
    ...(opts.closeTimes
      ? { closeTimes: Object.fromEntries(Object.entries(opts.closeTimes).map(([id, value]) => [id, value.toString()])) }
      : {}),
    ...(opts.coverage ? { coverage: opts.coverage } : {}),
    ...(opts.basis ? { basis: opts.basis } : {}),
    ...(opts.reconcileFinals ? { reconcileFinals: true } : {}),
  };
}

export function deserializeExactOptions(opts: SerializedExactOptions): ExactEquityOptions {
  return {
    streams: Object.fromEntries(Object.entries(opts.streams).map(([id, points]) => [id, deserializePoints(points)])),
    feeBps: Object.fromEntries(Object.entries(opts.feeBps).map(([id, value]) => [id, big(value)])),
    finals: { ...opts.finals },
    ...(opts.closeTimes
      ? { closeTimes: Object.fromEntries(Object.entries(opts.closeTimes).map(([id, value]) => [id, big(value)])) }
      : {}),
    ...(opts.coverage ? { coverage: opts.coverage } : {}),
    ...(opts.basis ? { basis: opts.basis } : {}),
    ...(opts.reconcileFinals ? { reconcileFinals: true } : {}),
  };
}

export type SerializedExactPoint = {
  ledger: number;
  time: number;
  cashFlow: string;
  mid: string;
  liquidation: string;
  markValue: string;
  equity: string;
  partial: boolean;
  lower: string;
  upper: string;
};

export function serializeExactPoints(points: readonly ExactEquityPoint[]): SerializedExactPoint[] {
  return points.map((point) => ({
    ledger: point.ledger,
    time: point.time,
    cashFlow: point.cashFlow.toString(),
    mid: point.mid.toString(),
    liquidation: point.liquidation.toString(),
    markValue: point.markValue.toString(),
    equity: point.equity.toString(),
    partial: point.partial,
    lower: point.lower.toString(),
    upper: point.upper.toString(),
  }));
}

export function deserializeExactPoints(points: readonly SerializedExactPoint[]): ExactEquityPoint[] {
  return points.map((point) => ({
    ledger: point.ledger,
    time: point.time,
    cashFlow: big(point.cashFlow),
    mid: big(point.mid),
    liquidation: big(point.liquidation),
    markValue: big(point.markValue),
    equity: big(point.equity),
    partial: point.partial,
    lower: big(point.lower),
    upper: big(point.upper),
  }));
}
