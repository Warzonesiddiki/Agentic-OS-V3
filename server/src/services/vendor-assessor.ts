/** vendor-assessor.ts — third-party vendor risk assessment. */
import { ApiError } from '../lib/errors.js';

export interface VendorAssessment {
  vendor: string;
  soc2: boolean;
  iso27001: boolean;
  dataResidency: string;
  breachHistory: number;
  score: number; // 0..100
  approved: boolean;
}

export function assess(input: Omit<VendorAssessment, 'score' | 'approved'>): VendorAssessment {
  let score = 50;
  if (input.soc2) score += 20;
  if (input.iso27001) score += 15;
  if (input.breachHistory === 0) score += 15;
  else score -= input.breachHistory * 10;
  score = Math.max(0, Math.min(100, score));
  return { ...input, score, approved: score >= 60 };
}

export function listApproved(vendors: VendorAssessment[]): string[] {
  return vendors.filter((v) => v.approved).map((v) => v.vendor);
}

export function requireApproved(vendor: string, vendors: VendorAssessment[]): void {
  const v = vendors.find((x) => x.vendor === vendor);
  if (!v) throw new ApiError('VENDOR_UNKNOWN', `Unknown vendor ${vendor}`);
  if (!v.approved)
    throw new ApiError('VENDOR_UNAPPROVED', `Vendor ${vendor} is not approved (score ${v.score}).`);
}
