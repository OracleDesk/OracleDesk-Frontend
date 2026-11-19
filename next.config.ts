import type { NextConfig } from "next";
import { API_URL, IPFS_GATEWAY, RPC_URL, X402_URL } from "./lib/stellar/config";
import { buildCsp } from "./lib/security/csp";

/**
 * Configuration is validated by lib/stellar/config.ts at module load, so an
 * invalid NEXT_PUBLIC_* value fails `next build` here with the full list of
 * problems before any page is compiled.
 */

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
  /**
   * React Compiler (issue #152).
   *
   * Enabled incrementally: it runs on every file but annotationOnly mode
   * lets you opt specific directories out by adding a `// @no-memo` comment
   * at the top of a file, or by listing them in `ignoredDirs` below.
   *
   * Directories known to have Rules-of-React violations (Math.random in
   * render, setInterval in body) are excluded until they are cleaned up.
   * Remove an entry here once the violations in that directory are fixed and
   * the compiler's lint rule passes with no new errors.
   *
   * To verify the compiler is running: `NEXT_COMPILER_VERBOSE=1 next build`
   * will log each component the compiler processes.
   */
  experimental: {
    reactCompiler: {
      compilationMode: "infer",
      // Opt out problematic directories incrementally.
      // Each entry is a path prefix relative to the project root.
      sources: (filename: string) => {
        const excluded = [
          // app/page.tsx uses Math.random() + setInterval in render-adjacent code.
          "app/page.tsx",
          // copy-trade reads refs during render for slider geometry.
          "app/copy-trade/",
        ];
        return !excluded.some((p) => filename.includes(p));
      },
    },
  },

  /**
   * The seven demo-only routes retired by issue #49. Their UI moved to
   * components/demo/ and renders only in the noindex design gallery at
   * /dev/gallery when NEXT_PUBLIC_ENABLE_DEMO_ROUTES is set; the old URLs go
   * to real destinations (see lib/demo/retired-routes.ts, which CI checks).
   */
  async redirects() {
    return [
      { source: "/wallet-demo", destination: "/portfolio/wallets", permanent: true },
      { source: "/buy-yes-demo", destination: "/markets", permanent: true },
      { source: "/buy-no-demo", destination: "/markets", permanent: true },
      { source: "/execution-terminal", destination: "/markets", permanent: true },
      { source: "/transaction-status", destination: "/tx", permanent: true },
      { source: "/transaction-success", destination: "/tx", permanent: true },
      { source: "/transaction-failed", destination: "/tx", permanent: true },
    ];
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
