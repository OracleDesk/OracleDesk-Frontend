import { apiClient, type ApiRequestOptions } from "./client";

export interface SpecDiff {
  contract: string;
  item: string; // e.g. "fn x", "struct Market", "event Trade", "wasm", "spec"
  change: string;
  severity: "breaking" | "compatible" | "info";
}

export interface ContractCompat {
  contract: string;
  contractId: string;
  kind: string;
  wasmHash: string;
  expectedWasmHash?: string | null;
  wasmHashMatch: boolean;
  verified?: boolean;
  reason?: string;
  diffs: SpecDiff[];
  fingerprint?: string;
  entries?: Array<{ kind: string; name: string; sha256: string }>;
}

export interface SpecCompatReport {
  checkedAt: number;
  mode: "enforce" | "warn" | "off";
  bindingsCommit: string;
  ok: boolean;
  breaking: SpecDiff[];
  contracts: ContractCompat[];
}

export interface SpecCompatResponse {
  mode: "enforce" | "warn" | "off";
  report: SpecCompatReport | null;
}

export async function getSpecCompat(options?: ApiRequestOptions): Promise<SpecCompatResponse> {
  try {
    const { data } = await apiClient.get<SpecCompatResponse>(
      "/admin/chain/spec-compat",
      undefined,
      options,
    );
    if (!data || typeof data !== "object") {
      return { mode: "off", report: null };
    }
    return {
      mode: data.mode ?? "off",
      report: data.report ?? null,
    };
  } catch {
    return { mode: "off", report: null };
  }
}
