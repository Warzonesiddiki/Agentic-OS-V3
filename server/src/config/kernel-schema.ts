import { z } from 'zod';

/**
 * Kernel & scheduler configuration schema (Phase 11.30).
 *
 * Field names align with the real scheduler/kernel surface:
 *   - `quantumMs`      → per-level preemptive timeslice (kernel.ts input, scheduler MLFQ_QUANTUM_MS)
 *   - `maxConcurrencyJobs` → admission gate (kernel.ts `maxConcurrency`)
 *   - `mlfqLevels`     → number of MLFQ priority levels (scheduler `MLFQ_LEVELS`, Q0–Q4)
 *   - `highWatermark` / `lowWatermark` → backpressure depth bounds (kernel.ts `BackpressureError`)
 *
 * `tickIntervalMs` and `boostIntervalMs` are scheduler cadence knobs layered on the
 * existing MLFQ aging/boost policy.
 */
export const kernelConfigSchema = z
  .object({
    highWatermark: z.number().int().positive(),
    lowWatermark: z.number().int().nonnegative(),
    quantumMs: z.number().int().positive(),
    tickIntervalMs: z.number().int().positive(),
    mlfqLevels: z.number().int().min(1).max(8),
    boostIntervalMs: z.number().int().positive(),
    maxConcurrencyJobs: z.number().int().min(0),
  })
  .refine((cfg) => cfg.highWatermark > cfg.lowWatermark, {
    message: 'highWatermark must be greater than lowWatermark',
    path: ['highWatermark'],
  })
  .refine((cfg) => cfg.quantumMs % cfg.tickIntervalMs === 0, {
    message: 'quantumMs must be an integer multiple of tickIntervalMs',
    path: ['quantumMs'],
  });

export type KernelConfig = z.infer<typeof kernelConfigSchema>;

/**
 * Parse and validate an unknown value as a KernelConfig.
 * Throws a ZodError with a clear message on validation failure.
 */
export function validateKernelConfig(cfg: unknown): KernelConfig {
  return kernelConfigSchema.parse(cfg);
}
