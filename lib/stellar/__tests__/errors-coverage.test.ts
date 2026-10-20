import { describe, expect, it } from "vitest";
import { Errors as MarketCoreErrors } from "../generated/market-core";
import { Errors as TreasuryErrors } from "../generated/treasury";
import { Errors as ResolverErrors } from "../generated/resolver";
import { Errors as ReasoningRegistryErrors } from "../generated/reasoning-registry";
import { FRIENDLY_NAMES, UNFRIENDLY_ALLOWLIST } from "../errors";

const TABLES = {
  marketCore: MarketCoreErrors,
  treasury: TreasuryErrors,
  resolver: ResolverErrors,
  reasoningRegistry: ReasoningRegistryErrors,
} as const;

describe("Contract Errors Coverage (Issue #143)", () => {
  it("every contract error name in every binding is in FRIENDLY or UNFRIENDLY_ALLOWLIST", () => {
    const allowed = new Set<string>([...FRIENDLY_NAMES, ...UNFRIENDLY_ALLOWLIST]);
    const uncovered: { contract: string; code: number; name: string }[] = [];

    for (const [contract, table] of Object.entries(TABLES)) {
      for (const [codeStr, entry] of Object.entries(table)) {
        const code = Number(codeStr);
        const name = (entry as { message: string }).message;
        if (!allowed.has(name)) {
          uncovered.push({ contract, code, name });
        }
      }
    }

    if (uncovered.length > 0) {
      const details = uncovered.map((u) => `${u.contract} #${u.code} (${u.name})`).join(", ");
      expect.fail(
        `Found uncovered contract error names without friendly explanations: ${details}. ` +
          "Add an entry to FRIENDLY or UNFRIENDLY_ALLOWLIST in lib/stellar/errors.ts.",
      );
    }

    expect(uncovered).toEqual([]);
  });
});
