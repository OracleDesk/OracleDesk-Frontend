import { StrKey } from "@stellar/stellar-sdk";
import type { Signer } from "./clients";

declare const viewed: unique symbol;
declare const signerBrand: unique symbol;

export type ViewedAddress = string & { readonly [viewed]: true };
export type SignerAddress = string & { readonly [signerBrand]: true };

export type WatchAddressValidation =
  | { ok: true; address: ViewedAddress; warning?: string }
  | { ok: false; error: string };

/**
 * Validates a watch address string with user-friendly error messages for
 * invalid format, lowercase characters, or unsupported muxed addresses.
 */
export function validateWatchAddress(s: string | null | undefined): WatchAddressValidation {
  if (!s || typeof s !== "string" || s.trim().length === 0) {
    return { ok: false, error: "Please enter a valid Stellar address." };
  }

  const trimmed = s.trim();

  // StrKey is case-sensitive; uppercase check is strictly enforced
  if (trimmed !== trimmed.toUpperCase()) {
    return {
      ok: false,
      error: "Address must be uppercase. Stellar public keys and contract IDs are case-sensitive.",
    };
  }

  // Muxed addresses are not valid holders for market-core
  if (trimmed.startsWith("M")) {
    return {
      ok: false,
      error: "Muxed addresses (M...) are not supported. Please use the underlying G... account address.",
    };
  }

  try {
    if (StrKey.isValidEd25519PublicKey(trimmed)) {
      return { ok: true, address: trimmed as ViewedAddress };
    }
    if (StrKey.isValidContract(trimmed)) {
      return { ok: true, address: trimmed as ViewedAddress, warning: "Contract address: display is limited to available on-chain data." };
    }
  } catch {
    return { ok: false, error: "Invalid checksum for Stellar address." };
  }

  return { ok: false, error: "Invalid Stellar address. Expected a G... account or C... contract ID." };
}

/**
 * Validates and brands an address as a ViewedAddress.
 * Accepts only valid Ed25519 public keys (G...) and Soroban contracts (C...).
 * Rejects muxed (M...) addresses, lowercase addresses, and invalid checksums.
 */
export function toViewedAddress(s: string | null | undefined): ViewedAddress | null {
  const result = validateWatchAddress(s);
  return result.ok ? result.address : null;
}

/**
 * Constructs a branded SignerAddress from an authenticated Signer.
 * Only call this inside useWriteGuard / assertCanWrite.
 */
export function asSignerAddress(signer: Signer): SignerAddress {
  if (!signer || !signer.publicKey) {
    throw new Error("Cannot create SignerAddress from null or invalid signer");
  }
  return signer.publicKey as SignerAddress;
}
