import {
  deserializeExportRow,
  encodeCsvChunks,
  toCsvLines,
  type ExportMeta,
  type ExportSection,
  type SerializedExportRow,
} from "./export-csv";

export type ExportWorkerRequest =
  | {
      id: string;
      sections: ExportSection[];
      rows: SerializedExportRow[];
      meta: ExportMeta;
      options?: {
        includeHeaderNotes?: boolean;
        excelBom?: boolean;
        chunkBytes?: number;
      };
    }
  | {
      id: string;
      cancel: true;
    };

export type ExportWorkerResponse =
  | {
      id: string;
      progress: number;
    }
  | {
      id: string;
      done: true;
      parts: ArrayBuffer[];
    }
  | {
      id: string;
      error: string;
    };

export interface ExportWorkerDeps {
  post: (message: ExportWorkerResponse, transfer?: Transferable[]) => void;
  cancelledIds: Set<string>;
}

const PROGRESS_INTERVAL_ROWS = 1_000;

export function handleMessage(
  message: ExportWorkerRequest,
  deps: ExportWorkerDeps,
): void {
  if ("cancel" in message) {
    deps.cancelledIds.add(message.id);
    return;
  }

  const { id, sections, rows, meta, options } = message;
  deps.cancelledIds.delete(id);

  try {
    const allowed = new Set<ExportSection>(sections);
    const filteredSerialized = rows.filter((r) => allowed.has(r.type));
    const total = filteredSerialized.length;

    let rowsDone = 0;
    function* deserializedRows() {
      for (const sRow of filteredSerialized) {
        if (deps.cancelledIds.has(id)) {
          return;
        }
        yield deserializeExportRow(sRow);
        rowsDone += 1;
        if (rowsDone % PROGRESS_INTERVAL_ROWS === 0 && total > 0) {
          deps.post({ id, progress: rowsDone / total });
        }
      }
    }

    const lines = toCsvLines(deserializedRows(), {
      sections,
      meta,
      includeHeaderNotes: options?.includeHeaderNotes ?? true,
      excelBom: options?.excelBom ?? true,
    });

    const parts = encodeCsvChunks(lines, {
      chunkBytes: options?.chunkBytes ?? 64 * 1024,
      isCancelled: () => deps.cancelledIds.has(id),
    });

    if (deps.cancelledIds.has(id)) {
      deps.cancelledIds.delete(id);
      return;
    }

    if (total > 0) {
      deps.post({ id, progress: 1 });
    }
    deps.post({ id, done: true, parts }, parts);
  } catch (err) {
    deps.post({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    deps.cancelledIds.delete(id);
  }
}

// Register only inside a real Web Worker, never in Node tests or on the main thread.
if (
  typeof window === "undefined" &&
  typeof self !== "undefined" &&
  typeof self.postMessage === "function"
) {
  const scope = self as unknown as {
    postMessage: (message: ExportWorkerResponse, transfer: Transferable[]) => void;
    onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
  };
  const cancelledIds = new Set<string>();
  scope.onmessage = (event) =>
    handleMessage(event.data, {
      post: (message, transfer = []) => scope.postMessage(message, transfer),
      cancelledIds,
    });
}
