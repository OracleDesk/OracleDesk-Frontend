import { describe, expect, it } from "vitest";
import { decodeInvoke } from "../tx-lifecycle";
import { buyCheck, classicEnvelope } from "@/lib/hooks/__tests__/copy-trade-fixture";

describe("transaction invocation decoding", () => {
  it("returns null for classic operations", () => expect(decodeInvoke(classicEnvelope())).toBeNull());
  it("decodes a single buy invocation", () => {
    const check = buyCheck(); if (check.kind !== "success") throw new Error("fixture");
    expect(decodeInvoke(check.envelope)).toMatchObject({ fn: "buy", args: expect.any(Array) });
  });
});
