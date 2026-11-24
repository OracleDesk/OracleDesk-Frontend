import { exactEquitySeries, type ExactEquityOptions, type ExactEquityPoint, type LedgerEntry } from "./equity";
import { deserializeExactPoints, serializeExactOptions, serializeLedger } from "./equity-serialize";
import type { EquityWorkerRequest, EquityWorkerResponse } from "./equity.worker";

export async function computeExactEquity(
  ledger: readonly LedgerEntry[],
  opts: ExactEquityOptions,
): Promise<ExactEquityPoint[]> {
  if (typeof Worker === "undefined") return exactEquitySeries(ledger, opts);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./equity.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(exactEquitySeries(ledger, opts));
      return;
    }
    let settled = false;
    const finish = (points: ExactEquityPoint[]) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(points);
    };
    worker.onmessage = (event: MessageEvent<EquityWorkerResponse>) => {
      if (event.data.type === "error") {
        finish(exactEquitySeries(ledger, opts));
        return;
      }
      finish(deserializeExactPoints(event.data.points));
    };
    worker.onerror = () => finish(exactEquitySeries(ledger, opts));
    worker.onmessageerror = () => finish(exactEquitySeries(ledger, opts));
    const message: EquityWorkerRequest = {
      type: "series",
      ledger: serializeLedger(ledger),
      opts: serializeExactOptions(opts),
    };
    worker.postMessage(message);
  });
}
