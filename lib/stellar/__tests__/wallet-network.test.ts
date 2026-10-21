import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import { probeWalletNetwork, WalletNetworkStore } from "../wallet-network";
import type { WalletKitAdapter } from "../wallet-kit-adapter";
import { NETWORK_LABEL, NETWORK_PASSPHRASE } from "../config";
import { describeError } from "../errors";
import { TxLifecycle } from "../tx-lifecycle";
import { recheckRpcAfterSimulation, setRpcNetworkBlocked } from "../rpc-network-guard";

afterEach(() => { vi.unstubAllGlobals(); setRpcNetworkBlocked(false); });
const kit = (getNetwork: WalletKitAdapter["getNetwork"]) => ({ getNetwork, selectedModuleId: () => "ledger" }) as WalletKitAdapter;
describe("wallet network consistency", () => {
  it("maps unsupported and permission failures to unknown", async () => {
    expect(await probeWalletNetwork(kit(vi.fn().mockRejectedValue({ code: -3 })))).toEqual({ state: "unknown", confirmedByUser: false });
    expect(await probeWalletNetwork(kit(vi.fn().mockRejectedValue(new Error("Permission denied"))))).toMatchObject({ state: "unknown" });
  });
  it("maps real wallet responses, not kit-selected network", async () => {
    expect(await probeWalletNetwork(kit(vi.fn().mockResolvedValue({ networkPassphrase: NETWORK_PASSPHRASE })))).toEqual({ state: "match" });
    expect(await probeWalletNetwork(kit(vi.fn().mockResolvedValue({ networkPassphrase: "other" })))).toEqual({ state: "mismatch", passphrase: "other" });
  });
  it("forgets an unknown-network confirmation on reconnect", async () => {
    const store = new WalletNetworkStore(vi.fn()); const adapter = kit(vi.fn().mockRejectedValue({ code: -3 }));
    store.connect("GA", adapter); await store.refreshWallet(); store.confirmUnknownNetwork();
    expect(store.getSnapshot().walletNetwork).toEqual({ state: "unknown", confirmedByUser: true });
    store.connect(null, null); store.connect("GA", adapter); await store.refreshWallet();
    expect(store.getSnapshot().walletNetwork).toEqual({ state: "unknown", confirmedByUser: false });
  });
  it("discards a signature when the network epoch changes before send", async () => {
    const purge = vi.fn(); const store = new WalletNetworkStore(purge);
    const getNetwork = vi.fn().mockResolvedValue({ networkPassphrase: NETWORK_PASSPHRASE });
    store.connect("GA", kit(getNetwork)); await store.refreshWallet();
    const epoch = store.getSnapshot().networkEpoch;
    const sendTransaction = vi.fn();
    const tx = { result: 1n, sign: vi.fn(async () => {
      getNetwork.mockResolvedValue({ networkPassphrase: "mainnet" }); await store.refreshWallet();
    }) } as unknown as AssembledTransaction<bigint>;
    const runner = new TxLifecycle<bigint>({ server: { sendTransaction } as never, contract: "marketCore" });
    await expect(runner.run(tx, () => 1n, undefined, () => store.assertCurrent(epoch)))
      .rejects.toMatchObject({ described: { kind: "wrong-network" } });
    expect(sendTransaction).not.toHaveBeenCalled(); expect(purge).toHaveBeenCalledOnce();
  });
  it("requires a new confirmation for another wallet module on the same address", async () => {
    const store = new WalletNetworkStore(vi.fn());
    let moduleId = "ledger";
    const adapter = { ...kit(vi.fn().mockRejectedValue({ code: -3 })), selectedModuleId: () => moduleId };
    store.connect("GA", adapter); await store.refreshWallet(); store.confirmUnknownNetwork();
    moduleId = "trezor"; await store.refreshWallet();
    expect(store.getSnapshot().walletNetwork).toEqual({ state: "unknown", confirmedByUser: false });
  });
  it("uses the configured label in wrong-network messages", () => {
    expect(describeError(new Error("wrong network")).message).toContain(NETWORK_LABEL);
  });
  it("rechecks an unreachable startup RPC after the first successful simulation", async () => {
    const check = vi.fn().mockResolvedValue({ status: "unreachable", error: "offline" });
    const store = new WalletNetworkStore(vi.fn(), check);
    await store.checkRpc(); expect(check).toHaveBeenCalledTimes(3);
    check.mockResolvedValue({ status: "ok", protocolVersion: 23 });
    await recheckRpcAfterSimulation();
    expect(store.getSnapshot().rpcNetwork.status).toBe("ok"); expect(check).toHaveBeenCalledTimes(4);
  });
});
