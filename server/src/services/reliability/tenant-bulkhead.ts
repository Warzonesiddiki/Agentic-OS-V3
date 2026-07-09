/** tenant-bulkhead.ts — isolates tenant resource pools to prevent noisy-neighbor. */
import { ApiError } from '../../lib/errors.js';

export interface BulkheadConfig {
  tenantId: string;
  maxConcurrent: number;
  maxQueue: number;
}

interface Bulkhead extends BulkheadConfig {
  active: number;
  queue: number;
}

const bulkheads = new Map<string, Bulkhead>();

export function configureBulkhead(cfg: BulkheadConfig): void {
  bulkheads.set(cfg.tenantId, { ...cfg, active: 0, queue: 0 });
}

export function acquire(tenantId: string): void {
  const b = bulkheads.get(tenantId);
  if (!b) return; // unconfigured tenant -> no limit
  if (b.active < b.maxConcurrent) {
    b.active++;
    return;
  }
  if (b.queue < b.maxQueue) {
    b.queue++;
    return;
  }
  throw new ApiError(
    'BULKHEAD_FULL',
    `Tenant ${tenantId} bulkhead is full (active=${b.active}, queue=${b.queue}).`
  );
}

export function release(tenantId: string): void {
  const b = bulkheads.get(tenantId);
  if (!b) return;
  if (b.queue > 0) b.queue--;
  else if (b.active > 0) b.active--;
}

export function stats(tenantId: string): { active: number; queue: number } | undefined {
  const b = bulkheads.get(tenantId);
  return b ? { active: b.active, queue: b.queue } : undefined;
}
