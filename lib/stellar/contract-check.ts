import { Address, Asset, rpc, xdr } from "@stellar/stellar-sdk";
import { Spec } from "@stellar/stellar-sdk/contract";
import {
  marketCore,
  treasury,
  resolver,
  reasoningRegistry,
  token,
  rpcServer,
} from "./clients";
import {
  CONTRACTS,
  NETWORK_PASSPHRASE,
  USDC_ASSET,
} from "./config";
import { useQuery } from "@tanstack/react-query";

export type ContractKey = "marketCore" | "treasury" | "resolver" | "reasoningRegistry";

export interface IntegrityResult {
  contract: ContractKey | "usdc";
  id: string;
  status: "match" | "mismatch" | "not-found" | "wrong-kind" | "unchecked";
  wasmHash?: string;
  onChainFingerprint?: string;
  bundledFingerprint?: string;
  detail?: string;
  checkedAtLedger: number;
}

export const WASM_MAX_CODE_SIZE = 256 * 1024; // 256 KiB cap

/**
 * In-memory fallback cache for wasmHash -> fingerprint when sessionStorage is unavailable (e.g. Node/SSR).
 */
const MEMORY_FINGERPRINT_CACHE = new Map<string, string>();

function getCachedFingerprint(wasmHashHex: string): string | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      return window.sessionStorage.getItem(`oracledesk_wasm_fp_${wasmHashHex}`);
    } catch {
      // Ignore security errors in restricted iframe/browser contexts
    }
  }
  return MEMORY_FINGERPRINT_CACHE.get(wasmHashHex) ?? null;
}

function setCachedFingerprint(wasmHashHex: string, fingerprint: string): void {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(`oracledesk_wasm_fp_${wasmHashHex}`, fingerprint);
    } catch {
      // Ignore quota/security errors
    }
  }
  MEMORY_FINGERPRINT_CACHE.set(wasmHashHex, fingerprint);
}

/**
 * Returns the bundled ScSpecEntry array for the specified Wasm contract.
 */
export function bundledSpec(key: ContractKey): xdr.ScSpecEntry[] {
  switch (key) {
    case "marketCore":
      return marketCore().spec.entries;
    case "treasury":
      return treasury().spec.entries;
    case "resolver":
      return resolver().spec.entries;
    case "reasoningRegistry":
      return reasoningRegistry().spec.entries;
  }
}

function getArm(obj: unknown): string {
  if (!obj) return "";
  const o = obj as { arm?: () => string; switch?: () => { name?: string } };
  if (typeof o.arm === "function") return o.arm();
  if (typeof o.switch === "function") return o.switch()?.name ?? "";
  return "";
}

/**
 * Strips all documentation fields (`doc`) from a spec entry so that documentation changes
 * do not alter the cryptographic fingerprint.
 */
export function stripDoc(entry: xdr.ScSpecEntry): xdr.ScSpecEntry {
  const arm = getArm(entry);
  const val = entry.value();

  switch (arm) {
    case "functionV0": {
      const fn = val as xdr.ScSpecFunctionV0;
      return xdr.ScSpecEntry.scSpecEntryFunctionV0(
        new xdr.ScSpecFunctionV0({
          doc: "",
          name: fn.name(),
          inputs: fn.inputs().map(
            (i) =>
              new xdr.ScSpecFunctionInputV0({
                doc: "",
                name: i.name(),
                type: i.type(),
              }),
          ),
          outputs: fn.outputs(),
        }),
      );
    }
    case "udtStructV0": {
      const st = val as xdr.ScSpecUdtStructV0;
      return xdr.ScSpecEntry.scSpecEntryUdtStructV0(
        new xdr.ScSpecUdtStructV0({
          doc: "",
          lib: st.lib(),
          name: st.name(),
          fields: st.fields().map(
            (f) =>
              new xdr.ScSpecUdtStructFieldV0({
                doc: "",
                name: f.name(),
                type: f.type(),
              }),
          ),
        }),
      );
    }
    case "udtUnionV0": {
      const un = val as xdr.ScSpecUdtUnionV0;
      return xdr.ScSpecEntry.scSpecEntryUdtUnionV0(
        new xdr.ScSpecUdtUnionV0({
          doc: "",
          lib: un.lib(),
          name: un.name(),
          cases: un.cases().map((c) => {
            const cArm = getArm(c);
            const cVal = c.value();
            if (cArm === "voidV0") {
              const v = cVal as xdr.ScSpecUdtUnionCaseVoidV0;
              return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
                new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: v.name() }),
              );
            }
            if (cArm === "tupleV0") {
              const t = cVal as xdr.ScSpecUdtUnionCaseTupleV0;
              return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseTupleV0(
                new xdr.ScSpecUdtUnionCaseTupleV0({ doc: "", name: t.name(), type: t.type() }),
              );
            }
            return c;
          }),
        }),
      );
    }
    case "udtEnumV0": {
      const en = val as xdr.ScSpecUdtEnumV0;
      return xdr.ScSpecEntry.scSpecEntryUdtEnumV0(
        new xdr.ScSpecUdtEnumV0({
          doc: "",
          lib: en.lib(),
          name: en.name(),
          cases: en.cases().map(
            (cs) =>
              new xdr.ScSpecUdtEnumCaseV0({
                doc: "",
                name: cs.name(),
                value: cs.value(),
              }),
          ),
        }),
      );
    }
    case "udtErrorEnumV0": {
      const err = val as xdr.ScSpecUdtErrorEnumV0;
      return xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
        new xdr.ScSpecUdtErrorEnumV0({
          doc: "",
          lib: err.lib(),
          name: err.name(),
          cases: err.cases().map(
            (cs) =>
              new xdr.ScSpecUdtErrorEnumCaseV0({
                doc: "",
                name: cs.name(),
                value: cs.value(),
              }),
          ),
        }),
      );
    }
    case "eventV0": {
      const ev = val as xdr.ScSpecEventV0;
      return xdr.ScSpecEntry.scSpecEntryEventV0(
        new xdr.ScSpecEventV0({
          doc: "",
          lib: ev.lib(),
          name: ev.name(),
          prefixTopics: ev.prefixTopics(),
          params: ev.params().map(
            (p) =>
              new xdr.ScSpecEventParamV0({
                doc: "",
                name: p.name(),
                type: p.type(),
                location: p.location(),
              }),
          ),
          dataFormat: ev.dataFormat(),
        }),
      );
    }
    default:
      return entry;
  }
}

/**
 * Extracts entry name safely for sorting and diffing.
 */
export function getSpecEntryName(entry: xdr.ScSpecEntry): string {
  try {
    const val = entry.value() as { name?: () => { toString(): string } | string };
    if (val && typeof val.name === "function") {
      const n = val.name();
      return typeof n === "string" ? n : n.toString();
    }
  } catch {
    // Fallback if structure varies
  }
  return "";
}

/**
 * Computes a deterministic SHA-256 fingerprint over sorted canonical XDR entries.
 */
export async function specFingerprint(entries: xdr.ScSpecEntry[]): Promise<string> {
  const normalized = entries.map(stripDoc);

  // Deterministically sort by (kind, name)
  normalized.sort((a, b) => {
    const kindOrder = getArm(a).localeCompare(getArm(b));
    if (kindOrder !== 0) return kindOrder;
    return getSpecEntryName(a).localeCompare(getSpecEntryName(b));
  });

  const buffers = normalized.map((e) => e.toXDR());
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    combined.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), offset);
    offset += b.byteLength;
  }

  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Minimal WebAssembly custom section extractor with LEB128 decoding and 256 KiB cap.
 */
export function parseWasmCustomSections(buffer: Uint8Array | Buffer): Map<string, Uint8Array> {
  if (buffer.length > WASM_MAX_CODE_SIZE) {
    throw new Error(`WASM module exceeds maximum allowed size of ${WASM_MAX_CODE_SIZE} bytes (got ${buffer.length})`);
  }

  const sections = new Map<string, Uint8Array>();
  let offset = 0;

  const readBytes = (len: number): Uint8Array => {
    if (offset + len > buffer.length) throw new Error("Unexpected end of WASM binary");
    const slice = buffer.subarray(offset, offset + len);
    offset += len;
    return slice;
  };

  const readVarUint32 = (): number => {
    let value = 0;
    let shift = 0;
    while (true) {
      if (offset >= buffer.length) throw new Error("Unexpected end of WASM binary reading LEB128");
      const byte = buffer[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift >= 32) throw new Error("Invalid LEB128 integer");
    }
    return value >>> 0;
  };

  // Check magic \0asm and version 1
  const magic = readBytes(4);
  if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
    throw new Error("Invalid WASM magic header");
  }
  const version = readBytes(4);
  if (version[0] !== 0x01 || version[1] !== 0x00 || version[2] !== 0x00 || version[3] !== 0x00) {
    throw new Error("Invalid WASM version");
  }

  while (offset < buffer.length) {
    const sectionId = buffer[offset++];
    const sectionLength = readVarUint32();
    const sectionStart = offset;

    if (sectionId === 0) {
      // Custom section
      const nameLen = readVarUint32();
      if (nameLen > 0 && offset + nameLen <= sectionStart + sectionLength) {
        const nameBytes = readBytes(nameLen);
        const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
        const payloadLength = sectionLength - (offset - sectionStart);
        const payload = readBytes(payloadLength);
        sections.set(name, payload);
      }
    }

    offset = sectionStart + sectionLength;
  }

  return sections;
}

/**
 * Parses contract spec entries from WASM bytecode.
 */
export function parseSpecFromWasm(wasm: Uint8Array | Buffer): xdr.ScSpecEntry[] {
  if (wasm.length > WASM_MAX_CODE_SIZE) {
    throw new Error(`WASM code exceeds ${WASM_MAX_CODE_SIZE} bytes`);
  }

  // Attempt using Stellar SDK's Spec.fromWasm helper
  try {
    const wasmBuf = Buffer.isBuffer(wasm) ? wasm : Buffer.from(wasm);
    const spec = Spec.fromWasm(wasmBuf);
    if (spec && Array.isArray(spec.entries) && spec.entries.length > 0) {
      return spec.entries;
    }
  } catch {
    // Fall back to manual section parse
  }

  const sections = parseWasmCustomSections(wasm);
  const payload = sections.get("contractspecv0");
  if (!payload || payload.length === 0) {
    throw new Error("Could not obtain contractspecv0 custom section from WASM");
  }

  // Parse entries via Spec
  const spec = new Spec(Buffer.from(payload));
  return spec.entries;
}

/**
 * Compares two spec sets and returns up to 3 human-readable differences.
 */
export function diffSpecs(bundled: xdr.ScSpecEntry[], onChain: xdr.ScSpecEntry[]): string {
  const diffs: string[] = [];

  const bundledFns = new Map<string, xdr.ScSpecFunctionV0>();
  const onChainFns = new Map<string, xdr.ScSpecFunctionV0>();

  for (const e of bundled) {
    if (getArm(e) === "functionV0") {
      const fn = e.value() as xdr.ScSpecFunctionV0;
      bundledFns.set(fn.name().toString(), fn);
    }
  }
  for (const e of onChain) {
    if (getArm(e) === "functionV0") {
      const fn = e.value() as xdr.ScSpecFunctionV0;
      onChainFns.set(fn.name().toString(), fn);
    }
  }

  // Check functions on-chain that differ or are missing
  for (const [name, onFn] of onChainFns) {
    const bFn = bundledFns.get(name);
    if (!bFn) {
      diffs.push(`function ${name} added on-chain`);
      continue;
    }
    const bInputs = bFn.inputs().map((i) => `${i.name().toString()}`).join(", ");
    const onInputs = onFn.inputs().map((i) => `${i.name().toString()}`).join(", ");
    if (bInputs !== onInputs) {
      diffs.push(`function ${name}: args differ (bundled: (${bInputs}), on-chain: (${onInputs}))`);
    }
  }

  for (const name of bundledFns.keys()) {
    if (!onChainFns.has(name)) {
      diffs.push(`function ${name} missing on-chain`);
    }
  }

  // Check errors
  const bundledErrors = new Map<number, string>();
  const onChainErrors = new Map<number, string>();
  for (const e of bundled) {
    if (getArm(e) === "udtErrorEnumV0") {
      const err = e.value() as xdr.ScSpecUdtErrorEnumV0;
      for (const cs of err.cases()) {
        bundledErrors.set(cs.value(), cs.name().toString());
      }
    }
  }
  for (const e of onChain) {
    if (getArm(e) === "udtErrorEnumV0") {
      const err = e.value() as xdr.ScSpecUdtErrorEnumV0;
      for (const cs of err.cases()) {
        onChainErrors.set(cs.value(), cs.name().toString());
      }
    }
  }

  for (const [code, onName] of onChainErrors) {
    const bName = bundledErrors.get(code);
    if (!bName) {
      diffs.push(`error #${code} (${onName}) added on-chain`);
    } else if (bName !== onName) {
      diffs.push(`error #${code} renamed from ${bName} to ${onName}`);
    }
  }

  if (diffs.length === 0) {
    return "spec fingerprint mismatch";
  }

  return diffs.slice(0, 3).join("; ");
}

/**
 * Builds the persistent contract instance ledger key for a given contract ID.
 */
export function contractInstanceLedgerKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

/**
 * Checks integrity of all 4 configured Wasm contracts and the USDC SAC contract.
 */
export async function checkContractIntegrity(
  server: rpc.Server = rpcServer(),
): Promise<Record<ContractKey | "usdc", IntegrityResult>> {
  const wasmContracts: ContractKey[] = ["marketCore", "treasury", "resolver", "reasoningRegistry"];
  const results: Partial<Record<ContractKey | "usdc", IntegrityResult>> = {};

  // Build the 5 keys: 4 Wasm contracts + USDC
  const contractIds: Record<ContractKey | "usdc", string> = {
    marketCore: CONTRACTS.marketCore,
    treasury: CONTRACTS.treasury,
    resolver: CONTRACTS.resolver,
    reasoningRegistry: CONTRACTS.reasoningRegistry,
    usdc: CONTRACTS.usdc,
  };

  const keysToFetch: { key: xdr.LedgerKey; name: ContractKey | "usdc"; id: string }[] = [];
  for (const name of [...wasmContracts, "usdc" as const]) {
    const id = contractIds[name];
    try {
      keysToFetch.push({ key: contractInstanceLedgerKey(id), name, id });
    } catch (err) {
      results[name] = {
        contract: name,
        id,
        status: "not-found",
        detail: `Invalid contract address: ${String(err)}`,
        checkedAtLedger: 0,
      };
    }
  }

  let ledgerResponse: rpc.Api.GetLedgerEntriesResponse;
  try {
    ledgerResponse = await server.getLedgerEntries(...keysToFetch.map((k) => k.key));
  } catch (err) {
    const detail = `RPC getLedgerEntries failed: ${String(err)}`;
    for (const item of keysToFetch) {
      results[item.name] = {
        contract: item.name,
        id: item.id,
        status: "unchecked",
        detail,
        checkedAtLedger: 0,
      };
    }
    return results as Record<ContractKey | "usdc", IntegrityResult>;
  }

  const latestLedger = ledgerResponse.latestLedger;
  const entriesByKey = new Map<string, rpc.Api.LedgerEntryResult>();
  for (const entry of ledgerResponse.entries) {
    entriesByKey.set(entry.key.toXDR("base64"), entry);
  }

  // Check USDC SAC first
  const usdcKey = keysToFetch.find((k) => k.name === "usdc");
  if (usdcKey) {
    const entry = entriesByKey.get(usdcKey.key.toXDR("base64"));
    if (!entry) {
      results.usdc = {
        contract: "usdc",
        id: usdcKey.id,
        status: "not-found",
        detail: "USDC contract instance not found on-chain",
        checkedAtLedger: latestLedger,
      };
    } else if (entry.liveUntilLedgerSeq !== undefined && entry.liveUntilLedgerSeq < latestLedger) {
      results.usdc = {
        contract: "usdc",
        id: usdcKey.id,
        status: "unchecked",
        detail: "archived",
        checkedAtLedger: latestLedger,
      };
    } else {
      const contractData = entry.val.contractData();
      const instance = contractData.val().instance();
      const executable = instance.executable();

      if (executable.switch().name !== "contractExecutableStellarAsset") {
        results.usdc = {
          contract: "usdc",
          id: usdcKey.id,
          status: "wrong-kind",
          detail: `Expected Stellar Asset Contract, got ${getArm(executable)}`,
          checkedAtLedger: latestLedger,
        };
      } else {
        // Validate against expected NEXT_PUBLIC_USDC_ASSET
        const assetStr = USDC_ASSET;
        if (!assetStr || !assetStr.includes(":")) {
          results.usdc = {
            contract: "usdc",
            id: usdcKey.id,
            status: "mismatch",
            detail: "NEXT_PUBLIC_USDC_ASSET must be in CODE:ISSUER format",
            checkedAtLedger: latestLedger,
          };
        } else {
          const [code, issuer] = assetStr.split(":");
          try {
            const expectedId = new Asset(code, issuer).contractId(NETWORK_PASSPHRASE);
            if (expectedId !== usdcKey.id) {
              results.usdc = {
                contract: "usdc",
                id: usdcKey.id,
                status: "mismatch",
                detail: `Expected SAC contract id ${expectedId} for ${assetStr}, got ${usdcKey.id}`,
                checkedAtLedger: latestLedger,
              };
            } else {
              // Simulate SAC name() as belt-and-braces
              try {
                const nameTx = await token.name(usdcKey.id);
                const simResult = nameTx.result;
                if (simResult && simResult !== assetStr) {
                  results.usdc = {
                    contract: "usdc",
                    id: usdcKey.id,
                    status: "mismatch",
                    detail: `SAC simulated name '${simResult}' does not match expected '${assetStr}'`,
                    checkedAtLedger: latestLedger,
                  };
                } else {
                  results.usdc = {
                    contract: "usdc",
                    id: usdcKey.id,
                    status: "match",
                    checkedAtLedger: latestLedger,
                  };
                }
              } catch {
                // If name simulation fails, still match based on verified on-chain SAC executable + contractId
                results.usdc = {
                  contract: "usdc",
                  id: usdcKey.id,
                  status: "match",
                  checkedAtLedger: latestLedger,
                };
              }
            }
          } catch (err) {
            results.usdc = {
              contract: "usdc",
              id: usdcKey.id,
              status: "mismatch",
              detail: `Error verifying SAC asset: ${String(err)}`,
              checkedAtLedger: latestLedger,
            };
          }
        }
      }
    }
  }

  // Wasm contracts processing
  const unknownWasmHashes = new Map<string, { hash: Buffer; contracts: ContractKey[] }>();

  for (const name of wasmContracts) {
    const item = keysToFetch.find((k) => k.name === name);
    if (!item) continue;

    const entry = entriesByKey.get(item.key.toXDR("base64"));
    if (!entry) {
      results[name] = {
        contract: name,
        id: item.id,
        status: "not-found",
        detail: "Contract instance not found on-chain (network may have been reset)",
        checkedAtLedger: latestLedger,
      };
      continue;
    }

    if (entry.liveUntilLedgerSeq !== undefined && entry.liveUntilLedgerSeq < latestLedger) {
      results[name] = {
        contract: name,
        id: item.id,
        status: "unchecked",
        detail: "archived",
        checkedAtLedger: latestLedger,
      };
      continue;
    }

    const contractData = entry.val.contractData();
    const instance = contractData.val().instance();
    const executable = instance.executable();

    if (executable.switch().name !== "contractExecutableWasm") {
      results[name] = {
        contract: name,
        id: item.id,
        status: "wrong-kind",
        detail: `Expected WASM contract, got ${getArm(executable)}`,
        checkedAtLedger: latestLedger,
      };
      continue;
    }

    const wasmHashBuf = executable.wasmHash();
    const wasmHashHex = wasmHashBuf.toString("hex");

    const cachedFp = getCachedFingerprint(wasmHashHex);
    const bundledEntries = bundledSpec(name);
    const bundledFp = await specFingerprint(bundledEntries);

    if (cachedFp) {
      if (cachedFp === bundledFp) {
        results[name] = {
          contract: name,
          id: item.id,
          status: "match",
          wasmHash: wasmHashHex,
          onChainFingerprint: cachedFp,
          bundledFingerprint: bundledFp,
          checkedAtLedger: latestLedger,
        };
      } else {
        results[name] = {
          contract: name,
          id: item.id,
          status: "mismatch",
          wasmHash: wasmHashHex,
          onChainFingerprint: cachedFp,
          bundledFingerprint: bundledFp,
          detail: "On-chain contract spec differs from bundled bindings",
          checkedAtLedger: latestLedger,
        };
      }
    } else {
      const existing = unknownWasmHashes.get(wasmHashHex);
      if (existing) {
        existing.contracts.push(name);
      } else {
        unknownWasmHashes.set(wasmHashHex, { hash: wasmHashBuf, contracts: [name] });
      }
    }
  }

  // Fetch contract code for unknown Wasm hashes in one batched call
  if (unknownWasmHashes.size > 0) {
    const codeKeys: xdr.LedgerKey[] = [];
    const hashHexByBase64 = new Map<string, string>();

    for (const [hashHex, { hash }] of unknownWasmHashes) {
      const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }));
      codeKeys.push(codeKey);
      hashHexByBase64.set(codeKey.toXDR("base64"), hashHex);
    }

    try {
      const codeResponse = await server.getLedgerEntries(...codeKeys);
      for (const entry of codeResponse.entries) {
        const hashHex = hashHexByBase64.get(entry.key.toXDR("base64"));
        if (!hashHex) continue;

        const info = unknownWasmHashes.get(hashHex);
        if (!info) continue;

        const codeEntry = entry.val.contractCode();
        const wasmBytes = codeEntry.code();

        let onChainEntries: xdr.ScSpecEntry[];
        try {
          onChainEntries = parseSpecFromWasm(wasmBytes);
        } catch (err) {
          for (const contractKey of info.contracts) {
            results[contractKey] = {
              contract: contractKey,
              id: contractIds[contractKey],
              status: "mismatch",
              wasmHash: hashHex,
              detail: `Failed to extract spec from on-chain WASM: ${String(err)}`,
              checkedAtLedger: latestLedger,
            };
          }
          continue;
        }

        const onChainFp = await specFingerprint(onChainEntries);
        setCachedFingerprint(hashHex, onChainFp);

        for (const contractKey of info.contracts) {
          const bEntries = bundledSpec(contractKey);
          const bFp = await specFingerprint(bEntries);

          if (onChainFp === bFp) {
            results[contractKey] = {
              contract: contractKey,
              id: contractIds[contractKey],
              status: "match",
              wasmHash: hashHex,
              onChainFingerprint: onChainFp,
              bundledFingerprint: bFp,
              checkedAtLedger: latestLedger,
            };
          } else {
            const detail = diffSpecs(bEntries, onChainEntries);
            results[contractKey] = {
              contract: contractKey,
              id: contractIds[contractKey],
              status: "mismatch",
              wasmHash: hashHex,
              onChainFingerprint: onChainFp,
              bundledFingerprint: bFp,
              detail,
              checkedAtLedger: latestLedger,
            };
          }
        }
      }

      // Any contract whose code entry was not returned
      for (const [hashHex, info] of unknownWasmHashes) {
        for (const contractKey of info.contracts) {
          if (!results[contractKey]) {
            results[contractKey] = {
              contract: contractKey,
              id: contractIds[contractKey],
              status: "not-found",
              wasmHash: hashHex,
              detail: "Contract WASM code entry not found on-chain",
              checkedAtLedger: latestLedger,
            };
          }
        }
      }
    } catch (err) {
      for (const [, info] of unknownWasmHashes) {
        for (const contractKey of info.contracts) {
          results[contractKey] = {
            contract: contractKey,
            id: contractIds[contractKey],
            status: "unchecked",
            detail: `Failed to fetch WASM code: ${String(err)}`,
            checkedAtLedger: latestLedger,
          };
        }
      }
    }
  }

  return results as Record<ContractKey | "usdc", IntegrityResult>;
}

/**
 * React Query hook providing contract integrity status.
 */
export function useContractIntegrity() {
  return useQuery({
    queryKey: ["stellar", "integrity", NETWORK_PASSPHRASE],
    queryFn: () => checkContractIntegrity(),
    staleTime: Infinity,
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });
}
