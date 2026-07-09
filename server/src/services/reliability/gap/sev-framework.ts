/** sev-framework.ts — severity taxonomy + response SLAs. */
export type Severity = 'sev1' | 'sev2' | 'sev3' | 'sev4';

export interface SeverityDef {
  sev: Severity;
  name: string;
  responseMins: number; // time to first response
  resolutionMins: number;
  examples: string[];
}

export const SEVERITIES: Record<Severity, SeverityDef> = {
  sev1: {
    sev: 'sev1',
    name: 'Critical',
    responseMins: 15,
    resolutionMins: 240,
    examples: ['kill switch engaged unexpectedly', 'data exfiltration'],
  },
  sev2: {
    sev: 'sev2',
    name: 'High',
    responseMins: 30,
    resolutionMins: 480,
    examples: ['core agent down', 'SLO breach'],
  },
  sev3: {
    sev: 'sev3',
    name: 'Medium',
    responseMins: 120,
    resolutionMins: 1440,
    examples: ['degraded latency', 'non-critical bug'],
  },
  sev4: {
    sev: 'sev4',
    name: 'Low',
    responseMins: 480,
    resolutionMins: 4320,
    examples: ['cosmetic', 'docs'],
  },
};

export function slaFor(sev: Severity): SeverityDef {
  return SEVERITIES[sev];
}

export function isResponseOverdue(
  sev: Severity,
  openedAt: number,
  now: number = Date.now()
): boolean {
  return now - openedAt > slaFor(sev).responseMins * 60_000;
}
