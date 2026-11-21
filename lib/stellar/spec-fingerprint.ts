import type { xdr } from "@stellar/stellar-sdk";
import {
  FINGERPRINT_ALGO,
  stripDoc as coreStripDoc,
  canonicalEntries as coreCanonicalEntries,
  specFingerprintV1 as coreSpecFingerprintV1,
} from "./spec-fingerprint-core.mjs";

export { FINGERPRINT_ALGO };

export type EntryKind = "function" | "struct" | "union" | "enum" | "error" | "event";

export interface EntryFingerprint {
  kind: EntryKind;
  name: string;
  sha256: string;
}

export interface SpecFingerprintV1Result {
  algo: typeof FINGERPRINT_ALGO;
  root: string;
  entries: EntryFingerprint[];
}

export function stripDoc(entry: xdr.ScSpecEntry): xdr.ScSpecEntry {
  return coreStripDoc(entry);
}

export async function canonicalEntries(entries: xdr.ScSpecEntry[]): Promise<EntryFingerprint[]> {
  return coreCanonicalEntries(entries) as Promise<EntryFingerprint[]>;
}

export async function specFingerprintV1(entries: xdr.ScSpecEntry[]): Promise<SpecFingerprintV1Result> {
  return coreSpecFingerprintV1(entries) as Promise<SpecFingerprintV1Result>;
}
