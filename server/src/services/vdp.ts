/** vdp.ts — Vulnerability Disclosure Program intake & triage. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

export type VdpStatus = 'new' | 'triaged' | 'accepted' | 'fixed' | 'wont_fix';

export interface VdpReport {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reporter: string;
  status: VdpStatus;
  createdAt: number;
  cve?: string;
}

const reports = new Map<string, VdpReport>();

export function submit(
  report: Omit<VdpReport, 'id' | 'status' | 'createdAt'> & { id?: string }
): VdpReport {
  const rec: VdpReport = {
    ...report,
    id: report.id ?? 'VDP-' + randomUUID().slice(0, 8),
    status: 'new',
    createdAt: Date.now(),
  };
  reports.set(rec.id, rec);
  return rec;
}

export function triage(id: string, cve: string | undefined, status: VdpStatus): VdpReport {
  const r = reports.get(id);
  if (!r) throw new ApiError('VDP_NOT_FOUND', `No report ${id}`);
  r.cve = cve ?? r.cve;
  r.status = status;
  return r;
}

export function openCritical(): VdpReport[] {
  return [...reports.values()].filter(
    (r) => r.severity === 'critical' && (r.status === 'new' || r.status === 'triaged')
  );
}
