/** fmea-exporter.ts — Failure Mode & Effects Analysis exporter (CSV/JSON). */
export interface FmeaRow {
  component: string;
  failureMode: string;
  cause: string;
  effect: string;
  severity: number; // 1..10
  occurrence: number; // 1..10
  detection: number; // 1..10
  rpn: number; // severity*occurrence*detection
  mitigation: string;
}

export function computeRpn(severity: number, occurrence: number, detection: number): number {
  return severity * occurrence * detection;
}

export function exportJson(rows: FmeaRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function exportCsv(rows: FmeaRow[]): string {
  const header = 'component,failureMode,cause,effect,severity,occurrence,detection,rpn,mitigation';
  const body = rows
    .map((r) =>
      [
        r.component,
        r.failureMode,
        r.cause,
        r.effect,
        r.severity,
        r.occurrence,
        r.detection,
        r.rpn,
        r.mitigation,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  return header + '\n' + body;
}

export function topRisks(rows: FmeaRow[], limit = 10): FmeaRow[] {
  return [...rows].sort((a, b) => b.rpn - a.rpn).slice(0, limit);
}
