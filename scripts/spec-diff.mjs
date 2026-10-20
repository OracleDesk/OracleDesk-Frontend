#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_BINDINGS } from "./lib/files.mjs";
import { normalize, readSpecEntries } from "./lib/spec.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Parse arguments
const args = process.argv.slice(2);
let baseRef = "origin/develop";
let summaryFile = process.env.GITHUB_STEP_SUMMARY || null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base" && args[i + 1]) {
    baseRef = args[++i];
  } else if (args[i] === "--summary" && args[i + 1]) {
    summaryFile = args[++i];
  }
}

// Read FRIENDLY and UNFRIENDLY_ALLOWLIST from lib/stellar/errors.ts
function loadErrorAllowlist() {
  const errorsPath = join(ROOT, "lib", "stellar", "errors.ts");
  if (!existsSync(errorsPath)) return { allowed: new Set(), friendly: new Set() };
  const content = readFileSync(errorsPath, "utf8");

  const friendlyNames = new Set();
  const allowlist = new Set();

  const friendlyMatch = content.match(/export const FRIENDLY:\s*Record<string,\s*string>\s*=\s*{([\s\S]*?)};/);
  if (friendlyMatch) {
    const lines = friendlyMatch[1].split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z0-9_]+):/);
      if (m && m[1]) friendlyNames.add(m[1]);
    }
  }

  const allowMatch = content.match(/export const UNFRIENDLY_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/);
  if (allowMatch) {
    const matches = allowMatch[1].matchAll(/["']([A-Za-z0-9_]+)["']/g);
    for (const m of matches) {
      allowlist.add(m[1]);
    }
  }

  const allowed = new Set([...friendlyNames, ...allowlist]);
  return { allowed, friendly: friendlyNames, allowlist };
}

// Get file contents from git base ref
function getGitFile(ref, relativePath) {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    // If ref not found, try fallback HEAD~1
    if (ref !== "HEAD~1") {
      try {
        return execFileSync("git", ["show", `HEAD~1:${relativePath}`], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Compute diff between old and new normalized specs
export function diffSpecs(contract, oldNorm, newNorm) {
  const changes = [];

  // 1. Functions
  const allFnNames = new Set([...oldNorm.functions.keys(), ...newNorm.functions.keys()]);
  for (const fnName of [...allFnNames].sort()) {
    const oldFn = oldNorm.functions.get(fnName);
    const newFn = newNorm.functions.get(fnName);

    if (!oldFn && newFn) {
      changes.push({ kind: "fn-added", contract, fn: fnName });
    } else if (oldFn && !newFn) {
      changes.push({ kind: "fn-removed", contract, fn: fnName });
    } else if (oldFn && newFn) {
      const oldInputs = oldFn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ");
      const newInputs = newFn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ");
      const oldOutputs = oldFn.outputs.join(", ");
      const newOutputs = newFn.outputs.join(", ");

      const oldSig = `(${oldInputs}) -> ${oldOutputs || "void"}`;
      const newSig = `(${newInputs}) -> ${newOutputs || "void"}`;

      if (oldSig !== newSig) {
        changes.push({
          kind: "fn-signature",
          contract,
          fn: fnName,
          before: oldSig,
          after: newSig,
        });
      } else if (oldFn.doc !== newFn.doc) {
        changes.push({
          kind: "fn-doc",
          contract,
          fn: fnName,
        });
      }
    }
  }

  // 2. Types
  const allTypeNames = new Set([...oldNorm.types.keys(), ...newNorm.types.keys()]);
  for (const typeName of [...allTypeNames].sort()) {
    const oldT = oldNorm.types.get(typeName);
    const newT = newNorm.types.get(typeName);

    if (!oldT && newT) {
      changes.push({ kind: "type-added", contract, type: typeName, kindType: newT.kind });
    } else if (oldT && !newT) {
      changes.push({ kind: "type-removed", contract, type: typeName });
    } else if (oldT && newT) {
      const oldMembers = (oldT.members || []).join("; ");
      const newMembers = (newT.members || []).join("; ");
      if (oldMembers !== newMembers) {
        changes.push({
          kind: "type-changed",
          contract,
          type: typeName,
          before: oldT.members,
          after: newT.members,
        });
      }
    }
  }

  // 3. Errors
  const allEnumNames = new Set([...oldNorm.errors.keys(), ...newNorm.errors.keys()]);
  for (const enumName of [...allEnumNames].sort()) {
    const oldCodeMap = oldNorm.errors.get(enumName) || new Map();
    const newCodeMap = newNorm.errors.get(enumName) || new Map();

    const oldNameMap = new Map([...oldCodeMap.entries()].map(([code, name]) => [name, code]));
    const newNameMap = new Map([...newCodeMap.entries()].map(([code, name]) => [name, code]));

    // Check for renumbered errors
    for (const [name, newCode] of newNameMap) {
      const oldCode = oldNameMap.get(name);
      if (oldCode !== undefined && oldCode !== newCode) {
        changes.push({
          kind: "error-renumbered",
          contract,
          name,
          from: oldCode,
          to: newCode,
        });
      }
    }

    // Check added errors
    for (const [code, name] of newCodeMap) {
      if (!oldCodeMap.has(code) && !oldNameMap.has(name)) {
        changes.push({
          kind: "error-added",
          contract,
          code,
          name,
        });
      }
    }

    // Check removed errors
    for (const [code, name] of oldCodeMap) {
      if (!newCodeMap.has(code) && !newNameMap.has(name)) {
        changes.push({
          kind: "error-removed",
          contract,
          code,
          name,
        });
      }
    }
  }

  // 4. Events
  const allEvents = new Set([...oldNorm.events.keys(), ...newNorm.events.keys()]);
  for (const eventName of [...allEvents].sort()) {
    const oldEv = oldNorm.events.get(eventName);
    const newEv = newNorm.events.get(eventName);

    if (!oldEv && newEv) {
      changes.push({ kind: "event-added", contract, event: eventName });
    } else if (oldEv && !newEv) {
      changes.push({ kind: "event-removed", contract, event: eventName });
    } else if (oldEv && newEv) {
      const oldDesc = `${oldEv.prefixTopics.join(",")} | ${oldEv.params.map((p) => `${p.name}:${p.type}@${p.location}`).join(",")}`;
      const newDesc = `${newEv.prefixTopics.join(",")} | ${newEv.params.map((p) => `${p.name}:${p.type}@${p.location}`).join(",")}`;
      if (oldDesc !== newDesc) {
        changes.push({
          kind: "event-changed",
          contract,
          event: eventName,
          before: oldDesc,
          after: newDesc,
          requiresIndexerReview: eventName === "Trade" || eventName === "TracePublished",
        });
      }
    }
  }

  return changes;
}

// Find references in frontend source files to removed/changed methods
export function scanReferences(affectedFns) {
  if (affectedFns.length === 0) return [];
  const hits = [];

  const searchDirs = ["lib", "app", "components", "e2e"];
  const targetExts = new Set([".ts", ".tsx"]);

  function walk(dir) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Exclude generated bindings and node_modules
        if (full.includes("lib/stellar/generated") || full.includes("node_modules")) continue;
        walk(full);
      } else if (targetExts.has(entry.slice(entry.lastIndexOf(".")))) {
        checkFile(full);
      }
    }
  }

  function checkFile(filepath) {
    const lines = readFileSync(filepath, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : "";

      for (const { contract, fn, factory } of affectedFns) {
        const fnPattern = `.${fn}(`;
        if (line.includes(fnPattern)) {
          // Check if scoped to contract factory on same or previous line
          const context = `${prevLine} ${line}`;
          if (!factory || context.includes(factory)) {
            hits.push({
              file: relative(ROOT, filepath),
              line: i + 1,
              contract,
              fn,
              snippet: line.trim(),
            });
          }
        }
      }
    }
  }

  for (const d of searchDirs) {
    walk(join(ROOT, d));
  }

  return hits;
}

// Main execution function
export async function runDiff(base = baseRef) {
  const { allowed } = loadErrorAllowlist();
  const allChanges = [];
  const uncoveredErrors = [];
  const affectedFunctions = [];

  for (const item of CONTRACT_BINDINGS) {
    const relDest = join("lib", "stellar", "generated", item.file).replace(/\\/g, "/");
    const localPath = join(ROOT, relDest);
    if (!existsSync(localPath)) continue;

    const newContent = readFileSync(localPath, "utf8");
    const oldContent = getGitFile(base, relDest) || "";

    const newEntries = readSpecEntries(newContent);
    const oldEntries = oldContent ? readSpecEntries(oldContent) : [];

    const newNorm = normalize(newEntries);
    const oldNorm = normalize(oldEntries);

    // Check error coverage in FRIENDLY
    for (const [, codeMap] of newNorm.errors) {
      for (const [code, name] of codeMap) {
        if (!allowed.has(name)) {
          uncoveredErrors.push({ contract: item.contract, code, name });
        }
      }
    }

    const changes = diffSpecs(item.contract, oldNorm, newNorm);
    allChanges.push(...changes);

    for (const c of changes) {
      if (c.kind === "fn-removed" || c.kind === "fn-signature") {
        affectedFunctions.push({ contract: item.contract, fn: c.fn, factory: item.factory });
      }
    }
  }

  // Scan references to removed or modified functions
  const referenceHits = scanReferences(affectedFunctions);

  // Check renumbered errors
  const renumbered = allChanges.filter((c) => c.kind === "error-renumbered");

  // Determine pass/fail
  const failed = referenceHits.length > 0 || uncoveredErrors.length > 0 || renumbered.length > 0;

  // Build Markdown report
  let report = `## Contract Interface Spec Diff Report\n\n`;
  report += `Comparing local generated bindings against \`${base}\`:\n\n`;

  if (allChanges.length === 0) {
    report += `> No contract interface changes detected across bindings.\n\n`;
  } else {
    report += `### Summary of Detected Changes (${allChanges.length})\n\n`;
    report += `| Contract | Kind | Element | Details |\n`;
    report += `|---|---|---|---|\n`;

    // Sort deterministically
    allChanges.sort((a, b) => {
      const c = a.contract.localeCompare(b.contract);
      if (c !== 0) return c;
      const k = a.kind.localeCompare(b.kind);
      if (k !== 0) return k;
      const elemA = a.fn || a.type || a.name || a.event || "";
      const elemB = b.fn || b.type || b.name || b.event || "";
      return elemA.localeCompare(elemB);
    });

    for (const c of allChanges) {
      const elem = c.fn || c.type || c.name || c.event || "";
      let detail = "";
      if (c.kind === "fn-signature") detail = `\`${c.before}\` → \`${c.after}\``;
      else if (c.kind === "fn-doc") detail = "Doc string updated";
      else if (c.kind === "error-renumbered") detail = `Renumbered from #${c.from} to #${c.to} ⚠️`;
      else if (c.kind === "event-changed" && c.requiresIndexerReview) detail = `Changed (**requires backend indexer review**)`;
      report += `| \`${c.contract}\` | \`${c.kind}\` | \`${elem}\` | ${detail} |\n`;
    }
    report += `\n`;
  }

  if (uncoveredErrors.length > 0) {
    report += `### ❌ Uncovered Contract Errors (${uncoveredErrors.length})\n\n`;
    report += `The following contract errors have no friendly explanation in \`lib/stellar/errors.ts\`:\n\n`;
    for (const u of uncoveredErrors) {
      report += `- \`${u.contract}\` error #${u.code}: **${u.name}**\n`;
    }
    report += `\n`;
  }

  if (referenceHits.length > 0) {
    report += `### ❌ Breaking Call-Site References (${referenceHits.length})\n\n`;
    report += `Removed or re-signatured contract methods are still called in frontend code:\n\n`;
    for (const h of referenceHits) {
      report += `- [${h.file}:${h.line}](file:///${join(ROOT, h.file).replace(/\\/g, "/")}) calls \`${h.contract}.${h.fn}()\`\n`;
    }
    report += `\n`;
  }

  if (renumbered.length > 0) {
    report += `### ❌ Renumbered Error Codes (${renumbered.length})\n\n`;
    for (const r of renumbered) {
      report += `- \`${r.contract}\` error **${r.name}** renumbered from #${r.from} to #${r.to}\n`;
    }
    report += `\n`;
  }

  return { failed, report, allChanges, uncoveredErrors, referenceHits, renumbered };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runDiff(baseRef).then(({ failed, report }) => {
    console.log(report);

    if (summaryFile) {
      try {
        writeFileSync(summaryFile, report, { flag: "a" });
      } catch (err) {
        console.error(`Failed to write summary to ${summaryFile}:`, err);
      }
    }

    if (failed) {
      console.error("\n❌ Contract interface diff checks failed.");
      process.exit(1);
    } else {
      console.log("\n✅ Contract interface diff checks passed.");
      process.exit(0);
    }
  });
}
