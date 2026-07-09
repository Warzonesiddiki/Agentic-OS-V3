/**
 * Logger re-export shim.
 *
 * `logging.ts` is the canonical structured-logger implementation. Some
 * modules import from `../lib/logger.js`; this thin module re-exports the
 * public surface so both import forms resolve.
 */

import { log, redact, fatal } from './logging.js';

export { log, redact, fatal };
/** Alias used by orchestration modules. */
export const logger = { log, redact, fatal };
