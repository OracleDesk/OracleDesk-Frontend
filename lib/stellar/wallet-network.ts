import { NETWORK_LABEL, NETWORK_PASSPHRASE } from "./config";
import { UserFacingError } from "./errors";
import { checkRpcNetwork, wrongNetworkMessage, type RpcNetworkState } from "./network-check";
import type { WalletKitAdapter } from "./wallet-kit-adapter";
import { invalidateSigningEpoch, setRpcNetworkBlocked, setRpcRecoveryCheck } from "./rpc-network-guard";

export type WalletNetwork = { state: "unknown"; confirmedByUser: boolean } | { state: "match" } | { state: "mismatch"; passphrase: string };
export interface NetworkSnapshot { walletNetwork: WalletNetwork; rpcNetwork: RpcNetworkState; networkEpoch: number }
const unknown = (): WalletNetwork => ({ state: "unknown", confirmedByUser: false });

export async function probeWalletNetwork(kit: Pick<WalletKitAdapter, "getNetwork">): Promise<WalletNetwork> {
  try {
    const { networkPassphrase } = await kit.getNetwork();
    if (!networkPassphrase) return unknown();
    return networkPassphrase === NETWORK_PASSPHRASE ? { state: "match" } : { state: "mismatch", passphrase: networkPassphrase };
  } catch {
    // Unsupported (-3), revoked permissions and unavailable extensions all
    // mean the wallet cannot attest to its network. Never infer a match.
    return unknown();
  }
}

/** Per connection, shared by transaction and SEP-10 signers. */
export class WalletNetworkStore {
  private snapshot: NetworkSnapshot = { walletNetwork: unknown(), rpcNetwork: { status: "checking" }, networkEpoch: 0 };
  private listeners = new Set<() => void>();
  private address: string | null = null;
  private kit: WalletKitAdapter | null = null;
  private moduleId = "unknown";
  private generation = 0;
  private rpcCheck: Promise<RpcNetworkState> | null = null;
  private probe: Promise<WalletNetwork> | null = null;
  constructor(private readonly purge: () => void, private readonly check: () => Promise<RpcNetworkState> = checkRpcNetwork) { setRpcNetworkBlocked(false); setRpcRecoveryCheck(null); }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<NetworkSnapshot>) {
    if (patch.networkEpoch !== undefined && patch.networkEpoch !== this.snapshot.networkEpoch) invalidateSigningEpoch();
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private confirmationKey() {
    return this.address && this.kit ? `oracledesk_network_confirmed:${this.moduleId}:${this.address}` : null;
  }
  resetConfirmation = () => {
    const key = this.confirmationKey();
    try { if (key) localStorage.removeItem(key); } catch { /* storage is optional */ }
    if (this.snapshot.walletNetwork.state === "unknown") this.publish({ walletNetwork: unknown(), networkEpoch: this.snapshot.networkEpoch + 1 });
  };
  connect(address: string | null, kit: WalletKitAdapter | null) {
    const moduleId = kit?.selectedModuleId?.() ?? "unknown";
    if (address === this.address && kit === this.kit && moduleId === this.moduleId) return;
    this.resetConfirmation();
    this.generation++;
    this.address = address; this.kit = kit; this.moduleId = moduleId; this.probe = null;
    // Confirmations are deliberately forgotten on reconnect, even if storage
    // survived a reload or this address was last used in another module.
    const key = this.confirmationKey();
    try { if (key) localStorage.removeItem(key); } catch { /* optional */ }
    this.publish({ walletNetwork: unknown(), networkEpoch: this.snapshot.networkEpoch + 1 });
    if (address && kit) void this.refreshWallet();
  }
  confirmUnknownNetwork = () => {
    if (!this.address || !this.kit || this.snapshot.walletNetwork.state !== "unknown") return;
    const key = this.confirmationKey();
    try { if (key) localStorage.setItem(key, "true"); } catch { /* confirmation also lives in memory */ }
    this.publish({ walletNetwork: { state: "unknown", confirmedByUser: true } });
  };
  async checkRpc(): Promise<RpcNetworkState> {
    if (this.rpcCheck) return this.rpcCheck;
    this.rpcCheck = (async () => {
      let result = await this.check();
      for (let retry = 0; result.status === "unreachable" && retry < 2; retry++) result = await this.check();
      setRpcNetworkBlocked(result.status === "mismatch");
      setRpcRecoveryCheck(result.status === "unreachable" ? () => this.checkRpc() : null);
      if (result.status === "mismatch" && this.snapshot.rpcNetwork.status !== "mismatch") {
        this.publish({ rpcNetwork: result, networkEpoch: this.snapshot.networkEpoch + 1 }); this.purge();
      } else this.publish({ rpcNetwork: result });
      return result;
    })().finally(() => { this.rpcCheck = null; });
    return this.rpcCheck;
  }
  async refreshWallet(): Promise<WalletNetwork> {
    if (this.kit && (this.kit.selectedModuleId?.() ?? "unknown") !== this.moduleId) this.connect(this.address, this.kit);
    if (this.probe) return this.probe;
    if (!this.kit || !this.address) return unknown();
    const kit = this.kit; const generation = this.generation;
    const promise = probeWalletNetwork(kit).then((result) => {
      if (generation !== this.generation) return unknown();
      if (result.state === "unknown" && this.snapshot.walletNetwork.state === "unknown") result = this.snapshot.walletNetwork;
      const before = this.snapshot.walletNetwork;
      const changedToMismatch = result.state === "mismatch" && (before.state !== "mismatch" || result.passphrase !== before.passphrase);
      this.publish({ walletNetwork: result, ...(changedToMismatch ? { networkEpoch: this.snapshot.networkEpoch + 1 } : {}) });
      if (changedToMismatch) this.purge();
      return result;
    }).finally(() => { if (this.probe === promise) this.probe = null; });
    this.probe = promise;
    return promise;
  }
  canRead = () => this.snapshot.rpcNetwork.status !== "mismatch";
  assertCurrent(epoch: number, address?: string) {
    if (epoch !== this.snapshot.networkEpoch || (address && address !== this.address)) {
      throw new UserFacingError({ kind: "wrong-network", message: "Your wallet or network changed. Review the transaction again." });
    }
    if (!this.canRead()) throw new UserFacingError({ kind: "wrong-network", message: `The RPC is on a different network from ${NETWORK_LABEL}. Signing is disabled.` });
  }
  async beforeSign(address: string) {
    const epoch = this.snapshot.networkEpoch;
    this.assertCurrent(epoch, address);
    // An unreachable startup check may recover later. Recheck before signing
    // instead of treating it as a permanent configuration mismatch.
    if (this.snapshot.rpcNetwork.status === "checking" || this.snapshot.rpcNetwork.status === "unreachable") await this.checkRpc();
    const wallet = await this.refreshWallet();
    this.assertCurrent(epoch, address);
    if (wallet.state === "mismatch") throw new UserFacingError({ kind: "wrong-network", message: wrongNetworkMessage() });
    if (wallet.state === "unknown" && !wallet.confirmedByUser) throw new UserFacingError({ kind: "wrong-network", message: `Confirm your wallet is on ${NETWORK_LABEL} first in the wallet menu.` });
    return epoch;
  }
}
