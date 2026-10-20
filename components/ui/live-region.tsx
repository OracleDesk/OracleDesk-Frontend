"use client";

import React from "react";

export interface LiveRegionProps {
  message?: string | null;
  /**
   * "polite" (default) waits for the screen reader to finish speaking.
   * "assertive" interrupts immediately.
   */
  politeness?: "polite" | "assertive" | "off";
  className?: string;
}

/**
 * A polite accessibility live region that announces status updates and quotes
 * without visual disturbance.
 */
export function LiveRegion({
  message,
  politeness = "polite",
  className = "sr-only",
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={className}
    >
      {message ?? ""}
    </div>
  );
}
