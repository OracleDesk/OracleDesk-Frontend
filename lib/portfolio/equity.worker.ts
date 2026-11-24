import { exactEquitySeries } from "./equity";
import {
  deserializeExactOptions,
  deserializeLedger,
  serializeExactPoints,
  type SerializedExactOptions,
  type SerializedLedgerEntry,
} from "./equity-serialize";

export type EquityWorkerRequest = {
  type: "series";
  ledger: SerializedLedgerEntry[];
  opts: SerializedExactOptions;
};

export type EquityWorkerResponse =
  | { type: "result"; points: ReturnType<typeof serializeExactPoints> }
  | { type: "error"; message: string };

export function handleEquityMessage(
  message: EquityWorkerRequest,
  post: (response: EquityWorkerResponse) => void,
): void {
  try {
    const points = exactEquitySeries(deserializeLedger(message.ledger), deserializeExactOptions(message.opts));
    post({ type: "result", points: serializeExactPoints(points) });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

if (typeof window === "undefined" && typeof self !== "undefined" && typeof self.postMessage === "function") {
  const scope = self as unknown as {
    postMessage: (response: EquityWorkerResponse) => void;
    onmessage: ((event: MessageEvent<EquityWorkerRequest>) => void) | null;
  };
  scope.onmessage = (event) => handleEquityMessage(event.data, (response) => scope.postMessage(response));
}
