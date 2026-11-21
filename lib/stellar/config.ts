import { StrKey } from "@stellar/stellar-sdk";
import { parseAccount, parseContract, parseTxHash } from "../validation/ids";
import deployments from "./generated/deployments.testnet.json";
import { CONTRACT_MANIFEST } from "./generated/contract-manifest";
import {
  DEFAULT_IPFS_GATEWAY,
  DEFAULT_IPFS_MAX_TRACE_BYTES,
  MAX_IPFS_GATEWAYS,
  TESTNET_PASSPHRASE,
  formatProblems,
  parseGateways,
  validateConfig,
} from "../config/validate";
import type { RawConfig, ValidConfig } from "../config/validate";

/**
 * Network and contract configuration. Contract ids default to the synced
 * deployments file (lib/stellar/generated/, see scripts/sync-bindings.mjs);
 * each can be overridden with a NEXT_PUBLIC_* variable.
 *
 * Every value is validated by lib/config/validate.ts before this module
 * exports anything, so a malformed value fails the build with a full list of
 * problems instead of producing opaque simulation errors at runtime.
 *
 * Next.js only inlines NEXT_PUBLIC_* values referenced literally, so each one
 * is spelled out below.
 */

export type ConfigSource = "env" | "fallback";

/** Where each config value came from, for the debug panel. Read-only outside this module. */
const sources: Record<string, ConfigSource> = {};
export const CONFIG_SOURCES: Readonly<Record<string, ConfigSource>> = sources;

const used = (value: string | undefined) => Boolean(value && value.trim());

const env = (value: string | undefined, fallback: string, name?: string) => {
  if (name) sources[name] = used(value) ? "env" : "fallback";
  return used(value) ? (value as string).trim() : fallback;
};

export { TESTNET_PASSPHRASE, MAX_IPFS_GATEWAYS, DEFAULT_IPFS_GATEWAY, parseGateways };
export { DEFAULT_IPFS_MAX_TRACE_BYTES };

const nodeEnv: RawConfig["nodeEnv"] =
  process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";

// Literal references kept so Next can inline them into the browser bundle.
const rawContracts = {
  marketCore: env(process.env.NEXT_PUBLIC_MARKET_CORE_CONTRACT_ID, deployments.contracts.market_core, "CONTRACTS.marketCore"),
  treasury: env(process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID, deployments.contracts.treasury, "CONTRACTS.treasury"),
  resolver: env(process.env.NEXT_PUBLIC_RESOLVER_CONTRACT_ID, deployments.contracts.resolver, "CONTRACTS.resolver"),
  reasoningRegistry: env(process.env.NEXT_PUBLIC_REASONING_REGISTRY_CONTRACT_ID, deployments.contracts.reasoning_registry, "CONTRACTS.reasoningRegistry"),
  usdc: env(process.env.NEXT_PUBLIC_USDC_CONTRACT_ID, deployments.contracts.usdc, "CONTRACTS.usdc"),
};

const raw: RawConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  passphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
  rpcUrls: process.env.NEXT_PUBLIC_STELLAR_RPC_URLS,
  explorerUrl: process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL,
  contracts: rawContracts,
  paymentsRecipient: env(process.env.NEXT_PUBLIC_PAYMENTS_RECIPIENT, rawContracts.treasury, "PAYMENTS_RECIPIENT"),
  adminAddresses: process.env.NEXT_PUBLIC_ADMIN_ADDRESSES,
  ipfsGateway: process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL,
  x402Url: process.env.NEXT_PUBLIC_X402_URL,
  dailyPassPriceUsdc: process.env.NEXT_PUBLIC_DAILY_PASS_PRICE_USDC,
  nodeEnv,
};

if (used(process.env.NEXT_PUBLIC_API_URL)) sources.API_URL = "env";
if (used(process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL)) sources.IPFS_GATEWAY = "env";
if (used(process.env.NEXT_PUBLIC_IPFS_MAX_TRACE_BYTES)) sources.IPFS_MAX_TRACE_BYTES = "env";
sources.RPC_URL = used(process.env.NEXT_PUBLIC_STELLAR_RPC_URL) ? "env" : "fallback";
sources.RPC_URLS = used(process.env.NEXT_PUBLIC_STELLAR_RPC_URLS) ? "env" : "fallback";
sources.ADMIN_ADDRESSES = used(process.env.NEXT_PUBLIC_ADMIN_ADDRESSES) ? "env" : "fallback";

const result = validateConfig(raw);
if (!result.ok) {
  throw new Error(formatProblems(result.problems));
}
if (result.warnings.length) {
  for (const warning of result.warnings) {
    console.warn(`[config] ${warning.key} ${warning.value} ${warning.message}`);
  }
}

const config: ValidConfig = result.config;

/** Backend API base URL, validated (production builds require it explicitly). */
export const API_URL = config.apiUrl;
export const NETWORK_PASSPHRASE = config.passphrase;
export const NETWORK_LABEL = NETWORK_PASSPHRASE === TESTNET_PASSPHRASE ? "Stellar Testnet" : "Stellar";

/** Soroban RPC endpoints. The first entry is the primary; the rest are failover. */
export const RPC_URLS: readonly string[] = [config.rpcUrl, ...config.rpcUrls];
export const RPC_URL = RPC_URLS[0]; // unchanged export for existing callers
export const EXPLORER_URL = config.explorerUrl;

export const CONTRACTS = config.contracts;

/**
 * When set to "1" or "true", forces legacy `buy`/`sell` invocations even when
 * the deployed market-core contract exposes `buy_v2`/`sell_v2`.
 * Defaults to false (auto-detect on-chain capability, defaulting to legacy when absent).
 */
export const FORCE_LEGACY_TRADES: boolean =
  process.env.NEXT_PUBLIC_FORCE_LEGACY_TRADES === "1" ||
  process.env.NEXT_PUBLIC_FORCE_LEGACY_TRADES === "true";

/**
 * Expected USDC asset identifier (CODE:ISSUER). Defaults to USDC:deployer on testnet.
 */
export const USDC_ASSET = env(
  process.env.NEXT_PUBLIC_USDC_ASSET,
  NETWORK_PASSPHRASE === TESTNET_PASSPHRASE ? `USDC:${deployments.deployer}` : "",
  "USDC_ASSET"
);

/**
 * Recipient of premium payments. Must match the backend's PAYMENTS_RECIPIENT
 * or the backend will reject the payment. Defaults to the treasury, like the
 * backend (see docs/api.md for why that is a product decision).
 */
export const PAYMENTS_RECIPIENT = config.paymentsRecipient;

/* ------------------------------------------------------------------ *
 * Contract identities (issue #122)
 *
 * Every id above is a NEXT_PUBLIC_* override away from being an attacker's
 * address, and wallet prompts show 56 characters nobody reads. IDENTITIES
 * records what each configured id is, where it came from and whether it
 * still matches the pinned deployment manifest
 * (lib/stellar/generated/contract-manifest.ts); BUILD_IDENTITY summarises
 * that for the banner and the build-time check in next.config.ts.
 * ------------------------------------------------------------------ */

export type IdentityKey = keyof typeof CONTRACTS | "paymentsRecipient";

export interface IdentityEntry {
  key: IdentityKey;
  label: string;
  role: string;
  address: string;
  /** "manifest" = the pinned deployment's value; "env" = a NEXT_PUBLIC_* override. */
  source: "manifest" | "env";
  /** True when the address equals the manifest's value for a manifest it applies to. */
  matchesManifest: boolean;
}

/** The manifest describes the testnet deployment; another passphrase has no manifest. */
const MANIFEST_APPLIES =
  NETWORK_PASSPHRASE === TESTNET_PASSPHRASE && CONTRACT_MANIFEST.network === "testnet";

const IDENTITY_DEFS: ReadonlyArray<{
  key: IdentityKey;
  label: string;
  role: string;
  address: string;
  sourceName: string;
  canonical: string;
}> = [
  {
    key: "marketCore",
    label: "OracleDesk market contract",
    role: "Holds market liquidity and executes every share buy and sell.",
    address: CONTRACTS.marketCore,
    sourceName: "CONTRACTS.marketCore",
    canonical: CONTRACT_MANIFEST.contracts.marketCore,
  },
  {
    key: "treasury",
    label: "OracleDesk treasury",
    role: "Holds protocol funds, including the capital the agent trades with.",
    address: CONTRACTS.treasury,
    sourceName: "CONTRACTS.treasury",
    canonical: CONTRACT_MANIFEST.contracts.treasury,
  },
  {
    key: "resolver",
    label: "Resolver",
    role: "Resolves markets once they end and pays out winning shares.",
    address: CONTRACTS.resolver,
    sourceName: "CONTRACTS.resolver",
    canonical: CONTRACT_MANIFEST.contracts.resolver,
  },
  {
    key: "reasoningRegistry",
    label: "Reasoning registry",
    role: "Stores the published AI reasoning traces behind each market call.",
    address: CONTRACTS.reasoningRegistry,
    sourceName: "CONTRACTS.reasoningRegistry",
    canonical: CONTRACT_MANIFEST.contracts.reasoningRegistry,
  },
  {
    key: "usdc",
    label: "USDC (Stellar Asset Contract)",
    role: "The contract your USDC balance and payments move through.",
    address: CONTRACTS.usdc,
    sourceName: "CONTRACTS.usdc",
    canonical: CONTRACT_MANIFEST.contracts.usdc,
  },
  {
    key: "paymentsRecipient",
    label: "Premium payments recipient",
    role: "Receives your daily pass payment in USDC.",
    address: PAYMENTS_RECIPIENT,
    sourceName: "PAYMENTS_RECIPIENT",
    // The documented default: premium payments go to the treasury.
    canonical: CONTRACT_MANIFEST.contracts.treasury,
  },
];

export const IDENTITIES: Record<IdentityKey, IdentityEntry> = Object.fromEntries(
  IDENTITY_DEFS.map((def) => [
    def.key,
    {
      key: def.key,
      label: def.label,
      role: def.role,
      address: def.address,
      source: CONFIG_SOURCES[def.sourceName] === "env" ? ("env" as const) : ("manifest" as const),
      matchesManifest: MANIFEST_APPLIES && def.address === def.canonical,
    },
  ]),
) as Record<IdentityKey, IdentityEntry>;

/**
 * Summary of this build's contract addresses. `canonical` is false when any
 * id differs from the manifest (an override) or when no manifest applies to
 * the configured network — a non-testnet build is never claimed canonical.
 * The non-dismissable banner and the `ORACLEDESK_REQUIRE_CANONICAL=1` build
 * check both key off this.
 */
export const BUILD_IDENTITY: { canonical: boolean; overridden: IdentityKey[]; manifestCommit: string } = {
  canonical: MANIFEST_APPLIES && IDENTITY_DEFS.every((def) => def.address === def.canonical),
  overridden: IDENTITY_DEFS.filter((def) => !(MANIFEST_APPLIES && def.address === def.canonical)).map(
    (def) => def.key,
  ),
  manifestCommit: CONTRACT_MANIFEST.contractsCommit,
};

/**
 * Admin G-addresses. This is a UI gate only: the backend enforces admin
 * rights itself (ADMIN_ADDRESSES). Matched exactly, because Stellar
 * addresses are uppercase and case-sensitive.
 */
export const ADMIN_ADDRESSES: readonly string[] = config.adminAddresses;

export const isAdminAddress = (address: string | null | undefined) =>
  Boolean(address) && ADMIN_ADDRESSES.includes(address as string);

const validAgentAddress = (address: string) => {
  try {
    return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
  } catch {
    return false;
  }
};

/**
 * Extra reasoning-registry agents an operator knows about, for /admin/agents.
 * The page also discovers agents from AgentRegistered/TracePublished events
 * and the deployment file; this list covers agents whose events are older than
 * the RPC's retention window. Invalid entries are dropped instead of being
 * sent to the contract.
 */
export const KNOWN_AGENTS: readonly string[] = (process.env.NEXT_PUBLIC_KNOWN_AGENTS ?? "")
  .split(",")
  .map((address) => address.trim())
  .filter((address) => {
    if (!address) return false;
    if (validAgentAddress(address)) return true;
    console.warn(`[config] Ignoring invalid NEXT_PUBLIC_KNOWN_AGENTS entry: ${address}`);
    return false;
  });
sources.KNOWN_AGENTS = KNOWN_AGENTS.length ? "env" : "fallback";

/** Default YES-price tolerance (bps) for the admin diagnostics sampler. */
export const DIAGNOSTICS_TOLERANCE_BPS = (() => {
  const value = Number(process.env.NEXT_PUBLIC_DIAGNOSTICS_TOLERANCE_BPS);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 100;
})();

/** Gateways tried for trace content, in priority order. Use https (or http://localhost). */
export const IPFS_GATEWAYS: readonly string[] = config.ipfsGateways;
export const IPFS_GATEWAY = IPFS_GATEWAYS[0]; // unchanged export for existing callers

const rawTrustless = process.env.NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS;
export const IPFS_TRUSTLESS_GATEWAYS: readonly string[] = rawTrustless ? parseGateways(rawTrustless) : [];

const ipfsMaxBytesEnv = Number(process.env.NEXT_PUBLIC_IPFS_MAX_TRACE_BYTES);
/** Largest trace body read from a gateway. Larger responses are abandoned while streaming. */
export const IPFS_MAX_TRACE_BYTES =
  Number.isSafeInteger(ipfsMaxBytesEnv) && ipfsMaxBytesEnv > 0 ? ipfsMaxBytesEnv : DEFAULT_IPFS_MAX_TRACE_BYTES;

/** The contracts repo's x402 trace service (per-trace unlocks). Empty if not deployed. */
export const X402_URL = config.x402Url;

/** Daily-pass price in USDC base units, validated at startup. */
export const DAILY_PASS_PRICE_RAW: bigint = config.dailyPassPriceRaw;
/** Daily-pass price as the configured decimal string. */
export const DAILY_PASS_PRICE_USDC: string = config.dailyPassPriceUsdc;

/**
 * WalletConnect (mobile wallets such as LOBSTR and Freighter Mobile). Off
 * unless a WalletConnect Cloud project id is set. The project's allowed-origin
 * list is what protects it, not the id itself.
 */
export const WALLETCONNECT_PROJECT_ID = env(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, "");
/** Public URL of this app, shown to the wallet while it pairs. */
export const APP_URL = env(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
/** CAIP-2 id of the configured network (x402, WalletConnect and per-network storage keys). */
export const STELLAR_NETWORK_ID: "stellar:testnet" | "stellar:pubnet" =
  NETWORK_PASSPHRASE === TESTNET_PASSPHRASE ? "stellar:testnet" : "stellar:pubnet";
export const WALLETCONNECT_CHAIN = STELLAR_NETWORK_ID;

/** Explorer URL for a transaction hash, or null when the hash is not a 32-byte hex value. */
export const explorerTx = (hash: string): string | null => {
  const parsed = parseTxHash(hash);
  return parsed ? `${EXPLORER_URL}/tx/${parsed}` : null;
};

/** Explorer URL for a G… account or C… contract, or null for any other string. */
export const explorerAccount = (address: string): string | null => {
  const parsed = parseAccount(address) ?? parseContract(address);
  if (!parsed) return null;
  return `${EXPLORER_URL}/${parsed.startsWith("C") ? "contract" : "account"}/${parsed}`;
};
