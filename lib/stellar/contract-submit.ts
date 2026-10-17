import { rpc } from "@stellar/stellar-sdk";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import type { Signer } from "./clients";
import { RPC_URL } from "./config";
import { describeError, UserFacingError, type ContractName } from "./errors";
import { read, unwrapResult, type TxValue, type Unwrapped } from "./typed-call";

export interface RpcServerLike {
  getLatestLedger(): Promise<{ sequence: number }>;
  getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse>;
}

export interface SubmitAsContractOptions {
  signatureExpirationLedgerOffset?: number;
  rpcServer?: RpcServerLike;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Signs Soroban authorization entries as a contract account (passkey smart wallet),
 * re-simulates, submits via the relayer, and polls getTransaction until SUCCESS.
 */
export async function submitAsContract<Tx extends AssembledTransaction<any>>(
  tx: Tx,
  signer: Extract<Signer, { kind: "contract" }>,
  contract: ContractName = "marketCore",
  opts?: SubmitAsContractOptions,
): Promise<{ value: Unwrapped<TxValue<Tx>>; txHash: string | null }> {
  // 1. Surface simulation failures before asking the user to authorize.
  read(tx, contract);

  // 2. Ensure only the trader's authorization is requested. Refuse unexpected addresses.
  const needed = await tx.needsNonInvokerSigningBy();
  const unexpected = needed.filter((addr) => addr !== signer.address);
  if (unexpected.length > 0 || !needed.includes(signer.address)) {
    throw new UserFacingError(
      {
        kind: "contract",
        message: `Unexpected authorization required for address: ${unexpected.join(", ") || "none"}`,
      },
      new Error(`Signing refused: needed addresses [${needed.join(", ")}] != [${signer.address}]`),
    );
  }

  const server = opts?.rpcServer ?? new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });

  // 3. Obtain ledger sequence for signature expiration (default: latest + 60 ledgers ~ 5 minutes)
  let latestLedger = 0;
  try {
    const info = await server.getLatestLedger();
    latestLedger = info.sequence;
  } catch {
    latestLedger = 1_000_000;
  }
  const expiration = latestLedger + (opts?.signatureExpirationLedgerOffset ?? 60);

  // 4. Sign Soroban auth entries
  await tx.signAuthEntries({
    address: signer.address,
    authorizeEntry: (entry) => signer.signAuthEntry(entry, expiration),
  });

  // 5. Re-simulate with the signed authorization to capture __check_auth footprint & resource costs
  await tx.simulate();

  // 6. Build transaction and submit via relayer
  const built = tx.build();
  let hash: string | null = null;
  try {
    const res = await signer.submit(built);
    hash = res.hash;
  } catch (err) {
    if (err instanceof UserFacingError) throw err;
    throw new UserFacingError(describeError(err, contract, signer.address), err);
  }

  if (!hash) {
    return { value: unwrapResult<Tx>(undefined, contract), txHash: null };
  }

  // 7. Poll getTransaction until SUCCESS
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 1_000;
  const start = Date.now();

  let getTx = await server.getTransaction(hash);
  while (
    getTx.status === rpc.Api.GetTransactionStatus.NOT_FOUND ||
    (getTx as any).status === "PENDING" ||
    (getTx as any).status === "NOT_FOUND"
  ) {
    if (Date.now() - start > timeoutMs) {
      throw new UserFacingError(
        {
          kind: "network",
          message: "Transaction submission timed out awaiting ledger inclusion via relayer.",
        },
        new Error(`Timeout polling getTransaction for ${hash}`),
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    getTx = await server.getTransaction(hash);
  }

  if (getTx.status !== rpc.Api.GetTransactionStatus.SUCCESS && (getTx as any).status !== "SUCCESS") {
    const rawError = (getTx as any).resultXdr?.toXDR?.("base64") ?? (getTx as any).resultXdr ?? "Transaction failed";
    throw new UserFacingError(describeError(rawError, contract, signer.address), getTx);
  }

  // Extract parsed result if parseResultXdr is available on the AssembledTransaction
  let rawResult: unknown;
  const txOpts = (tx as any).options;
  if ((getTx as any).returnValue && txOpts?.parseResultXdr) {
    rawResult = txOpts.parseResultXdr((getTx as any).returnValue);
  } else {
    try {
      rawResult = tx.result;
    } catch {
      rawResult = undefined;
    }
  }

  const value = unwrapResult<Tx>(rawResult, contract);
  return { value, txHash: hash };
}
