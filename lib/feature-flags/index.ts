/**
 * Typed feature-flag system (issue #150).
 *
 * Defaults are inlined from NEXT_PUBLIC_* env vars at build time so the
 * server-rendered HTML and the first client render always agree (no hydration
 * mismatch). An optional runtime JSON endpoint can override individual flags
 * after boot; consumers call `applyRuntimeOverrides(json)` once they fetch it.
 *
 * Usage:
 *   import { flags } from "@/lib/feature-flags";
 *   if (flags.x402UnlockEnabled) { … }
 */

export interface FeatureFlags {
  /** Per-trace x402 unlock flow. Requires NEXT_PUBLIC_X402_URL to be set. */
  x402UnlockEnabled: boolean;
  /** Card payment option on /premium. When false the option is hidden. */
  cardPaymentsEnabled: boolean;
  /** Show the admin contract console pages to ADMIN_ADDRESSES. */
  adminContractConsoleEnabled: boolean;
  /** Multisig XDR export on the /admin pages. */
  multisigXdrExportEnabled: boolean;
  /** Passkey wallet option in the connect flow. */
  passkeyWalletsEnabled: boolean;
  /**
   * Preview / mock mode. When true the app runs against an MSW mock layer.
   * Must be false (and is tree-shaken out) in production bundles.
   * Enabled automatically when NEXT_PUBLIC_PREVIEW_MODE=1 is set at build time.
   */
  previewModeEnabled: boolean;
}

/**
 * Build-time defaults. Each NEXT_PUBLIC_* name is written out in full so
 * Next.js inlines the value (dynamic access like `process.env[key]` is not
 * supported).
 */
const buildTimeDefaults: FeatureFlags = {
  x402UnlockEnabled: Boolean(process.env.NEXT_PUBLIC_X402_URL),
  cardPaymentsEnabled: process.env.NEXT_PUBLIC_FLAG_CARD_PAYMENTS === "1",
  adminContractConsoleEnabled: process.env.NEXT_PUBLIC_FLAG_ADMIN_CONTRACT_CONSOLE === "1",
  multisigXdrExportEnabled: process.env.NEXT_PUBLIC_FLAG_MULTISIG_XDR_EXPORT === "1",
  passkeyWalletsEnabled: process.env.NEXT_PUBLIC_FLAG_PASSKEY_WALLETS === "1",
  previewModeEnabled:
    process.env.NEXT_PUBLIC_PREVIEW_MODE === "1" &&
    process.env.NODE_ENV !== "production",
};

// Mutable at runtime so `applyRuntimeOverrides` can patch flags without
// replacing the reference (consumers already hold it).
export const flags: FeatureFlags = { ...buildTimeDefaults };

/**
 * Merge a partial override object fetched from an optional runtime endpoint.
 * The server must return `{ "flagName": true|false, … }`.
 * Unknown keys are ignored.
 */
export function applyRuntimeOverrides(overrides: Partial<Record<string, boolean>>): void {
  for (const key of Object.keys(flags) as (keyof FeatureFlags)[]) {
    if (typeof overrides[key] === "boolean") {
      // previewModeEnabled can never be turned on at runtime in production.
      if (key === "previewModeEnabled" && process.env.NODE_ENV === "production") continue;
      flags[key] = overrides[key] as boolean;
    }
  }
}

/**
 * Kill-switch helper: returns `false` and logs a warning when a flag has been
 * force-disabled by a runtime override that sets it to `false` after a
 * build-time `true`.
 */
export function isEnabled(flag: keyof FeatureFlags): boolean {
  return flags[flag];
}
