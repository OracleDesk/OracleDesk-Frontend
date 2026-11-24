"use client";

import { useEffect, useState } from "react";
import { getStoredToken, stepUpCompletedAt, stepUpMaxAgeSeconds } from "@/lib/api/client";
import { decodeJWT } from "@/lib/api/jwt-manager";

export interface StepUpWindow {
  fresh: boolean;
  expiresAt: number | null;
  secondsLeft: number;
}

/**
 * Remaining step-up window, derived from the token's `auth_time` when present
 * (bearer mode) and from the last completed prompt otherwise (cookie mode).
 */
export function useStepUpWindow(): StepUpWindow {
  const [now, setNow] = useState(() => Date.now());

  const token = getStoredToken();
  const payload = token ? decodeJWT(token) : null;
  const authTime = payload && typeof payload.auth_time === "number" ? payload.auth_time : null;
  const completedAt = stepUpCompletedAt();
  const from = authTime !== null ? authTime * 1000 : completedAt;
  const expiresAt = from > 0 ? from + stepUpMaxAgeSeconds() * 1000 : null;
  const secondsLeft = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const fresh = expiresAt !== null && secondsLeft > 0;

  useEffect(() => {
    if (!fresh) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [fresh, expiresAt]);

  return { fresh, expiresAt, secondsLeft };
}
