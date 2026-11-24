import type { CidCheck } from "@/lib/stellar/cid";

export type BrowserOutcome =
  | "verified"
  | "mismatch"
  | "unavailable"
  | "not-on-chain"
  | "archived"
  | "cid-mismatch"
  | "unregistered-agent";

export type BackendAuditStatus =
  | "VERIFIED"
  | "HASH_MISMATCH"
  | "UNAVAILABLE"
  | "UNKNOWN_TO_BACKEND"
  | "WRONG_MARKET"
  | "UNLINKED_IN_DB"
  | "NOT_ON_CHAIN"
  | "FOREIGN_AGENT"
  | "ARCHIVED";

export interface BackendTraceAuditRow {
  status: BackendAuditStatus | string;
  onChainTraceId?: string | null;
  traceId?: string | null;
  onChainMarketId?: string | null;
  agent?: string | null;
  action?: string | null;
  ipfsCid?: string | null;
  onChainHash?: string | null;
  computedHash?: string | null;
  detail?: {
    dbHashMismatch?: boolean;
    cidMismatch?: boolean;
    error?: string;
    [key: string]: unknown;
  } | null;
}

export interface BrowserResult {
  outcome: BrowserOutcome;
  computedHash?: string | null;
  cidCheck?: CidCheck | string;
  statusCode?: number;
  registered?: boolean | null;
}

export type Disagreement =
  | {
      severity: "critical";
      kind: "backend-verified-browser-mismatch" | "backend-mismatch-browser-verified" | "backend-verified-without-content";
      backend: BackendAuditStatus | string;
      browser: BrowserOutcome;
      backendHash?: string | null;
      browserHash?: string | null;
      message: string;
    }
  | {
      severity: "warning";
      kind: "backend-unavailable-browser-verified" | "cid-digest-mismatch" | "status-scope-mismatch";
      backend: BackendAuditStatus | string;
      browser: BrowserOutcome;
      backendHash?: string | null;
      browserHash?: string | null;
      message: string;
    }
  | {
      severity: "info";
      kind: "backend-unavailable-browser-unavailable" | "linkage-only";
      backend: BackendAuditStatus | string;
      browser: BrowserOutcome;
      message: string;
    };

const LINKAGE_STATUSES = new Set(["WRONG_MARKET", "UNLINKED_IN_DB", "UNKNOWN_TO_BACKEND"]);

function disagreement<T extends Disagreement>(value: T): T {
  return value;
}

/** Precise backend-status × browser-outcome mapping used by the console. */
export function compare(backend: BackendTraceAuditRow, browser: BrowserResult): Disagreement | null {
  const status = backend.status;
  const outcome = browser.outcome;
  const backendHash = backend.computedHash ?? null;
  const browserHash = browser.computedHash ?? null;

  if (status === "VERIFIED" && outcome === "mismatch") {
    return disagreement({
      severity: "critical",
      kind: "backend-verified-browser-mismatch",
      backend: status,
      browser: outcome,
      backendHash,
      browserHash,
      message: "Backend verified the trace but the browser computed a different hash.",
    });
  }

  if (status === "HASH_MISMATCH" && outcome === "verified") {
    return disagreement({
      severity: "critical",
      kind: "backend-mismatch-browser-verified",
      backend: status,
      browser: outcome,
      backendHash,
      browserHash,
      message: "Backend reported a hash mismatch but the browser verified the content.",
    });
  }

  if (status === "VERIFIED" && backendHash === null) {
    return disagreement({
      severity: "critical",
      kind: "backend-verified-without-content",
      backend: status,
      browser: outcome,
      browserHash,
      message: "Backend verified this trace without recording a computed hash.",
    });
  }

  if (status === "UNAVAILABLE" && outcome === "verified") {
    return disagreement({
      severity: "warning",
      kind: "backend-unavailable-browser-verified",
      backend: status,
      browser: outcome,
      browserHash,
      message: "Backend could not fetch the trace but the browser verified it.",
    });
  }

  if (status === "UNAVAILABLE" && outcome === "unavailable") {
    return disagreement({
      severity: "info",
      kind: "backend-unavailable-browser-unavailable",
      backend: status,
      browser: outcome,
      message: "Neither system could fetch the trace.",
    });
  }

  if (status === "VERIFIED" && backend.detail?.dbHashMismatch) {
    return disagreement({
      severity: "warning",
      kind: "status-scope-mismatch",
      backend: status,
      browser: outcome,
      backendHash,
      browserHash,
      message: "Backend marked the trace verified though its database hash differs.",
    });
  }

  if (outcome === "cid-mismatch" || browser.cidCheck === "mismatch" || backend.detail?.cidMismatch) {
    return disagreement({
      severity: "warning",
      kind: "cid-digest-mismatch",
      backend: status,
      browser: outcome,
      message: "The gateway served bytes not named by the CID.",
    });
  }

  if (status === "FOREIGN_AGENT" && browser.registered === true) {
    return disagreement({
      severity: "warning",
      kind: "status-scope-mismatch",
      backend: status,
      browser: outcome,
      message: "Backend reports an unregistered agent but the registry lists it.",
    });
  }

  if (status === "NOT_ON_CHAIN" && outcome !== "not-on-chain") {
    return disagreement({
      severity: "warning",
      kind: "status-scope-mismatch",
      backend: status,
      browser: outcome,
      message: "Backend could not find the trace on chain but the browser did.",
    });
  }

  if (status === "ARCHIVED" && outcome !== "archived") {
    return disagreement({
      severity: "warning",
      kind: "status-scope-mismatch",
      backend: status,
      browser: outcome,
      message: "Backend reports an archived trace but the browser disagrees.",
    });
  }

  if (LINKAGE_STATUSES.has(status)) {
    return disagreement({
      severity: "info",
      kind: "linkage-only",
      backend: status,
      browser: outcome,
      message: "Database-linkage finding; the browser can only report the content verdict.",
    });
  }

  return null;
}
