import { xdr } from "@stellar/stellar-sdk";

export const FINGERPRINT_ALGO = "odspec-v1";

const KNOWN_ARMS = {
  functionV0: "function",
  udtStructV0: "struct",
  udtUnionV0: "union",
  udtEnumV0: "enum",
  udtErrorEnumV0: "error",
  eventV0: "event",
};

function getArm(obj) {
  if (!obj) return "";
  if (typeof obj.arm === "function") return obj.arm();
  if (typeof obj.switch === "function") return obj.switch()?.name ?? "";
  return "";
}

/**
 * Strips doc fields from a spec entry. Throws an error on unknown entry kinds.
 * @param {xdr.ScSpecEntry} entry
 * @returns {xdr.ScSpecEntry}
 */
export function stripDoc(entry) {
  const arm = getArm(entry);
  const val = entry.value();

  switch (arm) {
    case "functionV0": {
      return xdr.ScSpecEntry.scSpecEntryFunctionV0(
        new xdr.ScSpecFunctionV0({
          doc: "",
          name: val.name(),
          inputs: val.inputs().map(
            (i) =>
              new xdr.ScSpecFunctionInputV0({
                doc: "",
                name: i.name(),
                type: i.type(),
              }),
          ),
          outputs: val.outputs(),
        }),
      );
    }
    case "udtStructV0": {
      return xdr.ScSpecEntry.scSpecEntryUdtStructV0(
        new xdr.ScSpecUdtStructV0({
          doc: "",
          lib: val.lib(),
          name: val.name(),
          fields: val.fields().map(
            (f) =>
              new xdr.ScSpecUdtStructFieldV0({
                doc: "",
                name: f.name(),
                type: f.type(),
              }),
          ),
        }),
      );
    }
    case "udtUnionV0": {
      return xdr.ScSpecEntry.scSpecEntryUdtUnionV0(
        new xdr.ScSpecUdtUnionV0({
          doc: "",
          lib: val.lib(),
          name: val.name(),
          cases: val.cases().map((c) => {
            const cArm = getArm(c);
            const cVal = c.value();
            if (cArm === "voidV0") {
              return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseVoidV0(
                new xdr.ScSpecUdtUnionCaseVoidV0({ doc: "", name: cVal.name() }),
              );
            }
            if (cArm === "tupleV0") {
              return xdr.ScSpecUdtUnionCaseV0.scSpecUdtUnionCaseTupleV0(
                new xdr.ScSpecUdtUnionCaseTupleV0({ doc: "", name: cVal.name(), type: cVal.type() }),
              );
            }
            return c;
          }),
        }),
      );
    }
    case "udtEnumV0": {
      return xdr.ScSpecEntry.scSpecEntryUdtEnumV0(
        new xdr.ScSpecUdtEnumV0({
          doc: "",
          lib: val.lib(),
          name: val.name(),
          cases: val.cases().map(
            (cs) =>
              new xdr.ScSpecUdtEnumCaseV0({
                doc: "",
                name: cs.name(),
                value: cs.value(),
              }),
          ),
        }),
      );
    }
    case "udtErrorEnumV0": {
      return xdr.ScSpecEntry.scSpecEntryUdtErrorEnumV0(
        new xdr.ScSpecUdtErrorEnumV0({
          doc: "",
          lib: val.lib(),
          name: val.name(),
          cases: val.cases().map(
            (cs) =>
              new xdr.ScSpecUdtErrorEnumCaseV0({
                doc: "",
                name: cs.name(),
                value: cs.value(),
              }),
          ),
        }),
      );
    }
    case "eventV0": {
      return xdr.ScSpecEntry.scSpecEntryEventV0(
        new xdr.ScSpecEventV0({
          doc: "",
          lib: val.lib(),
          name: val.name(),
          prefixTopics: val.prefixTopics(),
          params: val.params().map(
            (p) =>
              new xdr.ScSpecEventParamV0({
                doc: "",
                name: p.name(),
                type: p.type(),
                location: p.location(),
              }),
          ),
          dataFormat: val.dataFormat(),
        }),
      );
    }
    default:
      throw new Error(`Unknown ScSpecEntry kind: ${arm || "unrecognized"}`);
  }
}

function getEntryKindAndName(entry) {
  const arm = getArm(entry);
  const kind = KNOWN_ARMS[arm];
  if (!kind) {
    throw new Error(`Unknown ScSpecEntry kind: ${arm}`);
  }
  const val = entry.value();
  let name = "";
  if (val && typeof val.name === "function") {
    const n = val.name();
    name = typeof n === "string" ? n : n.toString();
  }
  if (!name) {
    throw new Error(`ScSpecEntry missing name for kind ${kind}`);
  }
  return { kind, name };
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes canonical fingerprints for individual spec entries.
 * @param {xdr.ScSpecEntry[]} entries
 * @returns {Promise<Array<{ kind: "function" | "struct" | "union" | "enum" | "error" | "event", name: string, sha256: string }>>}
 */
export async function canonicalEntries(entries) {
  const results = [];
  const seen = new Set();

  for (const entry of entries) {
    const stripped = stripDoc(entry);
    const { kind, name } = getEntryKindAndName(stripped);
    const key = `${kind}:${name}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate entry encountered in spec: ${key}`);
    }
    seen.add(key);

    const xdrBytes = stripped.toXDR();
    const hash = await sha256Hex(xdrBytes);
    results.push({ kind, name, sha256: hash });
  }

  // Sort by kind then name in code-point order
  results.sort((a, b) => {
    if (a.kind < b.kind) return -1;
    if (a.kind > b.kind) return 1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return results;
}

/**
 * Computes canonical odspec-v1 root fingerprint and entry fingerprints.
 * @param {xdr.ScSpecEntry[]} entries
 * @returns {Promise<{ algo: typeof FINGERPRINT_ALGO, root: string, entries: Array<{ kind: string, name: string, sha256: string }> }>}
 */
export async function specFingerprintV1(entries) {
  const sortedEntries = await canonicalEntries(entries);
  const lines = sortedEntries.map((e) => `${e.kind}:${e.name}:${e.sha256}`).join("\n");
  const root = await sha256Hex(new TextEncoder().encode(lines));
  return {
    algo: FINGERPRINT_ALGO,
    root,
    entries: sortedEntries,
  };
}
