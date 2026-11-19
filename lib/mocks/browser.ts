/**
 * MSW browser worker setup for preview mode (issue #151).
 *
 * Imported only when flags.previewModeEnabled is true.
 * The dynamic import in PreviewModeProvider keeps this out of
 * the initial bundle even when preview mode is enabled.
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
