import { describe, expect, it } from "vitest";
import { Address, Asset, rpc, xdr } from "@stellar/stellar-sdk";
import {
  bundledSpec,
  specFingerprint,
  parseWasmCustomSections,
  parseSpecFromWasm,
  diffSpecs,
  checkContractIntegrity,
  WASM_MAX_CODE_SIZE,
} from "../contract-check";
import { CONTRACTS, TESTNET_PASSPHRASE } from "../config";
import deployments from "../generated/deployments.testnet.json";

function encodeUleb128(val: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = val & 0x7f;
    val >>>= 7;
    if (val !== 0) b |= 0x80;
    bytes.push(b);
  } while (val !== 0);
  return Buffer.from(bytes);
}

function buildSyntheticWasm(customSectionName: string, payload: Buffer): Buffer {
  const nameBytes = Buffer.from(customSectionName, "utf8");
  const sectionContent = Buffer.concat([
    encodeUleb128(nameBytes.length),
    nameBytes,
    payload,
  ]);
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), // magic + version 1
    Buffer.from([0x00]), // custom section id
    encodeUleb128(sectionContent.length),
    sectionContent,
  ]);
}

describe("Contract Integrity & Spec Fingerprinting (Issue #144)", () => {
  it("bundledSpec fingerprints are stable across repeated calls", async () => {
    const mcEntries1 = bundledSpec("marketCore");
    const mcEntries2 = bundledSpec("marketCore");
    const fp1 = await specFingerprint(mcEntries1);
    const fp2 = await specFingerprint(mcEntries2);

    expect(fp1).toBe(fp2);
    expect(fp1.length).toBe(64); // SHA-256 hex length
  });

  it("doc-only differences produce the exact same fingerprint", async () => {
    const fn1 = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "This is some original documentation",
        name: "test_fn",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "Doc for arg",
            name: "arg1",
            type: xdr.ScSpecTypeDef.scSpecTypeU64(),
          }),
        ],
        outputs: [xdr.ScSpecTypeDef.scSpecTypeBool()],
      }),
    );

    const fn2 = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "Different completely altered documentation text",
        name: "test_fn",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "Different doc",
            name: "arg1",
            type: xdr.ScSpecTypeDef.scSpecTypeU64(),
          }),
        ],
        outputs: [xdr.ScSpecTypeDef.scSpecTypeBool()],
      }),
    );

    const fp1 = await specFingerprint([fn1]);
    const fp2 = await specFingerprint([fn2]);

    expect(fp1).toBe(fp2);
  });

  it("added or altered function produces mismatch with readable detail", async () => {
    const bundledFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "buy",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "trader",
            type: xdr.ScSpecTypeDef.scSpecTypeAddress(),
          }),
        ],
        outputs: [],
      }),
    );

    const onChainFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "buy",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "trader",
            type: xdr.ScSpecTypeDef.scSpecTypeAddress(),
          }),
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "min_shares_out",
            type: xdr.ScSpecTypeDef.scSpecTypeI128(),
          }),
        ],
        outputs: [],
      }),
    );

    const extraFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "sweep_fees",
        inputs: [],
        outputs: [],
      }),
    );

    const fpBundled = await specFingerprint([bundledFn]);
    const fpOnChain = await specFingerprint([onChainFn, extraFn]);
    expect(fpBundled).not.toBe(fpOnChain);

    const diff = diffSpecs([bundledFn], [onChainFn, extraFn]);
    expect(diff).toContain("function buy: args differ");
    expect(diff).toContain("function sweep_fees added on-chain");
  });

  it("wasm parser extracts contractspecv0 from a synthetic WASM binary", () => {
    const fn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "hello",
        name: "synthetic_test_fn",
        inputs: [],
        outputs: [],
      }),
    );
    const wasm = buildSyntheticWasm("contractspecv0", fn.toXDR());

    const entries = parseSpecFromWasm(wasm);
    expect(entries.length).toBe(1);
    expect(entries[0].switch().name).toBe("scSpecEntryFunctionV0");
    expect((entries[0].value() as xdr.ScSpecFunctionV0).name().toString()).toBe("synthetic_test_fn");
  });

  it("wasm parser rejects oversized or malformed modules", () => {
    const oversized = Buffer.alloc(WASM_MAX_CODE_SIZE + 1);
    expect(() => parseWasmCustomSections(oversized)).toThrow(/exceeds maximum allowed size/);

    const invalidMagic = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x01, 0x00, 0x00, 0x00]);
    expect(() => parseWasmCustomSections(invalidMagic)).toThrow(/Invalid WASM magic header/);

    const invalidVersion = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x02, 0x00, 0x00, 0x00]);
    expect(() => parseWasmCustomSections(invalidVersion)).toThrow(/Invalid WASM version/);
  });

  it("SAC id check: correct asset matches, wrong issuer mismatches", () => {
    const correctIssuer = deployments.deployer;
    const wrongIssuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

    const correctId = new Asset("USDC", correctIssuer).contractId(TESTNET_PASSPHRASE);
    const wrongId = new Asset("USDC", wrongIssuer).contractId(TESTNET_PASSPHRASE);

    expect(correctId).toBe(CONTRACTS.usdc);
    expect(wrongId).not.toBe(CONTRACTS.usdc);
  });

  it("instance executable stellarAsset for a wasm contract is wrong-kind", async () => {
    const fakeServer = {
      getLedgerEntries: async () => {
        // Return stellarAsset executable for marketCore
        const instanceData = new xdr.ContractDataEntry({
          contract: new Address(CONTRACTS.marketCore).toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvContractInstance(
            new xdr.ScContractInstance({
              executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
              storage: null,
            }),
          ),
          ext: new xdr.ExtensionPoint(0),
        });

        const key = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(CONTRACTS.marketCore).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        );

        return {
          latestLedger: 12345,
          entries: [
            {
              lastModifiedLedgerSeq: 1000,
              liveUntilLedgerSeq: 20000,
              key,
              val: xdr.LedgerEntryData.contractData(instanceData),
            },
          ],
        };
      },
    } as unknown as rpc.Server;

    const res = await checkContractIntegrity(fakeServer);
    expect(res.marketCore.status).toBe("wrong-kind");
    expect(res.marketCore.detail).toContain("Expected WASM contract");
  });

  it("archived instance yields unchecked, not not-found", async () => {
    const fakeServer = {
      getLedgerEntries: async () => {
        const instanceData = new xdr.ContractDataEntry({
          contract: new Address(CONTRACTS.marketCore).toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvContractInstance(
            new xdr.ScContractInstance({
              executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),
              storage: null,
            }),
          ),
          ext: new xdr.ExtensionPoint(0),
        });

        const key = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(CONTRACTS.marketCore).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        );

        return {
          latestLedger: 25000,
          entries: [
            {
              lastModifiedLedgerSeq: 1000,
              // liveUntilLedgerSeq < latestLedger implies archived TTL expired
              liveUntilLedgerSeq: 20000,
              key,
              val: xdr.LedgerEntryData.contractData(instanceData),
            },
          ],
        };
      },
    } as unknown as rpc.Server;

    const res = await checkContractIntegrity(fakeServer);
    expect(res.marketCore.status).toBe("unchecked");
    expect(res.marketCore.detail).toBe("archived");
  });
});
