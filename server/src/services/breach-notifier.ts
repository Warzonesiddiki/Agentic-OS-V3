/** breach-notifier.ts — notifies stakeholders + regulators within SLA on a data breach. */
import { ApiError } from '../lib/errors.js';
import { forward } from './siem-forwarder.js';

export type BreachSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface BreachNotice {
  id: string;
  detectedAt: number;
  severity: BreachSeverity;
  affectedRecords: number;
  dataClasses: string[];
  notified: string[];
  regulatorDeadlineHours: number;
}

const notices = new Map<string, BreachNotice>();

export function declareBreach(
  input: Omit<BreachNotice, 'id' | 'notified'> & { id?: string }
): BreachNotice {
  const id = input.id ?? 'BR-' + Math.random().toString(36).slice(2, 10);
  const notice: BreachNotice = { ...input, id, notified: [] };
  notices.set(id, notice);
  void forward({
    ts: Date.now(),
    kind: 'breach.declared',
    severity: notice.severity === 'critical' ? 'critical' : 'error',
    attrs: { id, severity: notice.severity },
  });
  return notice;
}

export function notifyStakeholders(id: string, stakeholders: string[]): BreachNotice {
  const n = notices.get(id);
  if (!n) throw new ApiError('BREACH_NOT_FOUND', `No breach ${id}`);
  for (const s of stakeholders) if (!n.notified.includes(s)) n.notified.push(s);
  return n;
}

export function isRegulatorDeadlineMissed(id: string, now: number = Date.now()): boolean {
  const n = notices.get(id);
  if (!n) throw new ApiError('BREACH_NOT_FOUND', `No breach ${id}`);
  const deadline = n.detectedAt + n.regulatorDeadlineHours * 3600_000;
  return now > deadline;
}
