import { arcTestnet, polygonAmoy } from "./chains";
import ABIS from "./abis.json";

// ─── Polymarket Configuration ───────────────────────────────────────────────

export const polymarketContracts = {
  ctfExchange: {
    address: (process.env.NEXT_PUBLIC_POLYGON_CTF_EXCHANGE ??
      "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E") as `0x${string}`,
  },
  negRisk: {
    address: (process.env.NEXT_PUBLIC_POLYGON_NEG_RISK ??
      "0xC5d563A36AE78145C45a50134d48A1215220f80a") as `0x${string}`,
  },
  apiUrl: process.env.NEXT_PUBLIC_POLYMARKET_API_URL ?? "https://clob.polymarket.com/order",
};

// ─── OracleDesk Contract Addresses ───────────────────────────────────────────
// TODO: Replace placeholders with deployed contract addresses after running
// your Hardhat / Foundry deploy scripts.

export const CONTRACTS = {
  arc: {
    /** Emits ReasoningPublished events; stores IPFS CID + SHA256 hash per trace */
    reasoningHasher: (process.env.NEXT_PUBLIC_REASONING_REGISTRY_ADDRESS ??
      "0xE3188B3b4E14d74E6110137FF91f12B981A82257") as `0x${string}`,

    /** OracleDesk Arc-native prediction market factory */
    marketFactory: (process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS ??
      "0xA24BB6956D722Ed0dc67D2Bd9f0b67C3A02A838a") as `0x${string}`,

    /** USDC on Arc */
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
      "0x3600000000000000000000000000000000000000") as `0x${string}`,

    /** EURC on Arc (internal treasury accounting only) */
    eurc: (process.env.NEXT_PUBLIC_EURC_ADDRESS ??
      "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`,
      
    /** Treasury Manager contract address */
    treasuryManager: (process.env.NEXT_PUBLIC_TREASURY_MANAGER_ADDRESS ??
      "0xb326E280D2e115B6BEC25154142970a90074e7F8") as `0x${string}`,

    /** Position Ledger contract address */
    positionLedger: (process.env.NEXT_PUBLIC_POSITION_LEDGER_ADDRESS ??
      "0x4ac9c8A1F68c6d8979343746825Df09DD1907b44") as `0x${string}`,
  },

  polygon: {
    /** Polymarket CTF Exchange — where binary market shares are traded */
    polymarketCTFExchange: (process.env.NEXT_PUBLIC_POLYGON_CTF_EXCHANGE ??
      "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E") as `0x${string}`,

    /** Polymarket Neg Risk CTF Exchange */
    polymarketNegRisk: (process.env.NEXT_PUBLIC_POLYGON_NEG_RISK ??
      "0xC5d563A36AE78145C45a50134d48A1215220f80a") as `0x${string}`,

    /** USDC on Polygon (PoS bridged) */
    usdc: (process.env.NEXT_PUBLIC_POLYGON_USDC ??
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174") as `0x${string}`,
  },
} as const;

// ─── OracleDesk Builder Code ──────────────────────────────────────────────────
// Polymarket V2 pays referral fees to any address routing bets via builder code.
// Every copy-trade (and agent trade) includes this to earn OracleDesk USDC.
// TODO: Replace with your registered builder address from Polymarket.
export const ORACLEDESK_BUILDER_CODE = (
  process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE ??
  "0xe4e1b060c21d4ce37c7902805345601e43acbbf976b7024a9a0b004277c6a1f3"
) as `0x${string}`;

// ─── ABIs ─────────────────────────────────────────────────────────────────────

/** ReasoningRegistry — Arc contract that stores IPFS CID + SHA256 per trace */
export const REASONING_HASHER_ABI = ABIS.ReasoningRegistry;

/** OracleDesk Market Factory — Arc prediction market creation */
export const MARKET_FACTORY_ABI = ABIS.MarketFactory;

/** Treasury Manager — Arc contract for capital management */
export const TREASURY_MANAGER_ABI = ABIS.TreasuryManager;

/** Position Ledger — Arc contract for tracking agent positions */
export const POSITION_LEDGER_ABI = ABIS.PositionLedger;

/** Prediction Market — Individual market contract ABI */
export const PREDICTION_MARKET_ABI = ABIS.PredictionMarket;

/** Minimal ERC-20 ABI for USDC approve + allowance checks */
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Polymarket CTF Exchange — simplified ABI for copy-trade execution */
export const POLYMARKET_CTF_ABI = [
  {
    type: "function",
    name: "fillOrder",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "signer", type: "address" },
          { name: "taker", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "makerAmount", type: "uint256" },
          { name: "takerAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "feeRateBps", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "signatureType", type: "uint8" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "fillAmount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ─── Chain → Contract map ─────────────────────────────────────────────────────
export const CHAIN_CONTRACTS: Record<number, typeof CONTRACTS.arc | typeof CONTRACTS.polygon> = {
  [arcTestnet.id]: CONTRACTS.arc,
  [polygonAmoy.id]: CONTRACTS.polygon,
};

// ─── USDC decimals ────────────────────────────────────────────────────────────
export const USDC_DECIMALS = 6n; // 1 USDC = 1_000_000 units

export const parseUsdc = (amount: number) =>
  BigInt(Math.round(amount * 1_000_000));

export const formatUsdc = (raw: bigint) =>
  Number(raw) / 1_000_000;
