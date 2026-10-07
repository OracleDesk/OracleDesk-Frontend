import { IPFS_GATEWAY } from "./config";

/**
 * Browser port of x402/trace-verification.ts from the contracts repo:
 * hash the exact bytes received and compare with the on-chain trace_hash.
 * Uses WebCrypto, so the checks are async.
 */

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(content: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", content as BufferSource));
}

export function normalizeHash(hash: string): string {
  return hash.toLowerCase().replace(/^0x/, "");
}

export async function verifyTraceHash(content: Uint8Array, expectedHash: string): Promise<boolean> {
  const normalized = normalizeHash(expectedHash);
  return /^[0-9a-f]{64}$/.test(normalized) && (await sha256Hex(content)) === normalized;
}

/** Gateway URL for a CID; accepts bare CIDs and ipfs:// URIs. */
export function ipfsUrl(cid: string, gateway: string = IPFS_GATEWAY): string {
  const bare = cid.replace(/^ipfs:\/\//, "");
  const base = gateway.endsWith("/") ? gateway.slice(0, -1) : gateway;
  return `${base}/${encodeURIComponent(bare)}`;
}

export type TraceCheck =
  | { status: "verified"; content: unknown; computedHash: string }
  | { status: "mismatch"; computedHash: string }
  | { status: "unavailable"; reason: string };

/**
 * Fetches trace content and checks it against the on-chain hash. Content is
 * only returned when it is verified; callers must never render anything
 * else as the trace.
 */
export async function fetchAndVerifyTrace(
  cid: string,
  onChainHash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TraceCheck> {
  let bytes: Uint8Array;
  try {
    const res = await fetchImpl(ipfsUrl(cid));
    if (!res.ok) return { status: "unavailable", reason: `IPFS gateway returned HTTP ${res.status}` };
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return { status: "unavailable", reason: "Couldn't reach the IPFS gateway" };
  }
  const computedHash = await sha256Hex(bytes);
  if (computedHash !== normalizeHash(onChainHash)) return { status: "mismatch", computedHash };
  try {
    return { status: "verified", content: JSON.parse(new TextDecoder().decode(bytes)), computedHash };
  } catch {
    return { status: "verified", content: new TextDecoder().decode(bytes), computedHash };
  }
}
