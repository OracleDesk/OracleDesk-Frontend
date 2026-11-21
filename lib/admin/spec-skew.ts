import type { ContractKey, IntegrityResult } from "@/lib/stellar/contract-check";
import type { SpecCompatReport, SpecDiff } from "@/lib/api/admin";

export type SkewVerdict =
  | "all-equal"
  | "frontend-behind-chain"
  | "backend-behind-chain"
  | "frontend-backend-differ"
  | "different-deployments"
  | "unknown";

export interface ContractSkewRow {
  contract: ContractKey;
  frontend: {
    id: string;
    wasmHash?: string;
    bundled?: string;
    onChain?: string;
    status: IntegrityResult["status"];
  };
  backend: {
    id?: string;
    wasmHash?: string | null;
    expectedWasmHash?: string | null;
    verified?: boolean;
    diffs: SpecDiff[];
    fingerprint?: string;
  };
  commits: {
    frontend: string;
    backend?: string;
  };
  verdict: SkewVerdict;
  reasons: string[];
}

export function compareSkew(
  fe: Record<ContractKey, IntegrityResult>,
  be: SpecCompatReport | null,
  commits: { frontend: string },
): ContractSkewRow[] {
  const contractKeys: ContractKey[] = ["marketCore", "treasury", "resolver", "reasoningRegistry"];
  const rows: ContractSkewRow[] = [];

  const beContractMap = new Map<string, (typeof be)["contracts"][0]>();
  if (be && Array.isArray(be.contracts)) {
    for (const c of be.contracts) {
      beContractMap.set(c.contract.toLowerCase(), c);
      beContractMap.set(c.contract, c);
    }
  }

  for (const key of contractKeys) {
    const fRes = fe[key];
    const beRes = beContractMap.get(key) ?? beContractMap.get(key.toLowerCase());

    const frontend = {
      id: fRes?.id ?? "",
      wasmHash: fRes?.wasmHash,
      bundled: fRes?.bundledFingerprint,
      onChain: fRes?.onChainFingerprint,
      status: fRes?.status ?? "unchecked",
    };

    const backend = {
      id: beRes?.contractId,
      wasmHash: beRes?.wasmHash ?? null,
      expectedWasmHash: beRes?.expectedWasmHash ?? null,
      verified: beRes?.verified,
      diffs: beRes?.diffs ?? [],
      fingerprint: beRes?.fingerprint,
    };

    const commitsData = {
      frontend: commits.frontend,
      backend: be?.bindingsCommit,
    };

    const reasons: string[] = [];
    let verdict: SkewVerdict = "unknown";

    if (!be || beRes?.verified === false) {
      verdict = "unknown";
      reasons.push(be ? "Backend report not verified" : "Backend spec-compat report unavailable");
    } else if (
      backend.id &&
      frontend.id &&
      backend.id.toLowerCase() !== frontend.id.toLowerCase()
    ) {
      verdict = "different-deployments";
      reasons.push(`Contract ID mismatch: frontend=${frontend.id}, backend=${backend.id}`);
    } else if (
      backend.wasmHash &&
      frontend.wasmHash &&
      backend.wasmHash.toLowerCase() !== frontend.wasmHash.toLowerCase()
    ) {
      verdict = "different-deployments";
      reasons.push(`WASM hash mismatch: frontend=${frontend.wasmHash}, backend=${backend.wasmHash}`);
    } else if (
      backend.fingerprint &&
      frontend.bundled &&
      backend.fingerprint === frontend.bundled &&
      frontend.status === "match"
    ) {
      verdict = "all-equal";
      reasons.push("Specs identical across frontend, backend, and on-chain");
    } else {
      const feMatch = frontend.status === "match";
      const beHasBreaking = backend.diffs.some((d) => d.severity === "breaking");
      const beHasDiffs = backend.diffs.length > 0;
      const equalCommits = Boolean(commitsData.backend && commitsData.frontend === commitsData.backend);

      if (!feMatch && !beHasBreaking) {
        verdict = "frontend-behind-chain";
        reasons.push("Frontend bundled spec differs from on-chain, but backend is compatible");
      } else if (feMatch && beHasDiffs) {
        verdict = "backend-behind-chain";
        reasons.push("Frontend spec matches on-chain, but backend has spec diffs");
      } else if (!feMatch && beHasBreaking && !equalCommits) {
        verdict = "frontend-backend-differ";
        reasons.push("Both frontend and backend mismatch chain with different pinned commits");
      } else if (feMatch && !beHasDiffs && equalCommits) {
        verdict = "all-equal";
        reasons.push("Matching specs, zero backend diffs, and matching pinned commits");
      } else {
        verdict = "unknown";
        reasons.push("Unresolved skew between frontend, backend, and chain state");
      }
    }

    rows.push({
      contract: key,
      frontend,
      backend,
      commits: commitsData,
      verdict,
      reasons,
    });
  }

  return rows;
}
