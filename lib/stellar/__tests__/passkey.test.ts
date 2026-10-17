import { describe, expect, it } from "vitest";
import { Buffer } from "buffer";
import {
  Address,
  hash,
  xdr,
} from "@stellar/stellar-sdk";
import {
  SECP256R1_N,
  SECP256R1_HALF_N,
  derToRawSignature,
  decodeCoseKey,
  extractPublicKeyFromAttestation,
  computeAuthPayloadHash,
  buildPasskeySignatureScVal,
} from "../passkey";
import { describeError } from "../errors";
import { TESTNET_PASSPHRASE } from "../config";

describe("passkey: DER to raw signature with low-S normalization", () => {
  function makeDer(rBytes: Uint8Array, sBytes: Uint8Array): Uint8Array {
    const totalLen = 2 + rBytes.length + 2 + sBytes.length;
    const der = new Uint8Array(2 + totalLen);
    der[0] = 0x30;
    der[1] = totalLen;
    der[2] = 0x02;
    der[3] = rBytes.length;
    der.set(rBytes, 4);
    const sOffset = 4 + rBytes.length;
    der[sOffset] = 0x02;
    der[sOffset + 1] = sBytes.length;
    der.set(sBytes, sOffset + 2);
    return der;
  }

  it("converts a standard low-S DER signature to 64 bytes raw", () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    // Ensure s is low-S (0x2222... is well below N/2)
    const der = makeDer(r, s);

    const raw = derToRawSignature(der);
    expect(raw.length).toBe(64);
    expect(raw.slice(0, 32)).toEqual(r);
    expect(raw.slice(32, 64)).toEqual(s);
  });

  it("handles ASN.1 leading zeroes (33-byte signed positive integers)", () => {
    // ASN.1 puts a 0x00 prefix if highest bit is set
    const r = new Uint8Array(33);
    r[0] = 0x00;
    r.fill(0x88, 1);

    const s = new Uint8Array(32).fill(0x05);
    const der = makeDer(r, s);

    const raw = derToRawSignature(der);
    expect(raw.length).toBe(64);
    expect(raw.slice(0, 32)).toEqual(r.slice(1));
    expect(raw.slice(32, 64)).toEqual(s);
  });

  it("normalizes a high-S signature to canonical low-S (s' = N - s)", () => {
    const r = new Uint8Array(32).fill(0x01);

    // Construct an s > N/2
    const highSVal = SECP256R1_HALF_N + 1000n;
    const expectedLowSVal = SECP256R1_N - highSVal;

    const sHex = highSVal.toString(16).padStart(64, "0");
    const sBytes = Buffer.from(sHex, "hex");
    const der = makeDer(r, sBytes);

    const raw = derToRawSignature(der);
    expect(raw.length).toBe(64);

    const resultSBig = BigInt("0x" + Buffer.from(raw.slice(32, 64)).toString("hex"));
    expect(resultSBig).toBe(expectedLowSVal);
    expect(resultSBig).toBeLessThanOrEqual(SECP256R1_HALF_N);
  });
});

describe("passkey: COSE public key extraction", () => {
  it("decodes a valid CBOR COSE key into an uncompressed P-256 public key", () => {
    const xCoord = new Uint8Array(32).fill(0xaa);
    const yCoord = new Uint8Array(32).fill(0xbb);

    // Build minimalist CBOR map: { 1: 2, 3: -7, -1: 1, -2: h'aa..', -3: h'bb..' }
    // 0xa5 = map of 5 items
    // 0x01, 0x02 (1: 2)
    // 0x03, 0x26 (3: -7)
    // 0x20, 0x01 (-1: 1)
    // 0x21, 0x58, 0x20, ... (-2: 32 bytes)
    // 0x22, 0x58, 0x20, ... (-3: 32 bytes)
    const cborParts: number[] = [
      0xa5,
      0x01, 0x02,
      0x03, 0x26,
      0x20, 0x01,
      0x21, 0x58, 0x20, ...Array.from(xCoord),
      0x22, 0x58, 0x20, ...Array.from(yCoord),
    ];
    const coseKeyBytes = new Uint8Array(cborParts);

    const decoded = decodeCoseKey(coseKeyBytes);
    expect(decoded.uncompressed.length).toBe(65);
    expect(decoded.uncompressed[0]).toBe(0x04);
    expect(decoded.uncompressed.slice(1, 33)).toEqual(xCoord);
    expect(decoded.uncompressed.slice(33, 65)).toEqual(yCoord);

    const fromAttestation = extractPublicKeyFromAttestation(coseKeyBytes);
    expect(fromAttestation).toEqual(decoded.uncompressed);
  });
});

describe("passkey: authorization payload hash", () => {
  it("matches SDK authorizeEntry preimage for an address credentials entry", () => {
    const dummyContract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
    const credAddress = new Address(dummyContract).toScAddress();
    const nonce = new xdr.Int64([0, 12345]);

    const credentials = new xdr.SorobanAddressCredentials({
      address: credAddress,
      nonce,
      signatureExpirationLedger: 500,
      signature: xdr.ScVal.scvVoid(),
    });

    const rootInvocation = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.SorobanAuthorizedContractFunction({
          contractAddress: credAddress,
          functionName: "test_fn",
          args: [],
        }),
      ),
      subInvocations: [],
    });

    const entry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(credentials),
      rootInvocation,
    });

    const validUntilLedger = 600;
    const computedHash = computeAuthPayloadHash(entry, validUntilLedger, TESTNET_PASSPHRASE);

    // Verify against manual HashIdPreimage calculation
    const networkId = hash(Buffer.from(TESTNET_PASSPHRASE));
    const expectedPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId,
        nonce,
        signatureExpirationLedger: validUntilLedger,
        invocation: rootInvocation,
      }),
    );
    const expectedHash = hash(expectedPreimage.toXDR());

    expect(computedHash).toEqual(expectedHash);
  });
});

describe("passkey: signature ScVal packaging", () => {
  it("packages authenticatorData, clientDataJSON, and rawSignature into an ScVal map", () => {
    const authData = new Uint8Array([1, 2, 3]);
    const clientData = new Uint8Array([4, 5, 6]);
    const rawSig = new Uint8Array(64).fill(7);

    const scVal = buildPasskeySignatureScVal(authData, clientData, rawSig);
    expect(scVal.switch().name).toBe("scvMap");
  });
});

describe("errors: contract trader and passkey error descriptions", () => {
  const contractTrader = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const accountTrader = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

  it("maps missing trustline to wallet-friendly message for contract traders", () => {
    const contractErr = describeError("trustline entry is missing", "marketCore", contractTrader);
    expect(contractErr.message).toBe("This wallet doesn't hold USDC yet.");
    expect(contractErr.kind).toBe("insufficient-balance");

    const accountErr = describeError("trustline entry is missing", "marketCore", accountTrader);
    expect(accountErr.message).toBe("Your wallet has no USDC trustline. Add the USDC asset in your wallet first.");
    expect(accountErr.kind).toBe("no-trustline");
  });

  it("maps WebAuthn NotAllowedError to rejected", () => {
    const err = describeError(new Error("NotAllowedError: The operation was cancelled"), "marketCore", contractTrader);
    expect(err.kind).toBe("rejected");
    expect(err.message).toBe("You cancelled the request in your wallet.");
  });

  it("maps __check_auth signature failure and expiration", () => {
    const sigErr = describeError("HostError: check_auth failed signature invalid", "marketCore", contractTrader);
    expect(sigErr.kind).toBe("contract");
    expect(sigErr.message).toBe("The passkey signature was rejected or is invalid.");

    const expErr = describeError("HostError: signature expired", "marketCore", contractTrader);
    expect(expErr.kind).toBe("contract");
    expect(expErr.message).toBe("The passkey authorization has expired. Please try again.");
  });
});
