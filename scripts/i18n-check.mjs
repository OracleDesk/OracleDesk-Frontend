#!/usr/bin/env node
// Validates the message catalogs. Usage:
//   node scripts/i18n-check.mjs            check (CI)
//   node scripts/i18n-check.mjs --write    also regenerate lib/i18n/message-params.generated.ts
//   node scripts/i18n-check.mjs --pseudo   regenerate lib/i18n/messages/en-XA.json
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compareCatalogs, findUnusedKeys, flatten, mapCatalog, parseMessage, pseudoLocalize, renderParamTypes } from "./lib/i18n-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");
const paramsFile = join(root, "lib/i18n/message-params.generated.ts");
const args = new Set(process.argv.slice(2));

/** Namespaces resolved by computed key (error codes), so a literal t("...") scan cannot see them. */
const DYNAMIC_PREFIXES = ["errors."];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const en = readJson(join(messagesDir, "en.json"));
const englishFlat = flatten(en);

if (args.has("--pseudo")) {
  const pseudo = mapCatalog(en, (key, message) => pseudoLocalize(key, message));
  writeFileSync(join(messagesDir, "en-XA.json"), `${JSON.stringify(pseudo, null, 2)}\n`);
  console.log(`i18n: wrote lib/i18n/messages/en-XA.json (${Object.keys(englishFlat).length} messages)`);
}

const problems = [];

for (const [key, message] of Object.entries(englishFlat)) {
  try {
    parseMessage(key, message);
  } catch (error) {
    problems.push(`en: ${error.message}`);
  }
}

for (const file of readdirSync(messagesDir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  problems.push(...compareCatalogs(file.replace(/\.json$/, ""), englishFlat, readJson(join(messagesDir, file))));
}

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__", "generated"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(tsx?|mjs)$/.test(name) && !/\.(test|generated)\./.test(name)) out.push(path);
  }
  return out;
}

const sources = ["app", "components", "lib"]
  .flatMap((dir) => sourceFiles(join(root, dir)))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
for (const key of findUnusedKeys(Object.keys(englishFlat), sources, DYNAMIC_PREFIXES)) {
  problems.push(`en: unused key "${key}" (no t("${key}") in app/, components/ or lib/)`);
}

const expectedParams = renderParamTypes(englishFlat);
if (args.has("--write")) {
  writeFileSync(paramsFile, expectedParams);
  console.log(`i18n: wrote ${relative(root, paramsFile)}`);
} else if (!existsSync(paramsFile) || readFileSync(paramsFile, "utf8") !== expectedParams) {
  problems.push(`lib/i18n/message-params.generated.ts is stale. Run: node scripts/i18n-check.mjs --write`);
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`i18n check passed: ${Object.keys(englishFlat).length} messages, ${readdirSync(messagesDir).filter((f) => f.endsWith(".json")).length} catalogs.`);
