import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRpcNetwork } from "../network-check";
import { NETWORK_PASSPHRASE } from "../config";
import { rpcServer } from "../clients";
import { setRpcNetworkBlocked } from "../rpc-network-guard";

afterEach(() => { vi.restoreAllMocks(); setRpcNetworkBlocked(false); });
describe("RPC network check", () => {
  it("matches the configured passphrase", async () => {
    const getNetwork = vi.fn().mockResolvedValue({ passphrase: NETWORK_PASSPHRASE, protocolVersion: 23 });
    expect(await checkRpcNetwork({ getNetwork })).toMatchObject({ status: "ok", protocolVersion: 23 });
  });
  it("returns the mismatched passphrase", async () => {
    expect(await checkRpcNetwork({ getNetwork: vi.fn().mockResolvedValue({ passphrase: "other", protocolVersion: 23 }) }))
      .toEqual({ status: "mismatch", rpcPassphrase: "other" });
  });
  it("distinguishes an unreachable server", async () => {
    expect(await checkRpcNetwork({ getNetwork: vi.fn().mockRejectedValue(new Error("Offline")) }))
      .toEqual({ status: "unreachable", error: "Offline" });
  });
  it("blocks shared RPC reads before making a network request", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    setRpcNetworkBlocked(true);
    expect(() => rpcServer().getLatestLedger()).toThrow(/network mismatch/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
