import { Address, Asset, scValToNative, xdr, type rpc } from "@stellar/stellar-sdk";
import type { Spec } from "@stellar/stellar-sdk/contract";
import { CONTRACTS } from "./config";
import type { ContractKey } from "./contract-check";
import { UserFacingError } from "./errors";
import { calcBuy, settleValue, type Settlement } from "./generated/fpmm";
import type { Market, Position } from "./generated/market-core";
import { decodeMarket } from "./market-batch";
import { dataKeyName } from "./ledger-keys";
import { isMarket, isPosition, readUdt, settlementOf } from "./ledger-entries";

export type Effect =
  | { kind: "usdc-balance"; holder: string; before: bigint; after: bigint; via: "trustline" | "sac-balance" }
  | { kind: "market"; marketId: bigint; before: Market | null; after: Market | null }
  | { kind: "position"; marketId: bigint; holder: string; before: Position; after: Position }
  | { kind: "treasury-entry"; name: string; before: unknown; after: unknown }
  | { kind: "unknown"; contractId: string | null; keyXdr: string; change: "created" | "updated" | "deleted" };

export interface EffectSummary {
  sourceUsdcDelta: bigint;
  sourceSharesDeltas: { marketId: bigint; yesDelta: bigint; noDelta: bigint }[];
  marketDeltas: { marketId: bigint; reserveYesDelta: bigint; reserveNoDelta: bigint }[];
  otherUsdcDeltas: { holder: string; delta: bigint }[];
  otherPositionChanges: { marketId: bigint; holder: string }[];
  unknownWrites: { contractId: string | null; keyXdr: string }[];
}

function parseBigIntAmount(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(val);
  if (typeof val === "string") return BigInt(val);
  if (val && typeof val === "object" && "toBigInt" in val && typeof (val as { toBigInt(): bigint }).toBigInt === "function") {
    return (val as { toBigInt(): bigint }).toBigInt();
  }
  return 0n;
}

export function decodeStateChanges(
  changes: rpc.Api.LedgerEntryChange[],
  ctx: { specs?: Partial<Record<ContractKey, Spec>>; usdc?: Asset; networkPassphrase?: string },
): Effect[] {
  const effects: Effect[] = [];

  for (const ch of changes) {
    const key = ch.key;
    const keySwitch = key.switch().name;

    if (keySwitch === "ttl") {
      // TTL extensions are expected and benign
      continue;
    }

    if (keySwitch === "trustline") {
      const tl = key.trustLine();
      const asset = tl.asset();
      // Check if this trustline is USDC
      const holder = Address.fromScAddress(
        xdr.ScAddress.scAddressTypeAccount(tl.accountId()),
      ).toString();

      const beforeEntry = ch.before?.data()?.trustLine?.();
      const afterEntry = ch.after?.data()?.trustLine?.();

      const beforeBal = beforeEntry ? parseBigIntAmount(beforeEntry.balance()) : 0n;
      const afterBal = afterEntry ? parseBigIntAmount(afterEntry.balance()) : 0n;

      effects.push({
        kind: "usdc-balance",
        holder,
        before: beforeBal,
        after: afterBal,
        via: "trustline",
      });
      continue;
    }

    if (keySwitch === "contractData") {
      const cd = key.contractData();
      const contractAddress = Address.fromScAddress(cd.contract()).toString();
      const keyVal = cd.key();

      // Check USDC contract SAC storage
      if (contractAddress === CONTRACTS.usdc) {
        // SAC Balance key: Vec[Symbol("Balance"), Address] or Symbol("Balance")
        const keyNative = scValToNative(keyVal);
        let holder: string | null = null;
        if (Array.isArray(keyNative) && keyNative[0] === "Balance" && typeof keyNative[1] === "string") {
          holder = keyNative[1];
        } else if (keyNative === "Balance") {
          // Sometimes tuple or map
          try {
            holder = Address.fromScVal(keyVal).toString();
          } catch {
            holder = null;
          }
        }

        if (holder) {
          const beforeVal = ch.before?.data()?.contractData?.()?.val();
          const afterVal = ch.after?.data()?.contractData?.()?.val();

          const beforeNative = beforeVal ? scValToNative(beforeVal) : null;
          const afterNative = afterVal ? scValToNative(afterVal) : null;

          const beforeAmount = parseBigIntAmount(
            beforeNative && typeof beforeNative === "object" && "amount" in beforeNative
              ? (beforeNative as { amount: unknown }).amount
              : beforeNative ?? 0n,
          );
          const afterAmount = parseBigIntAmount(
            afterNative && typeof afterNative === "object" && "amount" in afterNative
              ? (afterNative as { amount: unknown }).amount
              : afterNative ?? 0n,
          );

          effects.push({
            kind: "usdc-balance",
            holder,
            before: beforeAmount,
            after: afterAmount,
            via: "sac-balance",
          });
          continue;
        }
      }

      // Check MarketCore storage
      if (contractAddress === CONTRACTS.marketCore) {
        const variant = dataKeyName(keyVal);
        if (variant === "Market") {
          const keyNative = scValToNative(keyVal);
          const marketId = BigInt(Array.isArray(keyNative) ? keyNative[1] : 0n);

          const beforeVal = ch.before?.data()?.contractData?.()?.val();
          const afterVal = ch.after?.data()?.contractData?.()?.val();

          const beforeMarket = beforeVal ? readUdt<Market>("Market", beforeVal) : null;
          const afterMarket = afterVal ? readUdt<Market>("Market", afterVal) : null;

          effects.push({
            kind: "market",
            marketId,
            before: isMarket(beforeMarket) ? beforeMarket : null,
            after: isMarket(afterMarket) ? afterMarket : null,
          });
          continue;
        }

        if (variant === "Position") {
          const keyNative = scValToNative(keyVal);
          const marketId = BigInt(Array.isArray(keyNative) ? keyNative[1] : 0n);
          const holder = Array.isArray(keyNative) ? String(keyNative[2]) : "";

          const beforeVal = ch.before?.data()?.contractData?.()?.val();
          const afterVal = ch.after?.data()?.contractData?.()?.val();

          const zeroPos: Position = { yes: 0n, no: 0n };
          const beforePos = beforeVal ? readUdt<Position>("Position", beforeVal) : zeroPos;
          const afterPos = afterVal ? readUdt<Position>("Position", afterVal) : zeroPos;

          effects.push({
            kind: "position",
            marketId,
            holder,
            before: isPosition(beforePos) ? beforePos : zeroPos,
            after: isPosition(afterPos) ? afterPos : zeroPos,
          });
          continue;
        }
      }

      // Check Treasury storage
      if (contractAddress === CONTRACTS.treasury) {
        const name = dataKeyName(keyVal) ?? "treasury";
        const beforeVal = ch.before?.data()?.contractData?.()?.val();
        const afterVal = ch.after?.data()?.contractData?.()?.val();
        effects.push({
          kind: "treasury-entry",
          name,
          before: beforeVal ? scValToNative(beforeVal) : null,
          after: afterVal ? scValToNative(afterVal) : null,
        });
        continue;
      }

      // Unknown contract data write
      const knownContracts = [
        CONTRACTS.marketCore,
        CONTRACTS.treasury,
        CONTRACTS.resolver,
        CONTRACTS.reasoningRegistry,
        CONTRACTS.usdc,
      ];
      if (!knownContracts.includes(contractAddress)) {
        effects.push({
          kind: "unknown",
          contractId: contractAddress,
          keyXdr: key.toXDR("base64"),
          change: ch.type as "created" | "updated" | "deleted",
        });
        continue;
      }
    }

    effects.push({
      kind: "unknown",
      contractId: null,
      keyXdr: key.toXDR("base64"),
      change: ch.type as "created" | "updated" | "deleted",
    });
  }

  return effects;
}

export function summarizeEffects(effects: Effect[], source: string): EffectSummary {
  let sourceUsdcDelta = 0n;
  const sourceSharesDeltas: { marketId: bigint; yesDelta: bigint; noDelta: bigint }[] = [];
  const marketDeltas: { marketId: bigint; reserveYesDelta: bigint; reserveNoDelta: bigint }[] = [];
  const otherUsdcDeltas: { holder: string; delta: bigint }[] = [];
  const otherPositionChanges: { marketId: bigint; holder: string }[] = [];
  const unknownWrites: { contractId: string | null; keyXdr: string }[] = [];

  for (const eff of effects) {
    if (eff.kind === "usdc-balance") {
      const delta = eff.after - eff.before;
      if (eff.holder === source) {
        sourceUsdcDelta += delta;
      } else {
        otherUsdcDeltas.push({ holder: eff.holder, delta });
      }
    } else if (eff.kind === "position") {
      if (eff.holder === source) {
        sourceSharesDeltas.push({
          marketId: eff.marketId,
          yesDelta: eff.after.yes - eff.before.yes,
          noDelta: eff.after.no - eff.before.no,
        });
      } else {
        otherPositionChanges.push({ marketId: eff.marketId, holder: eff.holder });
      }
    } else if (eff.kind === "market") {
      if (eff.before && eff.after) {
        marketDeltas.push({
          marketId: eff.marketId,
          reserveYesDelta: eff.after.reserve_yes - eff.before.reserve_yes,
          reserveNoDelta: eff.after.reserve_no - eff.before.reserve_no,
        });
      }
    } else if (eff.kind === "unknown") {
      unknownWrites.push({ contractId: eff.contractId, keyXdr: eff.keyXdr });
    }
  }

  return {
    sourceUsdcDelta,
    sourceSharesDeltas,
    marketDeltas,
    otherUsdcDeltas,
    otherPositionChanges,
    unknownWrites,
  };
}

export function assertEffectsMatchIntent(
  kind: string,
  intent: Record<string, string>,
  effects: Effect[],
  source: string,
): void {
  const summary = summarizeEffects(effects, source);

  // Invariant 1: No unknown writes to contracts outside CONTRACTS
  if (summary.unknownWrites.length > 0) {
    throw new UserFacingError({
      kind: "effects-mismatch",
      errorCode: "kind.effects-mismatch",
      message: `Transaction simulation modifies unknown contract data outside configured contracts (${summary.unknownWrites[0].contractId ?? "unknown"}).`,
    });
  }

  // Invariant 2: No balance decrease for any account other than source
  for (const other of summary.otherUsdcDeltas) {
    // Contract accounts (market-core, treasury) may have expected balance updates
    if (
      other.holder !== CONTRACTS.marketCore &&
      other.holder !== CONTRACTS.treasury &&
      other.delta < 0n
    ) {
      throw new UserFacingError({
        kind: "effects-mismatch",
        errorCode: "kind.effects-mismatch",
        message: `Transaction unexpectedly reduces the balance of another account (${other.holder}).`,
      });
    }
  }

  // Invariant 3: No position changes for any holder other than source
  if (summary.otherPositionChanges.length > 0) {
    const foreign = summary.otherPositionChanges[0];
    throw new UserFacingError({
      kind: "effects-mismatch",
      errorCode: "kind.effects-mismatch",
      message: `Transaction modifies position of another holder (${foreign.holder}) on market #${foreign.marketId}.`,
    });
  }

  // Kind-specific invariants
  if (kind === "buy") {
    const collateralIn = BigInt(intent.collateral_in || intent.amount || "0");
    const minSharesOut = BigInt(intent.min_shares_out || "0");
    const outcome = intent.outcome?.toLowerCase();

    // Source USDC must decrease by exactly collateral_in
    if (summary.sourceUsdcDelta !== -collateralIn) {
      throw new UserFacingError({
        kind: "effects-mismatch",
        errorCode: "kind.effects-mismatch",
        message: `Simulation shows USDC change of ${summary.sourceUsdcDelta}, but intent specified -${collateralIn}.`,
      });
    }

    // Position delta check
    const posDelta = summary.sourceSharesDeltas[0];
    if (posDelta) {
      const boughtDelta = outcome === "yes" ? posDelta.yesDelta : posDelta.noDelta;
      const otherDelta = outcome === "yes" ? posDelta.noDelta : posDelta.yesDelta;

      if (boughtDelta < minSharesOut) {
        throw new UserFacingError({
          kind: "effects-mismatch",
          errorCode: "kind.effects-mismatch",
          message: `Simulation shares output (${boughtDelta}) is less than minimum specified (${minSharesOut}).`,
        });
      }
      if (otherDelta !== 0n) {
        throw new UserFacingError({
          kind: "effects-mismatch",
          errorCode: "kind.effects-mismatch",
          message: "Simulation shows unexpected change to the opposite outcome shares.",
        });
      }
    }
  } else if (kind === "sell") {
    const collateralOut = BigInt(intent.collateral_out || intent.amount || "0");
    const maxSharesIn = BigInt(intent.max_shares_in || "0");
    const outcome = intent.outcome?.toLowerCase();

    // Source USDC must increase by exactly collateral_out
    if (summary.sourceUsdcDelta !== collateralOut) {
      throw new UserFacingError({
        kind: "effects-mismatch",
        errorCode: "kind.effects-mismatch",
        message: `Simulation shows USDC received of ${summary.sourceUsdcDelta}, but intent specified ${collateralOut}.`,
      });
    }

    // Position delta check
    const posDelta = summary.sourceSharesDeltas[0];
    if (posDelta) {
      const soldDelta = -(outcome === "yes" ? posDelta.yesDelta : posDelta.noDelta);
      if (soldDelta > maxSharesIn) {
        throw new UserFacingError({
          kind: "effects-mismatch",
          errorCode: "kind.effects-mismatch",
          message: `Simulation shares sold (${soldDelta}) exceeds maximum allowed (${maxSharesIn}).`,
        });
      }
    }
  } else if (kind === "redeem") {
    // Position goes to zero or is deleted
    const posDelta = summary.sourceSharesDeltas[0];
    if (posDelta) {
      // Must not increase shares
      if (posDelta.yesDelta > 0n || posDelta.noDelta > 0n) {
        throw new UserFacingError({
          kind: "effects-mismatch",
          errorCode: "kind.effects-mismatch",
          message: "Redemption simulation shows share increase rather than redemption.",
        });
      }
    }
  } else if (kind === "usdc-transfer") {
    const amount = BigInt(intent.amount || "0");
    const recipient = intent.to;

    if (summary.sourceUsdcDelta !== -amount) {
      throw new UserFacingError({
        kind: "effects-mismatch",
        errorCode: "kind.effects-mismatch",
        message: `USDC transfer delta (${summary.sourceUsdcDelta}) does not match amount (-${amount}).`,
      });
    }

    if (recipient) {
      const recipientDelta = summary.otherUsdcDeltas.find((d) => d.holder === recipient);
      if (recipientDelta && recipientDelta.delta !== amount) {
        throw new UserFacingError({
          kind: "effects-mismatch",
          errorCode: "kind.effects-mismatch",
          message: `Recipient USDC delta (${recipientDelta.delta}) does not match amount (${amount}).`,
        });
      }
    }
  }
}
