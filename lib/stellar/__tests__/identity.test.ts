import { describe, it, expect } from "vitest";
import { toViewedAddress, validateWatchAddress, asSignerAddress } from "../identity";
import type { Signer } from "../clients";

describe("identity - ViewedAddress & SignerAddress", () => {
  const VALID_G_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  const VALID_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  it("accepts valid G... account addresses", () => {
    const res = validateWatchAddress(VALID_G_ADDRESS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.address).toBe(VALID_G_ADDRESS);
    }
    expect(toViewedAddress(VALID_G_ADDRESS)).toBe(VALID_G_ADDRESS);
  });

  it("accepts valid C... contract addresses", () => {
    const res = validateWatchAddress(VALID_CONTRACT_ID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.address).toBe(VALID_CONTRACT_ID);
      expect(res.warning).toBeDefined();
    }
    expect(toViewedAddress(VALID_CONTRACT_ID)).toBe(VALID_CONTRACT_ID);
  });

  it("rejects lowercase addresses with a descriptive error", () => {
    const lower = VALID_G_ADDRESS.toLowerCase();
    const res = validateWatchAddress(lower);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Address must be uppercase");
    }
    expect(toViewedAddress(lower)).toBeNull();
  });

  it("rejects muxed (M...) addresses with a descriptive error", () => {
    // Muxed address starts with M
    const muxed = "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK";
    const res = validateWatchAddress(muxed);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Muxed addresses (M...) are not supported");
    }
    expect(toViewedAddress(muxed)).toBeNull();
  });

  it("rejects invalid checksums", () => {
    // Replace the last char with another char to break checksum
    const corrupted = VALID_G_ADDRESS.slice(0, -1) + (VALID_G_ADDRESS.endsWith("A") ? "B" : "A");
    const res = validateWatchAddress(corrupted);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/Invalid checksum|Invalid Stellar address/);
    }
    expect(toViewedAddress(corrupted)).toBeNull();
  });

  it("rejects null, undefined, and empty string", () => {
    expect(validateWatchAddress(null).ok).toBe(false);
    expect(validateWatchAddress(undefined).ok).toBe(false);
    expect(validateWatchAddress("").ok).toBe(false);
    expect(toViewedAddress(null)).toBeNull();
    expect(toViewedAddress(undefined)).toBeNull();
    expect(toViewedAddress("")).toBeNull();
  });

  it("creates SignerAddress strictly from authenticated Signer", () => {
    const signer: Signer = {
      publicKey: VALID_G_ADDRESS,
      signTransaction: async (tx: string) => ({ signedTxXdr: tx }),
    };
    const signerAddr = asSignerAddress(signer);
    expect(signerAddr).toBe(VALID_G_ADDRESS);

    // Throws on missing or empty signer
    expect(() => asSignerAddress(null as unknown as Signer)).toThrow();
    expect(() => asSignerAddress({} as unknown as Signer)).toThrow();
  });
});
