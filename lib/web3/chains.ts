import { defineChain } from "viem";

// ─── Arc Testnet ───────────────────────────────────────────────────────────────
// Arc is Circle's EVM-compatible chain used for the OracleDesk treasury,
// reasoning trace hashing, nanopayments, and agent wallets.
// TODO: Replace RPC_URL and chainId with the exact values from Circle/Agora docs.
export const arcTestnet = defineChain({
  id: 5042002, // Arc testnet chain ID
  name: "Arc Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app/",
    },
  },
  testnet: true,
});

// ─── Polygon Amoy (Polymarket testnet) ─────────────────────────────────────
// Bet execution chain. Polymarket contracts live on Polygon mainnet,
// but we target Amoy for the hackathon demo.
export const polygonAmoy = defineChain({
  id: 80001,
  name: "Polygon Amoy",
  nativeCurrency: {
    decimals: 18,
    name: "MATIC",
    symbol: "MATIC",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_POLYGON_RPC_URL ??
          "https://polygon-amoy.drpc.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "PolygonScan",
      url: "https://amoy.polygonscan.com/",
    },
  },
  testnet: true,
});

// ─── Chain helpers ────────────────────────────────────────────────────────────
export const SUPPORTED_CHAINS = [arcTestnet, polygonAmoy] as const;

export const CHAIN_NAMES: Record<number, string> = {
  [arcTestnet.id]: "Arc Testnet",
  [polygonAmoy.id]: "Polygon Amoy",
};

/** Returns a short label for UI badges */
export function getChainLabel(chainId: number | undefined): string {
  if (!chainId) return "Unknown";
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

/** True when the wallet is on Arc */
export const isArcChain = (chainId: number | undefined) =>
chainId === arcTestnet.id;

/** True when the wallet is on Polygon (mainnet or Amoy) */
export const isPolygonChain = (chainId: number | undefined) =>
chainId === 137 || chainId === polygonAmoy.id;