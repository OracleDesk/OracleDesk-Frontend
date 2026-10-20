import { Account, Address, Asset, Operation, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import type { TxCheck } from "@/lib/stellar/tx-lifecycle";

export const trader = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const expected = { trader, onChainMarketId: "7", outcome: "Yes" as const, collateralInRaw: "10000000" };
export function buyCheck(overrides: { contract?: string; fn?: string; amount?: bigint; outcome?: string; market?: bigint; trader?: string } = {}): TxCheck {
  const tx = new TransactionBuilder(new Account(trader, "1"), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.invokeContractFunction({ contract: overrides.contract ?? CONTRACTS.marketCore, function: overrides.fn ?? "buy", args: [
      new Address(overrides.trader ?? trader).toScVal(), nativeToScVal(overrides.market ?? 7n, { type: "u64" }),
      xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(overrides.outcome ?? "Yes")]),
      nativeToScVal(overrides.amount ?? 10000000n, { type: "i128" }), nativeToScVal(0n, { type: "i128" }),
    ] })).setTimeout(30).build();
  return { kind: "success", ledger: 100, envelope: tx.toEnvelope() };
}
export function classicEnvelope() {
  return new TransactionBuilder(new Account(trader, "1"), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: trader, asset: Asset.native(), amount: "1" })).setTimeout(30).build().toEnvelope();
}
