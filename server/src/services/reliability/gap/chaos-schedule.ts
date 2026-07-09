/** chaos-schedule.ts — schedule + approval gate for chaos experiments. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../lib/errors.js';

export interface ChaosSchedule {
  id: string;
  experimentName: string;
  scheduledAt: number;
  approver?: string;
  approved: boolean;
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
}

const schedules = new Map<string, ChaosSchedule>();

export function propose(experimentName: string, scheduledAt: number): ChaosSchedule {
  const id = 'CS-' + randomUUID().slice(0, 8);
  const s: ChaosSchedule = { id, experimentName, scheduledAt, approved: false, status: 'pending' };
  schedules.set(id, s);
  return s;
}

export function approve(id: string, approver: string): ChaosSchedule {
  const s = schedules.get(id);
  if (!s) throw new ApiError('CHAOS_SCHED_NOT_FOUND', `No schedule ${id}`);
  s.approver = approver;
  s.approved = true;
  s.status = 'approved';
  return s;
}

export function assertApproved(id: string): void {
  const s = schedules.get(id);
  if (!s) throw new ApiError('CHAOS_SCHED_NOT_FOUND', `No schedule ${id}`);
  if (!s.approved)
    throw new ApiError('CHAOS_NOT_APPROVED', `Chaos schedule ${id} is not approved.`);
}

export function cancel(id: string): void {
  const s = schedules.get(id);
  if (!s) throw new ApiError('CHAOS_SCHED_NOT_FOUND', `No schedule ${id}`);
  s.status = 'cancelled';
}
