import { Errors as MarketCoreErrors } from "@/lib/stellar/generated/market-core";
import { Errors as TreasuryErrors } from "@/lib/stellar/generated/treasury";
import { Errors as ResolverErrors } from "@/lib/stellar/generated/resolver";
import { Errors as ReasoningRegistryErrors } from "@/lib/stellar/generated/reasoning-registry";
import type { ContractName } from "@/lib/stellar/errors";

export const DESCRIBED_ERROR_KINDS = [
  "stale-sequence",
  "low-reserve",
  "rejected",
  "insufficient-balance",
  "insufficient-xlm",
  "account-not-found",
  "no-trustline",
  "contract",
  "wrong-network",
  "disconnected",
  "network",
  "submission",
  "expired",
  "archived",
  "bad-auth",
  "effects-mismatch",
  "unknown",
] as const;

export type DescribedErrorKind = (typeof DESCRIBED_ERROR_KINDS)[number];
export type KindCode = `kind.${DescribedErrorKind}`;
export type ContractCode = `contract.${ContractName}.${string}`;
export type ApiCode = `api.${ApiErrorCode}`;

export const API_ERROR_CODES = [
  "ADMIN_OP_EXPIRED",
  "ADMIN_OP_HASH_MISMATCH",
  "ADMIN_OP_NOT_READY",
  "ADMIN_OP_NOT_SIGNABLE",
  "ALLOWANCE_DAILY_LIMIT",
  "CHAIN_ERROR",
  "CHAIN_READ_FAILED",
  "CHALLENGE_EXPIRED",
  "CHALLENGE_NOT_FOUND",
  "CHALLENGE_SIGNATURE_INVALID",
  "FORBIDDEN",
  "INVALID_ADDRESS",
  "INVALID_CHALLENGE",
  "INVALID_MARKET_ID",
  "INVALID_TOKEN",
  "IPFS_RETRIEVAL_FAILED",
  "MARKET_NOT_FOUND",
  "MARKET_NOT_ON_CHAIN",
  "NO_EDGE",
  "PAYMENT_ALREADY_USED",
  "PAYMENT_FAILED",
  "PAYMENT_INSUFFICIENT",
  "PAYMENT_NOT_FOUND",
  "PAYMENT_WRONG_RECIPIENT",
  "PAYMENT_WRONG_SENDER",
  "PAYMENT_WRONG_TOKEN",
  "PREFLIGHT_FAILED",
  "RATE_LIMITED",
  "SIMULATION_FAILED",
  "STEP_UP_REQUIRED",
  "TESTNET_ONLY",
  "TOKEN_EXPIRED",
  "TRACE_NOT_FOUND",
  "TRACE_NOT_PUBLISHED",
  "UNAUTHORIZED",
  "UNSUPPORTED_ADMIN_KIND",
  "VALIDATION_ERROR",
  "TRACE_LOCKED",
  "BACKEND_UNREACHABLE",
  "HTTP_UNKNOWN",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ErrorCode = KindCode | ContractCode | ApiCode;

export const CONTRACT_TABLES: Record<ContractName, Record<number, { message: string }>> = {
  marketCore: MarketCoreErrors,
  treasury: TreasuryErrors,
  resolver: ResolverErrors,
  reasoningRegistry: ReasoningRegistryErrors,
};

/**
 * Note: Because generated Errors values are typed as { message: string },
 * contract-code exhaustiveness is enforced by the runtime coverage test rather
 * than the TypeScript type system.
 */
export function contractCodes(): ContractCode[] {
  const codes: ContractCode[] = [];
  for (const [contract, table] of Object.entries(CONTRACT_TABLES) as [ContractName, Record<number, { message: string }>][]) {
    for (const entry of Object.values(table)) {
      codes.push(`contract.${contract}.${entry.message}`);
    }
  }
  return codes;
}
