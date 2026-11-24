/**
 * Step-up authentication coordinator. The implementation lives beside the API
 * client so the 403 interceptor and the single-flight registry share module
 * state; this module is the stable public surface for consumers.
 */
export {
  registerScopedStepUpHandler as registerStepUpHandler,
  runStepUp,
  noteStepUpMaxAge,
  stepUpMaxAgeSeconds,
  stepUpCompletedAt,
  StepUpRequiredError,
  StepUpCancelledError,
  idempotentRoutes,
  routeAllowsReplay,
} from "@/lib/api/client";

export type {
  StepUpRequest,
  StepUpResult,
  StepUpHandler,
} from "@/lib/api/client";
