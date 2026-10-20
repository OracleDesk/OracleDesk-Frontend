#!/usr/bin/env node
/**
 * Build-time check: abort if NEXT_PUBLIC_PREVIEW_MODE=1 and NODE_ENV=production.
 *
 * Run from the CI/CD pipeline before `next build` for production targets.
 * Preview deployments (NODE_ENV defaults to "production" in Next.js builds)
 * must set PREVIEW_BUILD=1 instead of NODE_ENV; the check here reads that.
 */

const isProductionDeployment =
  process.env.NODE_ENV === "production" &&
  process.env.PREVIEW_BUILD !== "1";

if (isProductionDeployment && process.env.NEXT_PUBLIC_PREVIEW_MODE === "1") {
  console.error(
    "[ERROR] NEXT_PUBLIC_PREVIEW_MODE=1 is set but this is a production build.\n" +
    "        The mock layer must never ship to production. Aborting.",
  );
  process.exit(1);
}

console.log("[check-preview-not-in-prod] OK");
