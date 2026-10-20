// The shared RPC transport also protects reads outside React Query. A mismatch
// blocks every RPC method except getNetwork, which can repair the configuration.
let blocked = false;
let epoch = 0;
let recoveryCheck: (() => Promise<unknown>) | null = null;
export function setRpcNetworkBlocked(next: boolean) { if (next !== blocked) { blocked = next; epoch++; } }
export function rpcNetworkEpoch() { return epoch; }
export function invalidateSigningEpoch() { epoch++; }
export function setRpcRecoveryCheck(check: (() => Promise<unknown>) | null) { recoveryCheck = check; }
export async function recheckRpcAfterSimulation() {
  const check = recoveryCheck;
  if (!check) return;
  recoveryCheck = null;
  await check();
  assertRpcNetwork();
}
export function assertRpcNetwork(expectedEpoch?: number) {
  if (blocked || (expectedEpoch !== undefined && expectedEpoch !== epoch)) {
    throw new Error("RPC network mismatch: the configured Stellar network changed. Signing and chain reads are disabled.");
  }
}
