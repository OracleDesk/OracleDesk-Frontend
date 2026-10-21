import { describe, it, expect } from "vitest";
import { assertCanWrite, type WriteGuardContext } from "../../stellar/write-guard";
import { UserFacingError } from "../../stellar/errors";
import type { Signer } from "../../stellar/clients";

describe("assertCanWrite", () => {
  const SIGNER_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  const WATCHED_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  const validSigner: Signer = {
    publicKey: SIGNER_ADDRESS,
    signTransaction: async (tx: string) => ({ signedTxXdr: tx }),
  };

  const baseContext: WriteGuardContext = {
    signer: validSigner,
    isWrongNetwork: false,
    isWatching: false,
    watchedAddress: null,
    accountFunded: true,
    updatePending: false,
  };

  it("returns branded SignerAddress when all conditions pass", () => {
    const signerAddr = assertCanWrite(baseContext);
    expect(signerAddr).toBe(SIGNER_ADDRESS);
  });

  it("throws when watching another address", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        isWatching: true,
        watchedAddress: WATCHED_ADDRESS,
      }),
    ).toThrowError(UserFacingError);

    try {
      assertCanWrite({
        ...baseContext,
        isWatching: true,
        watchedAddress: WATCHED_ADDRESS,
      });
    } catch (e: unknown) {
      const err = e as UserFacingError;
      expect(err.described.kind).toBe("disconnected");
      expect(err.message).toBe("You're viewing another address. Connect your own wallet to trade.");
    }
  });

  it("allows when watching own address", () => {
    const signerAddr = assertCanWrite({
      ...baseContext,
      isWatching: true,
      watchedAddress: SIGNER_ADDRESS,
    });
    expect(signerAddr).toBe(SIGNER_ADDRESS);
  });

  it("throws when disconnected", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        signer: null,
      }),
    ).toThrowError(UserFacingError);

    try {
      assertCanWrite({
        ...baseContext,
        signer: null,
      });
    } catch (e: unknown) {
      const err = e as UserFacingError;
      expect(err.described.kind).toBe("disconnected");
      expect(err.message).toBe("Connect your wallet first.");
    }
  });

  it("throws when on wrong network", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        isWrongNetwork: true,
      }),
    ).toThrowError(UserFacingError);

    try {
      assertCanWrite({
        ...baseContext,
        isWrongNetwork: true,
      });
    } catch (e: unknown) {
      const err = e as UserFacingError;
      expect(err.described.kind).toBe("wrong-network");
      expect(err.message).toContain("Switch your wallet to Stellar Testnet");
    }
  });

  it("throws when app update is pending", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        updatePending: true,
      }),
    ).toThrowError(UserFacingError);
  });

  it("throws when account is not funded", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        accountFunded: false,
      }),
    ).toThrowError(UserFacingError);
  });

  it("throws when target contract fails integrity", () => {
    expect(() =>
      assertCanWrite({
        ...baseContext,
        target: "marketCore",
        integrity: {
          marketCore: {
            contract: "marketCore",
            id: "C123",
            status: "mismatch",
            detail: "WASM mismatch",
            checkedAtLedger: 100,
          },
        },
      }),
    ).toThrowError(UserFacingError);
  });
});
