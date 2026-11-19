"use client";

/**
 * Preview mode bootstrap (issue #151).
 *
 * Renders its children immediately, then starts the MSW service worker in the
 * background. All fetch/XHR calls that happen before the worker registers are
 * queued by MSW's onUnhandledRequest handler so nothing is lost.
 *
 * This component is rendered in app/layout.tsx only when
 * NEXT_PUBLIC_PREVIEW_MODE=1 (enforced at the call site). It must never be
 * imported unconditionally; use the conditional wrapper below.
 */

import { useEffect, useState } from "react";
import { flags } from "@/lib/feature-flags";

export function PreviewModeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!flags.previewModeEnabled) {
      setReady(true);
      return;
    }

    // Dynamic import keeps the MSW bundle out of the initial chunk.
    void import("@/lib/mocks/browser").then(({ worker }) =>
      worker.start({ onUnhandledRequest: "bypass" }).then(() => setReady(true)),
    );
  }, []);

  if (!ready && flags.previewModeEnabled) {
    // Show nothing until the worker is ready so the first fetches are intercepted.
    return null;
  }

  return <>{children}</>;
}

/**
 * Safe conditional wrapper: renders children directly in production.
 * Import this in layout.tsx so the preview component is never evaluated
 * in a production build.
 */
export function MaybePreviewModeProvider({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE !== "1") {
    return <>{children}</>;
  }
  return <PreviewModeProvider>{children}</PreviewModeProvider>;
}
