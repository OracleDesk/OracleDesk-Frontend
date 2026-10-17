import { AssembledTransaction, Ok, Err, type Result } from "@stellar/stellar-sdk/contract";
import type { marketCore, reasoningRegistry } from "./clients";
import { describeError, UserFacingError, type ContractName } from "./errors";

/** T from AssembledTransaction<T> */
export type TxValue<Tx> = Tx extends AssembledTransaction<infer T> ? T : never;

/** Unwrapped value: Result<V> -> V, otherwise T itself (non-distributive) */
export type Unwrapped<T> = [T] extends [Result<infer V, any>] ? V : T;

/** For a client method: (args, opts?) => Promise<AssembledTransaction<X>> -> Unwrapped<X> */
export type MethodValue<M> = M extends (...a: any[]) => Promise<infer Tx> ? Unwrapped<TxValue<Tx>> : never;

export type MarketCoreClient = ReturnType<typeof marketCore>;
export type RegistryClient = ReturnType<typeof reasoningRegistry>;
export type Value<C, K extends keyof C> = MethodValue<C[K]>;

/**
 * Converts any Uint8Array or Buffer into a lowercase hex string.
 * Used for contract trace hashes and other byte arrays.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Internal unwrap helper that detects Ok/Err from @stellar/stellar-sdk/contract.
 * Plain values (e.g. Position, numbers, duck-typed objects) are returned unchanged.
 */
export function unwrapResult<Tx extends AssembledTransaction<any>>(
  raw: unknown,
  contract: ContractName,
  simError?: string,
): Unwrapped<TxValue<Tx>> {
  if (
    process.env.NODE_ENV !== "production" &&
    raw &&
    typeof raw === "object" &&
    (raw.constructor?.name === "Ok" || raw.constructor?.name === "Err") &&
    !(raw instanceof Ok || raw instanceof Err)
  ) {
    console.warn(
      "[typed-call] Result instance detected from a different SDK copy. Ensure only one @stellar/stellar-sdk is bundled.",
    );
  }

  if (raw instanceof Err) {
    const detail = simError ? `${simError} ${raw.error?.message ?? ""}` : (raw.error?.message ?? raw.error ?? raw);
    throw new UserFacingError(describeError(detail, contract), raw);
  }

  const value = raw instanceof Ok ? raw.unwrap() : raw;

  // Single boundary cast: SentTransaction.result and simulated AssembledTransaction.result
  // are typed broadly at the SDK boundary, while the binding provides the static return type.
  return value as Unwrapped<TxValue<Tx>>;
}

/**
 * Extracts and unwraps the simulation result of an AssembledTransaction.
 * Infers the unwrapped return type directly from the transaction's type.
 */
export function read<Tx extends AssembledTransaction<any>>(
  tx: Tx,
  contract: ContractName = "marketCore",
): Unwrapped<TxValue<Tx>> {
  let raw: unknown;
  try {
    raw = tx.result;
  } catch (err) {
    throw new UserFacingError(describeError(`${tx.simulation?.error ?? ""} ${String(err)}`, contract), err);
  }
  return unwrapResult<Tx>(raw, contract, tx.simulation?.error);
}

/**
 * Signs and submits an AssembledTransaction, first surfacing any simulation errors via read().
 * Returns the unwrapped value and transaction hash.
 */
export async function submit<Tx extends AssembledTransaction<any>>(
  tx: Tx,
  contract: ContractName = "marketCore",
): Promise<{ value: Unwrapped<TxValue<Tx>>; txHash: string | null }> {
  // Surface simulation failures before asking the wallet to sign.
  read(tx, contract);
  try {
    const sent = await tx.signAndSend();
    const value = unwrapResult<Tx>(sent.result, contract);
    return { value, txHash: sent.sendTransactionResponse?.hash ?? null };
  } catch (err) {
    if (err instanceof UserFacingError) throw err;
    throw new UserFacingError(describeError(err, contract), err);
  }
}
