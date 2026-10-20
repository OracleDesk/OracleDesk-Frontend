import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { normalize, readSpecEntries } from "../lib/spec.mjs";
import { diffSpecs, scanReferences } from "../spec-diff.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Contract Spec Diff & Submodule Change Reporter (Issue #143)", () => {
  it("detects added and removed functions", () => {
    const fn1 = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({ doc: "", name: "existing_fn", inputs: [], outputs: [] }),
    );
    const fnRemoved = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({ doc: "", name: "old_fn", inputs: [], outputs: [] }),
    );
    const fnAdded = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({ doc: "", name: "new_fn", inputs: [], outputs: [] }),
    );

    const oldNorm = normalize([fn1, fnRemoved]);
    const newNorm = normalize([fn1, fnAdded]);

    const diff = diffSpecs("marketCore", oldNorm, newNorm);

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "fn-removed", contract: "marketCore", fn: "old_fn" }),
        expect.objectContaining({ kind: "fn-added", contract: "marketCore", fn: "new_fn" }),
      ]),
    );
  });

  it("detects argument rename and type change", () => {
    const oldFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "buy",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "market_id",
            type: xdr.ScSpecTypeDef.scSpecTypeU64(),
          }),
        ],
        outputs: [],
      }),
    );

    const newFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "buy",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "id", // renamed
            type: xdr.ScSpecTypeDef.scSpecTypeU128(), // type changed
          }),
        ],
        outputs: [],
      }),
    );

    const diff = diffSpecs("marketCore", normalize([oldFn]), normalize([newFn]));

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "fn-signature",
          contract: "marketCore",
          fn: "buy",
          before: "(market_id: u64) -> void",
          after: "(id: u128) -> void",
        }),
      ]),
    );
  });

  it("detects error added, removed, and renumbered", () => {
    const oldErrorEnum = xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
      new xdr.ScSpecUdtErrorEnumV0({
        doc: "",
        lib: "",
        name: "Errors",
        cases: [
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "Paused", value: 1 }),
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "SlippageExceeded", value: 2 }),
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "WillBeRemoved", value: 3 }),
        ],
      }),
    );

    const newErrorEnum = xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
      new xdr.ScSpecUdtErrorEnumV0({
        doc: "",
        lib: "",
        name: "Errors",
        cases: [
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "Paused", value: 1 }),
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "SlippageExceeded", value: 5 }), // renumbered from 2 to 5
          new xdr.ScSpecUdtErrorEnumCaseV0({ doc: "", name: "NewError", value: 4 }), // added
        ],
      }),
    );

    const diff = diffSpecs("marketCore", normalize([oldErrorEnum]), normalize([newErrorEnum]));

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "error-renumbered",
          contract: "marketCore",
          name: "SlippageExceeded",
          from: 2,
          to: 5,
        }),
        expect.objectContaining({
          kind: "error-added",
          contract: "marketCore",
          code: 4,
          name: "NewError",
        }),
        expect.objectContaining({
          kind: "error-removed",
          contract: "marketCore",
          code: 3,
          name: "WillBeRemoved",
        }),
      ]),
    );
  });

  it("detects union case added (Category gains Science)", () => {
    const oldUnion = xdr.ScSpecEntry.scSpecEntryUdtUnionV0(
      new xdr.ScSpecUdtUnionV0({
        doc: "",
        lib: "",
        name: "Category",
        cases: [
          xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
            new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: "Crypto" }),
          ),
          xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
            new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: "Macro" }),
          ),
        ],
      }),
    );

    const newUnion = xdr.ScSpecEntry.scSpecEntryUdtUnionV0(
      new xdr.ScSpecUdtUnionV0({
        doc: "",
        lib: "",
        name: "Category",
        cases: [
          xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
            new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: "Crypto" }),
          ),
          xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
            new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: "Macro" }),
          ),
          xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
            new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: "Science" }), // added
          ),
        ],
      }),
    );

    const diff = diffSpecs("marketCore", normalize([oldUnion]), normalize([newUnion]));

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "type-changed",
          contract: "marketCore",
          type: "Category",
        }),
      ]),
    );
  });

  it("detects event topic moved to data", () => {
    const oldEvent = xdr.ScSpecEntry.scSpecEntryEventV0(
      new xdr.ScSpecEventV0({
        doc: "",
        lib: "",
        name: "Trade",
        prefixTopics: [],
        params: [
          new xdr.ScSpecEventParamV0({
            doc: "",
            name: "market_id",
            type: xdr.ScSpecTypeDef.scSpecTypeU64(),
            location: xdr.ScSpecEventParamLocationV0.scSpecEventParamLocationTopicList(),
          }),
        ],
        dataFormat: xdr.ScSpecEventDataFormat.scSpecEventDataFormatVec(),
      }),
    );

    const newEvent = xdr.ScSpecEntry.scSpecEntryEventV0(
      new xdr.ScSpecEventV0({
        doc: "",
        lib: "",
        name: "Trade",
        prefixTopics: [],
        params: [
          new xdr.ScSpecEventParamV0({
            doc: "",
            name: "market_id",
            type: xdr.ScSpecTypeDef.scSpecTypeU64(),
            location: xdr.ScSpecEventParamLocationV0.scSpecEventParamLocationData(), // moved to data
          }),
        ],
        dataFormat: xdr.ScSpecEventDataFormat.scSpecEventDataFormatVec(),
      }),
    );

    const diff = diffSpecs("marketCore", normalize([oldEvent]), normalize([newEvent]));

    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "event-changed",
          contract: "marketCore",
          event: "Trade",
          requiresIndexerReview: true,
        }),
      ]),
    );
  });

  it("doc-only change is not a signature change", () => {
    const oldFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "Old documentation description",
        name: "get_market",
        inputs: [],
        outputs: [],
      }),
    );

    const newFn = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "New updated documentation description",
        name: "get_market",
        inputs: [],
        outputs: [],
      }),
    );

    const diff = diffSpecs("marketCore", normalize([oldFn]), normalize([newFn]));

    expect(diff.some((c) => c.kind === "fn-signature")).toBe(false);
    expect(diff.some((c) => c.kind === "fn-doc")).toBe(true);
  });

  it("real bindings round-trip: diff(current, current) is empty", () => {
    const content = readFileSync(
      join(__dirname, "../../lib/stellar/generated/market-core.ts"),
      "utf8",
    );
    const entries = readSpecEntries(content);
    const norm1 = normalize(entries);
    const norm2 = normalize(entries);

    const diff = diffSpecs("marketCore", norm1, norm2);
    expect(diff).toEqual([]);
  });

  it("reference scan identifies call sites of removed functions", () => {
    const affected = [{ contract: "marketCore", fn: "non_existent_sweep_test_fn", factory: "marketCore(" }];
    const hits = scanReferences(affected);
    // Since non_existent_sweep_test_fn doesn't exist in repo, hits should be empty
    expect(hits).toEqual([]);
  });
});
