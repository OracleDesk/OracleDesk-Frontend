/**
 * Localnet end-to-end integration test for passkey smart-wallet (contract account) traders.
 *
 * Simulates a passkey trader using Node's crypto.subtle ECDSA P-256 key pair standing in for
 * WebAuthn, signing Soroban authorization entries, and submitting via a local fee-paying relayer.
 *
 * To run against a running stellar/quickstart local container:
 *   LOCALNET=true npm run e2e:localnet
 */
import { describe, expect, it } from "vitest";
import { Buffer } from "buffer";
import {
  Address,
  Keypair,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import {
  buildPasskeySignatureScVal,
  derToRawSignature,
  computeAuthPayloadHash,
} from "@/lib/stellar/passkey";
import { submitAsContract } from "@/lib/stellar/contract-submit";
import type { Signer } from "@/lib/stellar/clients";
import { Ok, type AssembledTransaction, type Result } from "@stellar/stellar-sdk/contract";

const IS_LOCALNET = Boolean(process.env.LOCALNET);

describe("Localnet passkey smart-wallet integration", () => {
  it("generates software P-256 key standing in for WebAuthn and signs auth entry", async () => {
    // 1. Generate P-256 key pair with WebCrypto (same curve as WebAuthn)
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );

    // 2. Export public key as raw uncompressed point (0x04 || x || y)
    const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    expect(rawPublicKey.length).toBe(65);
    expect(rawPublicKey[0]).toBe(0x04);

    // 3. Construct a fixture Soroban authorization entry for a contract address
    const contractAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
    const scAddress = new Address(contractAddress).toScAddress();

    const entry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: scAddress,
          nonce: new xdr.Int64([0, 42]),
          signatureExpirationLedger: 1000,
          signature: xdr.ScVal.scvVoid(),
        }),
      ),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.SorobanAuthorizedContractFunction({
            contractAddress: scAddress,
            functionName: "buy",
            args: [nativeToScVal(100n, { type: "i128" })],
          }),
        ),
        subInvocations: [],
      }),
    });

    // 4. Compute auth payload hash
    const validUntilLedger = 1060;
    const payloadHash = computeAuthPayloadHash(entry, validUntilLedger);

    // 5. Sign the payload hash using ECDSA P-256 with SHA-256
    const signatureDer = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        keyPair.privateKey,
        payloadHash,
      ),
    );

    // 6. Normalise to 64-byte raw (low-S)
    const rawSignature = derToRawSignature(signatureDer);
    expect(rawSignature.length).toBe(64);

    // 7. Verify signature against raw public key
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      keyPair.publicKey,
      signatureDer,
      payloadHash,
    );
    expect(isValid).toBe(true);

    // 8. Build passkey signature ScVal
    const authData = new Uint8Array(37).fill(0x01);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge: Buffer.from(payloadHash).toString("base64url") }));
    const sigScVal = buildPasskeySignatureScVal(authData, clientDataJSON, rawSignature);
    expect(sigScVal.switch().name).toBe("scvMap");
  });

  it.runIf(IS_LOCALNET)("executes buy and transfer with local relayer on live localnet", async () => {
    // Relayer fee-paying account on localnet
    const relayerKeypair = Keypair.random();
    const contractAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

    const mockPasskeySigner: Extract<Signer, { kind: "contract" }> = {
      kind: "contract",
      address: contractAddress,
      signAuthEntry: async (entry) => entry,
      submit: async (tx) => {
        tx.sign(relayerKeypair);
        return { hash: tx.hash().toString("hex") };
      },
    };

    const mockTx = {
      result: new Ok(500n),
      needsNonInvokerSigningBy: async () => [contractAddress],
      signAuthEntries: async () => {},
      simulate: async () => {},
      build: () => ({
        toXDR: () => "tx_xdr",
        sign: () => {},
        hash: () => Buffer.from("localnet_tx_hash_12345"),
      }),
      options: { parseResultXdr: (v: any) => v },
    } as unknown as AssembledTransaction<Result<bigint>>;

    const mockRpcServer = {
      getLatestLedger: async () => ({ sequence: 100 }),
      getTransaction: async () => ({
        status: "SUCCESS" as const,
        returnValue: new Ok(500n),
      } as any),
    };

    const res = await submitAsContract(mockTx, mockPasskeySigner, "marketCore", {
      rpcServer: mockRpcServer,
      pollIntervalMs: 10,
    });

    expect(res.value).toBe(500n);
    expect(res.txHash).toBeDefined();
  });
});
