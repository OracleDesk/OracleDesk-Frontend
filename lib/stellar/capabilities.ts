import { xdr } from "@stellar/stellar-sdk";
import { getSpecEntryName } from "./contract-check";
import { marketCore } from "./clients";

export type TypeSig =
  | { k: "prim"; name: string }
  | { k: "bytesN"; n: number }
  | { k: "vec" | "option"; of: TypeSig }
  | { k: "map"; key: TypeSig; val: TypeSig }
  | { k: "result"; ok: TypeSig; err: TypeSig }
  | { k: "tuple"; of: TypeSig[] }
  | { k: "udt"; name: string };

export interface FnSig {
  name: string;
  inputs: { name: string; type: TypeSig }[];
  outputs: TypeSig[];
}

export interface StructSig {
  name: string;
  fields: { name: string; type: TypeSig }[];
}

export interface UnionCaseSig {
  name: string;
  types: TypeSig[] | null;
}

export interface UnionSig {
  name: string;
  cases: UnionCaseSig[];
}

export interface EnumSig {
  name: string;
  cases: { name: string; value: number }[];
}

export interface ErrorEnumSig {
  name: string;
  cases: { name: string; value: number }[];
}

export interface SpecIndex {
  fns: Map<string, FnSig>;
  structs: Map<string, StructSig>;
  unions: Map<string, UnionSig>;
  enums: Map<string, EnumSig>;
  errorEnums: Map<string, ErrorEnumSig>;
}

export type Compat = { ok: true } | { ok: false; reason: string };

/**
 * Whether the deployed market-core exposes a function. The generated bindings
 * only carry the methods of the pinned contract spec, so a method missing here
 * means the deployment predates it and the UI must not offer the action.
 */
export function marketCoreSupports(fn: "claim_lp_fees" | "transfer_lp"): boolean;
/** True when the deployed spec exposes every named market-core function. */
export function marketCoreSupports(entries: readonly xdr.ScSpecEntry[], fnNames: readonly string[]): boolean;
export function marketCoreSupports(
  fnOrEntries: "claim_lp_fees" | "transfer_lp" | readonly xdr.ScSpecEntry[],
  fnNames?: readonly string[],
): boolean {
  if (typeof fnOrEntries === "string") {
    try {
      return typeof (marketCore() as unknown as Record<string, unknown>)[fnOrEntries] === "function";
    } catch {
      return false;
    }
  }
  const index = indexSpec(fnOrEntries);
  return (fnNames ?? []).every((name) => index.fns.has(name));
}

function armOf(obj: unknown): string {
  if (!obj) return "";
  const o = obj as { arm?: () => string; switch?: () => { name?: string } };
  if (typeof o.arm === "function") return o.arm();
  if (typeof o.switch === "function") return o.switch()?.name ?? "";
  return "";
}

/** Converts an XDR ScSpecTypeDef into a structural TypeSig (doc-free, order-stable). */
export function toTypeSig(t: xdr.ScSpecTypeDef): TypeSig {
  const sw = (t as unknown as { switch?: () => { name?: string } }).switch?.()?.name ?? armOf(t);
  switch (sw) {
    case "scSpecTypeBytesN":
    case "bytesN": {
      const val = t.bytesN();
      return { k: "bytesN", n: val.n() };
    }
    case "scSpecTypeVec":
    case "vec": {
      return { k: "vec", of: toTypeSig(t.vec().elementType()) };
    }
    case "scSpecTypeOption":
    case "option": {
      return { k: "option", of: toTypeSig(t.option().valueType()) };
    }
    case "scSpecTypeMap":
    case "map": {
      const m = t.map();
      return { k: "map", key: toTypeSig(m.keyType()), val: toTypeSig(m.valueType()) };
    }
    case "scSpecTypeResult":
    case "result": {
      const r = t.result();
      return { k: "result", ok: toTypeSig(r.okType()), err: toTypeSig(r.errorType()) };
    }
    case "scSpecTypeTuple":
    case "tuple": {
      return { k: "tuple", of: t.tuple().valueTypes().map(toTypeSig) };
    }
    case "scSpecTypeUdt":
    case "udt": {
      return { k: "udt", name: t.udt().name().toString() };
    }
    default: {
      return { k: "prim", name: sw.replace(/^scSpecType/, "").toLowerCase() };
    }
  }
}

/** Formats a TypeSig concisely for mismatch diagnostics. */
export function formatTypeSig(t: TypeSig): string {
  switch (t.k) {
    case "prim":
      return t.name;
    case "bytesN":
      return `bytesN<${t.n}>`;
    case "vec":
      return `vec<${formatTypeSig(t.of)}>`;
    case "option":
      return `option<${formatTypeSig(t.of)}>`;
    case "map":
      return `map<${formatTypeSig(t.key)}, ${formatTypeSig(t.val)}>`;
    case "result":
      return `result<${formatTypeSig(t.ok)}, ${formatTypeSig(t.err)}>`;
    case "tuple":
      return `(${t.of.map(formatTypeSig).join(", ")})`;
    case "udt":
      return t.name;
  }
}

/** Indexes all functions and UDTs in a contract spec by name, ignoring doc strings and order. */
export function indexSpec(entries: readonly xdr.ScSpecEntry[]): SpecIndex {
  const index: SpecIndex = {
    fns: new Map(),
    structs: new Map(),
    unions: new Map(),
    enums: new Map(),
    errorEnums: new Map(),
  };

  for (const entry of entries) {
    const arm = armOf(entry);
    const val = entry.value();
    const name = getSpecEntryName(entry);

    switch (arm) {
      case "functionV0": {
        const fn = val as xdr.ScSpecFunctionV0;
        index.fns.set(name, {
          name,
          inputs: fn.inputs().map((i) => ({
            name: i.name().toString(),
            type: toTypeSig(i.type()),
          })),
          outputs: fn.outputs().map(toTypeSig),
        });
        break;
      }
      case "udtStructV0": {
        const st = val as xdr.ScSpecUdtStructV0;
        index.structs.set(name, {
          name,
          fields: st.fields().map((f) => ({
            name: f.name().toString(),
            type: toTypeSig(f.type()),
          })),
        });
        break;
      }
      case "udtUnionV0": {
        const un = val as xdr.ScSpecUdtUnionV0;
        index.unions.set(name, {
          name,
          cases: un.cases().map((c) => {
            const cArm = armOf(c);
            const cVal = c.value();
            if (cArm === "tupleV0") {
              const t = cVal as xdr.ScSpecUdtUnionCaseTupleV0;
              return { name: t.name().toString(), types: t.type().map(toTypeSig) };
            }
            const v = cVal as xdr.ScSpecUdtUnionCaseVoidV0;
            return { name: v.name().toString(), types: null };
          }),
        });
        break;
      }
      case "udtEnumV0": {
        const en = val as xdr.ScSpecUdtEnumV0;
        index.enums.set(name, {
          name,
          cases: en.cases().map((cs) => ({
            name: cs.name().toString(),
            value: cs.value(),
          })),
        });
        break;
      }
      case "udtErrorEnumV0": {
        const err = val as xdr.ScSpecUdtErrorEnumV0;
        index.errorEnums.set(name, {
          name,
          cases: err.cases().map((cs) => ({
            name: cs.name().toString(),
            value: cs.value(),
          })),
        });
        break;
      }
    }
  }

  return index;
}

function typeEqual(
  a: TypeSig,
  b: TypeSig,
  onChain: SpecIndex,
  bundled: SpecIndex,
  visited: Set<string>,
  mappedErrors?: ReadonlyMap<number, string>,
): Compat {
  if (a.k !== b.k) {
    return { ok: false, reason: `${formatTypeSig(b)} → ${formatTypeSig(a)}` };
  }
  switch (a.k) {
    case "prim":
      return a.name === (b as { k: "prim"; name: string }).name
        ? { ok: true }
        : { ok: false, reason: `${(b as { k: "prim"; name: string }).name} → ${a.name}` };
    case "bytesN": {
      const bn = (b as { k: "bytesN"; n: number }).n;
      return a.n === bn ? { ok: true } : { ok: false, reason: `bytesN<${bn}> → bytesN<${a.n}>` };
    }
    case "vec":
    case "option":
      return typeEqual(a.of, (b as { of: TypeSig }).of, onChain, bundled, visited, mappedErrors);
    case "map": {
      const bm = b as { k: "map"; key: TypeSig; val: TypeSig };
      const kRes = typeEqual(a.key, bm.key, onChain, bundled, visited, mappedErrors);
      if (!kRes.ok) return kRes;
      return typeEqual(a.val, bm.val, onChain, bundled, visited, mappedErrors);
    }
    case "result": {
      const br = b as { k: "result"; ok: TypeSig; err: TypeSig };
      const okRes = typeEqual(a.ok, br.ok, onChain, bundled, visited, mappedErrors);
      if (!okRes.ok) return okRes;
      return typeEqual(a.err, br.err, onChain, bundled, visited, mappedErrors);
    }
    case "tuple": {
      const bt = (b as { k: "tuple"; of: TypeSig[] }).of;
      if (a.of.length !== bt.length) {
        return { ok: false, reason: `tuple arity ${bt.length} → ${a.of.length}` };
      }
      for (let i = 0; i < a.of.length; i++) {
        const res = typeEqual(a.of[i], bt[i], onChain, bundled, visited, mappedErrors);
        if (!res.ok) return res;
      }
      return { ok: true };
    }
    case "udt": {
      const bName = (b as { k: "udt"; name: string }).name;
      if (a.name !== bName) {
        return { ok: false, reason: `UDT ${bName} → ${a.name}` };
      }
      return udtCompatible(a.name, onChain, bundled, visited, mappedErrors);
    }
  }
}

/** Compares a UDT recursively across on-chain and bundled SpecIndexes. */
export function udtCompatible(
  name: string,
  onChain: SpecIndex,
  bundled: SpecIndex,
  visited = new Set<string>(),
  mappedErrors?: ReadonlyMap<number, string>,
): Compat {
  if (visited.has(name)) return { ok: true };
  visited.add(name);

  const bStruct = bundled.structs.get(name);
  const oStruct = onChain.structs.get(name);
  if (bStruct || oStruct) {
    if (!bStruct || !oStruct) return { ok: false, reason: `struct ${name} missing` };
    if (bStruct.fields.length !== oStruct.fields.length) {
      return { ok: false, reason: `struct ${name} field count changed (${bStruct.fields.length} → ${oStruct.fields.length})` };
    }
    for (let i = 0; i < bStruct.fields.length; i++) {
      const bf = bStruct.fields[i];
      const of_ = oStruct.fields[i];
      if (bf.name !== of_.name) {
        return { ok: false, reason: `\`${name}.${bf.name}\` renamed/reordered to \`${of_.name}\`` };
      }
      const fRes = typeEqual(of_.type, bf.type, onChain, bundled, visited, mappedErrors);
      if (!fRes.ok) {
        return { ok: false, reason: `\`${name}.${bf.name}\` changed ${fRes.reason}` };
      }
    }
    return { ok: true };
  }

  // UnionV0: case order does NOT matter (encoded by name)
  const bUnion = bundled.unions.get(name);
  const oUnion = onChain.unions.get(name);
  if (bUnion || oUnion) {
    if (!bUnion || !oUnion) return { ok: false, reason: `union ${name} missing` };
    if (bUnion.cases.length !== oUnion.cases.length) {
      return { ok: false, reason: `union ${name} case count changed (${bUnion.cases.length} → ${oUnion.cases.length})` };
    }
    const oMap = new Map(oUnion.cases.map((c) => [c.name, c]));
    for (const bc of bUnion.cases) {
      const oc = oMap.get(bc.name);
      if (!oc) return { ok: false, reason: `union \`${name}.${bc.name}\` missing on-chain` };
      if ((bc.types === null) !== (oc.types === null)) {
        return { ok: false, reason: `union \`${name}.${bc.name}\` payload changed` };
      }
      if (bc.types && oc.types) {
        if (bc.types.length !== oc.types.length) {
          return { ok: false, reason: `union \`${name}.${bc.name}\` arity changed` };
        }
        for (let i = 0; i < bc.types.length; i++) {
          const cRes = typeEqual(oc.types[i], bc.types[i], onChain, bundled, visited, mappedErrors);
          if (!cRes.ok) {
            return { ok: false, reason: `union \`${name}.${bc.name}\` ${cRes.reason}` };
          }
        }
      }
    }
    return { ok: true };
  }

  // EnumV0: case order AND values matter
  const bEnum = bundled.enums.get(name);
  const oEnum = onChain.enums.get(name);
  if (bEnum || oEnum) {
    if (!bEnum || !oEnum) return { ok: false, reason: `enum ${name} missing` };
    if (bEnum.cases.length !== oEnum.cases.length) {
      return { ok: false, reason: `enum ${name} case count changed (${bEnum.cases.length} → ${oEnum.cases.length})` };
    }
    for (let i = 0; i < bEnum.cases.length; i++) {
      const bc = bEnum.cases[i];
      const oc = oEnum.cases[i];
      if (bc.name !== oc.name || bc.value !== oc.value) {
        return { ok: false, reason: `enum \`${name}\` case ${bc.name}=${bc.value} → ${oc.name}=${oc.value}` };
      }
    }
    return { ok: true };
  }

  // ErrorEnumV0: superset-compatible (may add codes, must not renumber/remove mapped codes)
  const bErr = bundled.errorEnums.get(name);
  const oErr = onChain.errorEnums.get(name);
  if (bErr || oErr) {
    if (!bErr || !oErr) return { ok: false, reason: `error enum ${name} missing` };
    const oByCode = new Map(oErr.cases.map((c) => [c.value, c.name]));
    for (const bc of bErr.cases) {
      if (mappedErrors && !mappedErrors.has(bc.value)) continue;
      const onName = oByCode.get(bc.value);
      if (!onName || onName !== bc.name) {
        return { ok: false, reason: `error enum \`${name}\` #${bc.value} (${bc.name}) changed/removed` };
      }
    }
    return { ok: true };
  }

  return { ok: false, reason: `UDT \`${name}\` not found` };
}

/** Checks structural compatibility of a required function signature against an on-chain SpecIndex. */
export function fnCompatible(
  required: FnSig,
  onChain: SpecIndex,
  bundled: SpecIndex,
  mappedErrors?: ReadonlyMap<number, string>,
): Compat {
  const actual = onChain.fns.get(required.name);
  if (!actual) {
    return { ok: false, reason: `function \`${required.name}\` missing on-chain` };
  }

  if (actual.inputs.length !== required.inputs.length) {
    const extra = actual.inputs.slice(required.inputs.length).map((i) => i.name).join(", ");
    const missing = required.inputs.slice(actual.inputs.length).map((i) => i.name).join(", ");
    const detail = extra ? `unexpected arg \`${extra}\`` : `missing arg \`${missing}\``;
    return { ok: false, reason: `\`${required.name}\` arg count mismatch (${detail})` };
  }

  const visited = new Set<string>();
  for (let i = 0; i < required.inputs.length; i++) {
    const reqIn = required.inputs[i];
    const actIn = actual.inputs[i];
    if (reqIn.name !== actIn.name) {
      return { ok: false, reason: `\`${required.name}\` arg \`${reqIn.name}\` → \`${actIn.name}\`` };
    }
    const tRes = typeEqual(actIn.type, reqIn.type, onChain, bundled, visited, mappedErrors);
    if (!tRes.ok) {
      return { ok: false, reason: `\`${required.name}\` arg \`${reqIn.name}\` ${tRes.reason}` };
    }
  }

  if (actual.outputs.length !== required.outputs.length) {
    return { ok: false, reason: `\`${required.name}\` output arity mismatch` };
  }
  for (let i = 0; i < required.outputs.length; i++) {
    const oRes = typeEqual(actual.outputs[i], required.outputs[i], onChain, bundled, visited, mappedErrors);
    if (!oRes.ok) {
      return { ok: false, reason: `\`${required.name}\` output ${oRes.reason}` };
    }
  }

  // Also check any error enums in the contract if mappedErrors is provided
  if (mappedErrors) {
    for (const errName of bundled.errorEnums.keys()) {
      const errRes = udtCompatible(errName, onChain, bundled, visited, mappedErrors);
      if (!errRes.ok) return errRes;
    }
  }

  return { ok: true };
}
