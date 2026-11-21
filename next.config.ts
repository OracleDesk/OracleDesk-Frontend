import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { API_URL, IPFS_GATEWAY, RPC_URL, X402_URL } from "./lib/stellar/config";
import { buildCsp } from "./lib/security/csp";

/**
 * Deterministic build ID generation.
 * Uses commit SHA (or NEXT_PUBLIC_BUILD_ID/BUILD_ID env) with safe local fallback.
 */
function resolveBuildId(): string {
  if (process.env.NEXT_PUBLIC_BUILD_ID?.trim()) {
    return process.env.NEXT_PUBLIC_BUILD_ID.trim();
  }
  if (process.env.BUILD_ID?.trim()) {
    return process.env.BUILD_ID.trim();
  }
  try {
    const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (gitSha && /^[0-9a-f]{40}$/.test(gitSha)) {
      return gitSha;
    }
  } catch {
    // git not available or not in repo
  }
  return "deterministic-static-build-id";
}

const DETERMINISTIC_BUILD_ID = resolveBuildId();

/**
 * Deterministic build id: single source of truth across the page,
 * the service worker URL, and the precache manifest (.next/BUILD_ID).
 */
function resolveBuildId(): string {
  const explicit = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  if (explicit && /^[A-Za-z0-9_-]+$/.test(explicit)) return explicit;
  const sha = (
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_REF ||
    process.env.HEAD ||
    ""
  ).trim();
  if (sha && /^[A-Za-z0-9_-]+$/.test(sha)) return sha.slice(0, 16);
  try {
    const gitSha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (gitSha && /^[A-Za-z0-9_-]+$/.test(gitSha)) return gitSha;
  } catch {
    // Git unavailable; fall through
  }
  return "build-" + (process.env.NODE_ENV === "production" ? "prod" : "dev");
}

const deterministicBuildId = resolveBuildId();

const isDev = process.env.NODE_ENV !== "production";
const reportUri = process.env.NEXT_PUBLIC_CSP_REPORT_URL?.trim() || "";
const enforce = process.env.NEXT_PUBLIC_CSP_ENFORCE === "1" || process.env.NEXT_PUBLIC_CSP_ENFORCE === "true";

const csp = buildCsp({
  apiUrl: API_URL,
  rpcUrl: RPC_URL,
  ipfsGateway: IPFS_GATEWAY,
  x402Url: X402_URL,
  reportUri,
  dev: isDev,
});

// Trusted Types is report-only until the wallet kit and Next bootstrap are audited.
const cspValue = enforce
  ? csp
  : `${csp}; require-trusted-types-for 'script'; trusted-types default nextjs#bundler`;

const securityHeaders = [
  { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: cspValue },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // usb/hid stay available to self so Ledger and Trezor can work.
    value: "camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self), usb=(self), hid=(self)",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  generateBuildId: async () => deterministicBuildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: deterministicBuildId,
  },
  /**
   * Static export mode for reproducible content-addressed static builds.
   */
  output: "export",

  /**
   * Enforce deterministic build id exposed to application and service worker.
   */
  generateBuildId: async () => DETERMINISTIC_BUILD_ID,

  env: {
    NEXT_PUBLIC_BUILD_ID: DETERMINISTIC_BUILD_ID,
  },

  /**
   * Every asset is self-hosted (issue #121). Remote images are refused by
   * default; add a reviewed host here only if it is unavoidable, and add it to
   * scripts/external-origins.allow.json with a reason.
   */
  images: {
    unoptimized: true,
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },

  /**
   * Headers are defined here for custom static hosts (or local dev server).
   */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * React Compiler (#152). Enabled incrementally: starts with the whole app
   * and opts out per-directory via panicThreshold to avoid mis-optimizing
   * code that mutates during render.  Remove entries as violations are fixed.
   * The compiler automatically memoizes components and hooks that follow the
   * Rules of React, replacing hand-written useMemo/useCallback.
   */
  experimental: {
    reactCompiler: {
      compilationMode: "infer",
    },
  },
};

export default nextConfig;
