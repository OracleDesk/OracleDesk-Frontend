#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSdkMajor } from "../lib/stellar/sdk-major.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJsonSafe(filepath) {
  if (!existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf8"));
  } catch (err) {
    console.warn(`Failed to parse JSON at ${filepath}:`, err);
    return null;
  }
}

const packageLock = readJsonSafe(join(ROOT, "package-lock.json"));
if (!packageLock) {
  console.error("package-lock.json not found in repository root.");
  process.exit(1);
}

const bindingsPackage = readJsonSafe(join(ROOT, "lib", "stellar", "generated", "bindings-package.json"));
const kitPackage = readJsonSafe(join(ROOT, "node_modules", "@creit.tech", "stellar-wallets-kit", "package.json"));

const result = validateSdkMajor({ packageLock, bindingsPackage, kitPackage });

if (!result.ok) {
  console.error("❌ SDK Major Version & Deduplication Guard Failed:\n");
  for (const err of result.errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
} else {
  console.log(
    `✅ Verified single @stellar/stellar-sdk installation and major alignment (major: ${result.appSdkMajor}, installed: ${result.installedSdkVersions.join(", ")}).`,
  );
  process.exit(0);
}
