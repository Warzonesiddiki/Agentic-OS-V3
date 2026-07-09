/** cert-manager.ts — certificate lifecycle: expiry watch, auto-renewal hook. */
import { ApiError } from '../lib/errors.js';

export interface CertRecord {
  id: string;
  commonName: string;
  issuedAt: number;
  expiresAt: number;
  issuer: string;
  autoRenew: boolean;
}

const certs = new Map<string, CertRecord>();

export function registerCert(c: Omit<CertRecord, 'id'> & { id?: string }): CertRecord {
  const id = c.id ?? 'CERT-' + Math.random().toString(36).slice(2, 8);
  const rec: CertRecord = { ...c, id };
  certs.set(id, rec);
  return rec;
}

export function daysUntilExpiry(id: string, now: number = Date.now()): number {
  const c = certs.get(id);
  if (!c) throw new ApiError('CERT_NOT_FOUND', `No cert ${id}`);
  return (c.expiresAt - now) / 86_400_000;
}

export function needsRenewal(id: string, thresholdDays = 21, now: number = Date.now()): boolean {
  const c = certs.get(id);
  if (!c) throw new ApiError('CERT_NOT_FOUND', `No cert ${id}`);
  return c.autoRenew && daysUntilExpiry(id, now) <= thresholdDays;
}

export function expired(id: string, now: number = Date.now()): boolean {
  return daysUntilExpiry(id, now) <= 0;
}

export function listExpiring(withinDays: number, now: number = Date.now()): CertRecord[] {
  return [...certs.values()].filter((c) => daysUntilExpiry(c.id, now) <= withinDays);
}
