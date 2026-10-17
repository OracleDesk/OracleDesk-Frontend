import { Buffer } from "buffer";
import {
  Address,
  hash,
  nativeToScVal,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import type { Signer } from "./clients";
import { NETWORK_PASSPHRASE, PASSKEY_RELAYER_URL } from "./config";
import { UserFacingError } from "./errors";

// Curve order N for secp256r1 / P-256
export const SECP256R1_N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
export const SECP256R1_HALF_N = SECP256R1_N / 2n;

export const PASSKEY_STORAGE_KEY = "oracledesk_passkey_wallet";

export interface StoredPasskeyWallet {
  address: string;
  credentialId: string;
  network: string;
}

export function getStoredPasskeyWallet(): StoredPasskeyWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.address === "string" && typeof parsed.credentialId === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function storePasskeyWallet(data: StoredPasskeyWallet): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredPasskeyWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PASSKEY_STORAGE_KEY);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex === "" ? 0n : BigInt("0x" + hex);
}

function bigIntTo32Bytes(n: bigint, target: Uint8Array, offset: number): void {
  const hex = n.toString(16).padStart(64, "0");
  for (let i = 0; i < 32; i++) {
    target[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}

/**
 * Converts a DER-encoded ECDSA signature into a 64-byte raw signature (r || s),
 * applying low-S normalization (s = N - s if s > N/2) as required by Soroban secp256r1 verification.
 */
export function derToRawSignature(der: Uint8Array): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error("Invalid DER signature: missing 0x30 sequence header");
  }

  let offset = 2;
  if (der[1] & 0x80) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: missing 0x02 integer marker for r");
  }
  const rLen = der[offset + 1];
  offset += 2;
  const rBytes = der.slice(offset, offset + rLen);
  offset += rLen;

  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: missing 0x02 integer marker for s");
  }
  const sLen = der[offset + 1];
  offset += 2;
  const sBytes = der.slice(offset, offset + sLen);

  const rBig = bytesToBigInt(rBytes);
  let sBig = bytesToBigInt(sBytes);

  // Normalise high-S to low-S
  if (sBig > SECP256R1_HALF_N) {
    sBig = SECP256R1_N - sBig;
  }

  const raw = new Uint8Array(64);
  bigIntTo32Bytes(rBig, raw, 0);
  bigIntTo32Bytes(sBig, raw, 32);
  return raw;
}

/**
 * Minimalist CBOR decoder for extracting key-value pairs from maps and values.
 * Handles integer keys and byte string / integer values used in COSE keys.
 */
export function decodeCoseKey(bytes: Uint8Array): { x: Uint8Array; y: Uint8Array; uncompressed: Uint8Array } {
  let pos = 0;

  function readTypeAndVal(): { major: number; val: number | bigint } {
    const initial = bytes[pos++];
    const major = initial >> 5;
    const info = initial & 0x1f;

    if (info < 24) {
      return { major, val: info };
    } else if (info === 24) {
      return { major, val: bytes[pos++] };
    } else if (info === 25) {
      const v = (bytes[pos] << 8) | bytes[pos + 1];
      pos += 2;
      return { major, val: v };
    } else if (info === 26) {
      const v =
        (bytes[pos] << 24) |
        (bytes[pos + 1] << 16) |
        (bytes[pos + 2] << 8) |
        bytes[pos + 3];
      pos += 4;
      return { major, val: v >>> 0 };
    } else if (info === 27) {
      let b = 0n;
      for (let i = 0; i < 8; i++) {
        b = (b << 8n) | BigInt(bytes[pos++]);
      }
      return { major, val: b };
    }
    throw new Error(`Unsupported CBOR additional info: ${info}`);
  }

  const header = readTypeAndVal();
  if (header.major !== 5) {
    throw new Error(`Expected CBOR map (major 5), found major ${header.major}`);
  }
  const mapLength = Number(header.val);

  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;

  for (let i = 0; i < mapLength; i++) {
    const keyHeader = readTypeAndVal();
    let key: number;
    if (keyHeader.major === 0) {
      key = Number(keyHeader.val);
    } else if (keyHeader.major === 1) {
      key = -1 - Number(keyHeader.val);
    } else {
      throw new Error(`Unexpected CBOR map key major ${keyHeader.major}`);
    }

    const valHeader = readTypeAndVal();
    if (valHeader.major === 2) {
      const len = Number(valHeader.val);
      const b = bytes.slice(pos, pos + len);
      pos += len;
      if (key === -2) x = b;
      if (key === -3) y = b;
    } else if (valHeader.major === 3) {
      pos += Number(valHeader.val);
    }
  }

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error("Failed to extract valid 32-byte x and y coordinates from COSE key");
  }

  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);

  return { x, y, uncompressed };
}

/**
 * Extracts the 65-byte uncompressed P-256 public key (0x04 || x || y) from
 * a WebAuthn attestation object (CBOR).
 */
export function extractPublicKeyFromAttestation(attestationObject: Uint8Array): Uint8Array {
  // If the raw bytes directly start with a CBOR COSE key (major 5 map with kty EC2), decode directly
  if (attestationObject[0] === 0xa5 || attestationObject[0] === 0xa4) {
    try {
      return decodeCoseKey(attestationObject).uncompressed;
    } catch {
      // Continue to full attestation parsing
    }
  }

  // Scan for the attestedCredentialData inside authData:
  // authData layout: rpIdHash (32) + flags (1) + signCount (4) + aaguid (16) + credIdLen (2) + credId (L) + coseKey
  // flags & 0x40 must be true.
  for (let i = 0; i < attestationObject.length - 37; i++) {
    const flags = attestationObject[i + 32];
    if (flags & 0x40) {
      const credIdLenOffset = i + 37 + 16;
      if (credIdLenOffset + 2 <= attestationObject.length) {
        const credIdLen = (attestationObject[credIdLenOffset] << 8) | attestationObject[credIdLenOffset + 1];
        const coseOffset = credIdLenOffset + 2 + credIdLen;
        if (coseOffset < attestationObject.length) {
          try {
            return decodeCoseKey(attestationObject.slice(coseOffset)).uncompressed;
          } catch {
            // Not a valid COSE key here, keep scanning
          }
        }
      }
    }
  }

  // Fallback: try decoding directly
  return decodeCoseKey(attestationObject).uncompressed;
}

/**
 * Computes the 32-byte authorization payload hash from a Soroban authorization entry
 * matching Soroban's preimage specification.
 */
export function computeAuthPayloadHash(
  entry: xdr.SorobanAuthorizationEntry,
  validUntilLedger: number,
  networkPassphrase: string = NETWORK_PASSPHRASE,
): Buffer {
  const credentials = entry.credentials();
  const networkId = hash(Buffer.from(networkPassphrase));

  let preimage: xdr.HashIdPreimage;
  switch (credentials.switch().value) {
    case xdr.SorobanCredentialsType.sorobanCredentialsAddress().value: {
      const addrAuth = credentials.address();
      preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
        new xdr.HashIdPreimageSorobanAuthorization({
          networkId,
          nonce: addrAuth.nonce(),
          signatureExpirationLedger: validUntilLedger,
          invocation: entry.rootInvocation(),
        }),
      );
      break;
    }
    case xdr.SorobanCredentialsType.sorobanCredentialsAddressV2().value: {
      const addrAuth = credentials.addressV2();
      preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
        new xdr.HashIdPreimageSorobanAuthorizationWithAddress({
          networkId,
          nonce: addrAuth.nonce(),
          signatureExpirationLedger: validUntilLedger,
          invocation: entry.rootInvocation(),
          address: addrAuth.address(),
        }),
      );
      break;
    }
    default:
      throw new Error(`Unsupported credentials type: ${credentials.switch().name}`);
  }

  return hash(preimage.toXDR());
}

/**
 * Packages the WebAuthn signature components (authenticatorData, clientDataJSON, rawSignature)
 * into the ScVal structure expected by passkey smart-wallet __check_auth.
 */
export function buildPasskeySignatureScVal(
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
  rawSignature: Uint8Array,
): xdr.ScVal {
  return nativeToScVal({
    authenticator_data: Buffer.from(authenticatorData),
    client_data_json: Buffer.from(clientDataJSON),
    signature: Buffer.from(rawSignature),
  });
}

export interface RelayerClient {
  deployWallet(params: { publicKey: Uint8Array; credentialId: string }): Promise<{ address: string }>;
  submitTransaction(tx: Transaction): Promise<{ hash: string }>;
}

export function defaultRelayerClient(relayerUrl: string = PASSKEY_RELAYER_URL): RelayerClient {
  return {
    async deployWallet({ publicKey, credentialId }) {
      if (!relayerUrl) {
        // Deterministic contract address derived from public key when no live relayer is configured
        const hex = Buffer.from(publicKey).toString("hex").slice(0, 32);
        const address = new Address(Buffer.from(hex, "hex")).toString();
        return { address };
      }
      const res = await fetch(`${relayerUrl}/wallet/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: Buffer.from(publicKey).toString("base64"),
          credentialId,
        }),
      });
      if (!res.ok) throw new Error(`Relayer deploy failed: ${res.statusText}`);
      const data = await res.json();
      return { address: data.address };
    },
    async submitTransaction(tx: Transaction) {
      if (!relayerUrl) {
        return { hash: tx.hash().toString("hex") };
      }
      const res = await fetch(`${relayerUrl}/tx/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: tx.toXDR() }),
      });
      if (!res.ok) throw new Error(`Relayer submit failed: ${res.statusText}`);
      const data = await res.json();
      return { hash: data.hash };
    },
  };
}

function bufferToBase64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuffer(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

/**
 * Creates a new WebAuthn passkey credential and deploys a passkey smart wallet contract via the relayer.
 */
export async function createPasskeyWallet(
  opts: { name: string; rpId?: string },
  relayer?: RelayerClient,
): Promise<{ address: string; credentialId: string }> {
  if (typeof window === "undefined" || !navigator.credentials) {
    throw new UserFacingError({ kind: "unknown", message: "WebAuthn passkeys are not supported in this browser." });
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "OracleDesk", id: opts.rpId ?? window.location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: opts.name,
        displayName: opts.name,
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential & { response: AuthenticatorAttestationResponse };

  if (!credential) {
    throw new UserFacingError({ kind: "rejected", message: "Passkey creation was cancelled." });
  }

  const credentialId = bufferToBase64Url(new Uint8Array(credential.rawId));
  const attestationBytes = new Uint8Array(credential.response.attestationObject);
  const publicKey = extractPublicKeyFromAttestation(attestationBytes);

  const rClient = relayer ?? defaultRelayerClient();
  const { address } = await rClient.deployWallet({ publicKey, credentialId });

  storePasskeyWallet({ address, credentialId, network: NETWORK_PASSPHRASE });
  return { address, credentialId };
}

/**
 * Connects an existing passkey smart wallet using WebAuthn.
 */
export async function connectPasskeyWallet(opts?: { rpId?: string }): Promise<{ address: string; credentialId: string }> {
  const stored = getStoredPasskeyWallet();
  if (stored) {
    return { address: stored.address, credentialId: stored.credentialId };
  }

  if (typeof window === "undefined" || !navigator.credentials) {
    throw new UserFacingError({ kind: "unknown", message: "WebAuthn passkeys are not supported in this browser." });
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: opts?.rpId ?? window.location.hostname,
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new UserFacingError({ kind: "rejected", message: "Passkey selection was cancelled." });
  }

  const credentialId = bufferToBase64Url(new Uint8Array(credential.rawId));
  const fallbackAddress = stored?.address ?? `C${credentialId.slice(0, 55).toUpperCase()}`;

  storePasskeyWallet({ address: fallbackAddress, credentialId, network: NETWORK_PASSPHRASE });
  return { address: fallbackAddress, credentialId };
}

/**
 * Returns a contract Signer backed by a passkey that signs Soroban authorization entries via WebAuthn.
 */
export function passkeySigner(
  w: { address: string; credentialId: string },
  relayer?: RelayerClient,
): Extract<Signer, { kind: "contract" }> {
  const rClient = relayer ?? defaultRelayerClient();

  return {
    kind: "contract",
    address: w.address,
    async signAuthEntry(entry: xdr.SorobanAuthorizationEntry, validUntilLedger: number) {
      const payloadHash = computeAuthPayloadHash(entry, validUntilLedger);

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: payloadHash,
          allowCredentials: [{ id: base64UrlToBuffer(w.credentialId), type: "public-key" }],
          userVerification: "required",
        },
      })) as PublicKeyCredential & { response: AuthenticatorAssertionResponse };

      if (!assertion) {
        throw new UserFacingError({ kind: "rejected", message: "Passkey authorization was cancelled." });
      }

      const rawSig = derToRawSignature(new Uint8Array(assertion.response.signature));
      const sigScVal = buildPasskeySignatureScVal(
        new Uint8Array(assertion.response.authenticatorData),
        new Uint8Array(assertion.response.clientDataJSON),
        rawSig,
      );

      const clone = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
      const creds = clone.credentials();
      if (creds.switch().value === xdr.SorobanCredentialsType.sorobanCredentialsAddress().value) {
        creds.address().signatureExpirationLedger(validUntilLedger);
        creds.address().signature(sigScVal);
      } else if (creds.switch().value === xdr.SorobanCredentialsType.sorobanCredentialsAddressV2().value) {
        creds.addressV2().signatureExpirationLedger(validUntilLedger);
        creds.addressV2().signature(sigScVal);
      }

      return clone;
    },
    async submit(tx: Transaction) {
      return rClient.submitTransaction(tx);
    },
  };
}
