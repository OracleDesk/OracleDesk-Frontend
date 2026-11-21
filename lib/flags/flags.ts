/**
 * Typed feature flags for OracleDesk.
 *
 * Defaults come from NEXT_PUBLIC_* env vars at build time (inlined by Next.js).
 * An optional runtime JSON endpoint (NEXT_PUBLIC_FLAGS_URL) can override them
 * on the client after hydration without a rebuild.
 *
 * Rules:
 * - Every flag defaults to `false` (off) unless explicitly enabled.
 * - `NEXT_PUBLIC_*` names must be spelled out literally so Next.js inlines them.
 * - Server-rendered HTML and the first client render must agree — flags are
 *   read once at module load time from env (stable across the render tree).
 * - Demo routes are gated here rather than in next.config.ts so they can be
 *   toggled without touching the build.
 */

export type FeatureFlags = {
  /** x402 per-trace unlock flow. Off when NEXT_PUBLIC_X402_URL is empty. */
  x402Enabled: boolean;
  /** Card payment option on /premium (not yet wired to a real processor). */
  cardPaymentsEnabled: boolean;
  /** Admin contract console (unreleased; kept dark until ready). */
  adminConsoleEnabled: boolean;
  /** Multisig XDR export (unreleased). */
  multisigXdrEnabled: boolean;
  /** Passkey wallet flow (unreleased). */
  passkeyWalletsEnabled: boolean;
  /** Demo/mock routes visible in nav and accessible by URL. */
  demoRoutesEnabled: boolean;
};

function bool(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Build-time defaults read from NEXT_PUBLIC_* env vars. */
const buildTimeDefaults: FeatureFlags = {
  x402Enabled: bool(process.env.NEXT_PUBLIC_FLAG_X402),
  cardPaymentsEnabled: bool(process.env.NEXT_PUBLIC_FLAG_CARD_PAYMENTS),
  adminConsoleEnabled: bool(process.env.NEXT_PUBLIC_FLAG_ADMIN_CONSOLE),
  multisigXdrEnabled: bool(process.env.NEXT_PUBLIC_FLAG_MULTISIG_XDR),
  passkeyWalletsEnabled: bool(process.env.NEXT_PUBLIC_FLAG_PASSKEY_WALLETS),
  demoRoutesEnabled: bool(process.env.NEXT_PUBLIC_FLAG_DEMO_ROUTES),
};

let resolvedFlags: FeatureFlags = { ...buildTimeDefaults };

/**
 * Override flags at runtime from a JSON endpoint.  Call once after hydration
 * (e.g. in a root layout effect); subsequent reads of `flags()` return the
 * merged result.
 */
export async function loadRuntimeFlags(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_FLAGS_URL?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const remote = (await res.json()) as Partial<Record<keyof FeatureFlags, boolean>>;
    // Only override known boolean keys to guard against prototype pollution.
    const merged = { ...resolvedFlags };
    for (const key of Object.keys(resolvedFlags) as (keyof FeatureFlags)[]) {
      if (typeof remote[key] === 'boolean') {
        merged[key] = remote[key] as boolean;
      }
    }
    resolvedFlags = merged;
  } catch {
    // Network error or bad JSON — keep the build-time defaults.
  }
}

/** Returns the current resolved flags. Stable during SSR; may update once on the client after `loadRuntimeFlags`. */
export function flags(): Readonly<FeatureFlags> {
  return resolvedFlags;
}

/** Returns a single flag by name. Useful for tree-shaken imports. */
export function flag<K extends keyof FeatureFlags>(name: K): FeatureFlags[K] {
  return resolvedFlags[name];
}
