/**
 * Phase 11 — Task 11.30: Zod Kernel Config Schema (re-export).
 *
 * The canonical Zod kernel-config schema lives in `config/kernel-schema.ts`.
 * This module re-exports it so callers can import it from the `services/`
 * namespace as well (the phase-11 test harness resolves `./kernel-schema.js`).
 */
export { kernelConfigSchema, validateKernelConfig } from '../config/kernel-schema.js';
export type { KernelConfig } from '../config/kernel-schema.js';
