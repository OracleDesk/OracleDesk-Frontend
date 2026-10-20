export interface TradeEventData {
  outcome: "Yes" | "No";
  isBuy: boolean;
  collateral: bigint;
  shares: bigint;
  fee: bigint;
  reserveYes: bigint;
  reserveNo: bigint;
}

/** Inverts a Trade event's post-trade reserves back to the reserves it started from. */
export function preTradeReserves(t: TradeEventData): { reserveYes: bigint; reserveNo: bigint } | null {
  const [postTraded, postOther] = t.outcome === "Yes" ? [t.reserveYes, t.reserveNo] : [t.reserveNo, t.reserveYes];
  let preTraded: bigint;
  let preOther: bigint;
  if (t.isBuy) {
    const net = t.collateral - t.fee;
    preOther = postOther - net;
    preTraded = postTraded - net + t.shares;
  } else {
    const gross = t.collateral + t.fee;
    preOther = postOther + gross;
    preTraded = postTraded + gross - t.shares;
  }
  if (preTraded <= 0n || preOther <= 0n) return null;
  return t.outcome === "Yes" ? { reserveYes: preTraded, reserveNo: preOther } : { reserveYes: preOther, reserveNo: preTraded };
}
