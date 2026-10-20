import { NETWORK_LABEL, NETWORK_PASSPHRASE } from "./config";
import { rpcServer } from "./clients";

export type RpcNetworkState =
  | { status: "checking" }
  | { status: "ok"; protocolVersion: number; friendbotUrl?: string }
  | { status: "mismatch"; rpcPassphrase: string }
  | { status: "unreachable"; error: string };

export class NetworkMismatchError extends Error {
  constructor(public readonly expected: string, public readonly got: string) {
    super("The OracleDesk server is on a different Stellar network than this app. Sign-in is disabled.");
    this.name = "NetworkMismatchError";
  }
}

export async function checkRpcNetwork(server: Pick<ReturnType<typeof rpcServer>, "getNetwork"> = rpcServer()): Promise<RpcNetworkState> {
  try {
    const result = await server.getNetwork();
    return result.passphrase === NETWORK_PASSPHRASE
      ? { status: "ok", protocolVersion: Number(result.protocolVersion), friendbotUrl: result.friendbotUrl }
      : { status: "mismatch", rpcPassphrase: result.passphrase };
  } catch (error) {
    return { status: "unreachable", error: error instanceof Error ? error.message : "Couldn't reach the Stellar network." };
  }
}

export const wrongNetworkMessage = () => `Switch your wallet to ${NETWORK_LABEL} and try again.`;
