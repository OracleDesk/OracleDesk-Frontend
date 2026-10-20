import { xdr } from "@stellar/stellar-sdk";

/**
 * Extracts raw base64 spec strings from generated TypeScript source code using bracket matching,
 * then decodes each into an xdr.ScSpecEntry.
 */
export function readSpecEntries(tsSource) {
  const match = tsSource.match(/new\s+ContractSpec\s*\(\s*\[/);
  if (!match) return [];

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let endIdx = startIdx;
  let inString = false;
  let quoteChar = "";
  let escape = false;

  for (let i = startIdx; i < tsSource.length; i++) {
    const ch = tsSource[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === quoteChar) {
        inString = false;
      }
    } else {
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        quoteChar = ch;
      } else if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  const arrayBody = tsSource.slice(startIdx, endIdx);
  const strRegex = /["']([A-Za-z0-9+/=]+)["']/g;
  const entries = [];
  let m;
  while ((m = strRegex.exec(arrayBody)) !== null) {
    const b64 = m[1].trim();
    if (b64.length > 0) {
      entries.push(xdr.ScSpecEntry.fromXDR(b64, "base64"));
    }
  }

  return entries;
}

/**
 * Converts any ScSpecTypeDef into a clean string representation.
 */
export function typeToString(typeDef) {
  if (!typeDef) return "void";
  const sw = typeDef.switch ? typeDef.switch().name : typeDef.arm();

  switch (sw) {
    case "scSpecTypeVal":
      return "val";
    case "scSpecTypeBool":
      return "bool";
    case "scSpecTypeVoid":
      return "void";
    case "scSpecTypeError":
      return "Error";
    case "scSpecTypeU32":
      return "u32";
    case "scSpecTypeI32":
      return "i32";
    case "scSpecTypeU64":
      return "u64";
    case "scSpecTypeI64":
      return "i64";
    case "scSpecTypeTimepoint":
      return "Timepoint";
    case "scSpecTypeDuration":
      return "Duration";
    case "scSpecTypeU128":
      return "u128";
    case "scSpecTypeI128":
      return "i128";
    case "scSpecTypeU256":
      return "u256";
    case "scSpecTypeI256":
      return "i256";
    case "scSpecTypeBytes":
      return "bytes";
    case "scSpecTypeString":
      return "string";
    case "scSpecTypeSymbol":
      return "symbol";
    case "scSpecTypeAddress":
      return "Address";
    case "scSpecTypeMuxedAddress":
      return "MuxedAddress";
    case "scSpecTypeOption": {
      const opt = typeDef.option();
      return `Option<${typeToString(opt.valueType())}>`;
    }
    case "scSpecTypeResult": {
      const res = typeDef.result();
      return `Result<${typeToString(res.okType())}, ${typeToString(res.errorType())}>`;
    }
    case "scSpecTypeVec": {
      const v = typeDef.vec();
      return `Vec<${typeToString(v.elementType())}>`;
    }
    case "scSpecTypeMap": {
      const m = typeDef.map();
      return `Map<${typeToString(m.keyType())}, ${typeToString(m.valueType())}>`;
    }
    case "scSpecTypeTuple": {
      const tup = typeDef.tuple();
      return `(${tup.valueTypes().map(typeToString).join(", ")})`;
    }
    case "bytesN":
    case "scSpecTypeBytesN": {
      const b = typeDef.bytesN();
      return `BytesN<${b.n()}>`;
    }
    case "udt":
    case "scSpecTypeUdt": {
      const u = typeDef.udt();
      return u.name().toString();
    }
    default:
      return String(sw);
  }
}

/**
 * Normalizes ScSpecEntry items into indexed collections for deterministic diffing.
 */
export function normalize(entries) {
  const functions = new Map();
  const types = new Map();
  const errors = new Map();
  const events = new Map();

  for (const entry of entries) {
    const arm = entry.arm();
    const val = entry.value();

    switch (arm) {
      case "functionV0": {
        const fn = val;
        const name = fn.name().toString();
        functions.set(name, {
          name,
          doc: fn.doc().toString(),
          inputs: fn.inputs().map((i) => ({
            name: i.name().toString(),
            type: typeToString(i.type()),
            doc: i.doc().toString(),
          })),
          outputs: fn.outputs().map(typeToString),
        });
        break;
      }
      case "udtStructV0": {
        const st = val;
        const name = st.name().toString();
        types.set(name, {
          kind: "struct",
          name,
          doc: st.doc().toString(),
          members: st.fields().map((f) => `${f.name().toString()}: ${typeToString(f.type())}`),
        });
        break;
      }
      case "udtUnionV0": {
        const un = val;
        const name = un.name().toString();
        types.set(name, {
          kind: "union",
          name,
          doc: un.doc().toString(),
          members: un.cases().map((c) => {
            const cArm = c.arm();
            const cVal = c.value();
            if (cArm === "voidV0") {
              return cVal.name().toString();
            }
            if (cArm === "tupleV0") {
              const typesStr = cVal.type().map(typeToString).join(", ");
              return `${cVal.name().toString()}(${typesStr})`;
            }
            return cArm;
          }),
        });
        break;
      }
      case "udtEnumV0": {
        const en = val;
        const name = en.name().toString();
        types.set(name, {
          kind: "enum",
          name,
          doc: en.doc().toString(),
          members: en.cases().map((cs) => `${cs.name().toString()} = ${cs.value()}`),
        });
        break;
      }
      case "udtErrorEnumV0": {
        const err = val;
        const enumName = err.name().toString();
        const codeMap = new Map();
        for (const cs of err.cases()) {
          codeMap.set(cs.value(), cs.name().toString());
        }
        errors.set(enumName, codeMap);
        break;
      }
      case "eventV0": {
        const ev = val;
        const name = ev.name().toString();
        events.set(name, {
          name,
          doc: ev.doc().toString(),
          prefixTopics: ev.prefixTopics().map((t) => t.toString()),
          params: ev.params().map((p) => ({
            name: p.name().toString(),
            type: typeToString(p.type()),
            location: p.location().name.includes("Topic") ? "topic" : "data",
          })),
        });
        break;
      }
      default:
        break;
    }
  }

  return { functions, types, errors, events };
}
