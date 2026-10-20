import { groupForecasts, type Forecast, type GroupStats } from "./calibration";

export interface CalibrationRequest {
  id: number;
  forecasts: Forecast[];
  policy?: string;
  seed: number;
}

export interface CalibrationReply {
  id: number;
  perGroup: Record<string, GroupStats>;
}

/** Thin shell over groupForecasts so the heavy bootstrap runs off the main thread. */
export function handleMessage(msg: CalibrationRequest): CalibrationReply {
  return {
    id: msg.id,
    perGroup: groupForecasts(msg.forecasts, { seed: msg.seed, cluster: msg.policy === "all" }),
  };
}

const isWorker =
  typeof self !== "undefined" &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage === "function" &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === "function";

if (isWorker) {
  self.addEventListener("message", (event: MessageEvent) => {
    (self as unknown as Worker).postMessage(handleMessage(event.data as CalibrationRequest));
  });
}
