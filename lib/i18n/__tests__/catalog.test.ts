import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import enXA from "../messages/en-XA.json";
import { collectParams, compareCatalogs, findUnusedKeys, flatten, parseMessage, pseudoLocalize, renderParamTypes } from "../../../scripts/lib/i18n-catalog.mjs";

const flat = flatten(en) as Record<string, string>;

describe("en.json", () => {
  it("parses as ICU MessageFormat", () => {
    for (const [key, message] of Object.entries(flat)) expect(() => parseMessage(key, message), key).not.toThrow();
  });

  it("generated param types are up to date", () => {
    const file = readFileSync(join(__dirname, "../message-params.generated.ts"), "utf8");
    expect(file).toBe(renderParamTypes(flat));
  });
});

describe("pseudo-locale", () => {
  it("has the same keys and arguments as en.json", () => {
    expect(compareCatalogs("en-XA", flat, enXA)).toEqual([]);
  });

  it("is longer and keeps ICU arguments intact", () => {
    const pseudo = flatten(enXA) as Record<string, string>;
    expect(pseudo["wallet.switchNetwork"]).toContain("{network}");
    expect(pseudo["wallet.switchNetwork"].length).toBeGreaterThan(flat["wallet.switchNetwork"].length * 1.25);
    expect(pseudoLocalize("k", "Hello {name}")).toMatch(/^\[Ĥéļļö \{name\}~+\]$/);
  });

  it("every catalog file passes the checker", () => {
    const dir = join(__dirname, "../messages");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
      const catalog = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(compareCatalogs(file, flat, catalog)).toEqual([]);
    }
  });
});

describe("compareCatalogs", () => {
  const base = { a: "Hello {name}", b: { c: "{n, plural, one {# item} other {# items}}" } };
  const baseFlat = flatten(base);

  it("reports missing, unknown and mismatched keys", () => {
    const problems = compareCatalogs("xx", baseFlat, { a: "Hola", z: "x" });
    expect(problems).toContain('xx: missing key "b.c"');
    expect(problems).toContain('xx: unknown key "z" (not in en.json)');
    expect(problems.some((p) => p.includes('"a" uses arguments {}'))).toBe(true);
  });

  it("allows a missing key only under the fallback marker", () => {
    expect(compareCatalogs("xx", baseFlat, { a: "Hola {name}", $fallback: ["b.c"] })).toEqual([]);
  });

  it("rejects invalid ICU", () => {
    const problems = compareCatalogs("xx", baseFlat, { a: "Hola {name", b: { c: "{n, plural, one {# item} other {# items}}" } });
    expect(problems.some((p) => p.includes("Invalid ICU"))).toBe(true);
  });
});

describe("collectParams and unused keys", () => {
  it("infers argument kinds", () => {
    const params = collectParams(parseMessage("k", "{count, plural, one {# {thing}} other {# things}} {side, select, Yes {YES} other {}}"));
    expect(Object.fromEntries(params)).toEqual({ count: "number", thing: "string", side: "select" });
  });

  it("finds keys no source references, except dynamic namespaces", () => {
    const unused = findUnusedKeys(["a.b", "a.c", "errors.kind.x"], 't("a.b") foo', ["errors."]);
    expect(unused).toEqual(["a.c"]);
  });
});
