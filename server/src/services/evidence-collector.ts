/** evidence-collector.ts — collects forensic evidence bundles for incidents. */
import { createHash } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { replay } from './session-recorder.js';
import { getIncident } from './incident-response.js';

export interface EvidenceItem {
  name: string;
  contentType: string;
  sha256: string;
  bytes: number;
}

export interface EvidenceBundle {
  incidentId: string;
  collectedAt: number;
  items: EvidenceItem[];
  manifestHash: string;
}

export async function collect(
  incidentId: string,
  extra: { name: string; content: Buffer }[] = []
): Promise<EvidenceBundle> {
  const inc = getIncident(incidentId);
  if (!inc) throw new ApiError('EVIDENCE_NO_INCIDENT', `No incident ${incidentId}`);
  const items: EvidenceItem[] = [];
  try {
    const chain = replay(inc.affectedPrincipal ?? 'n-a');
    const content = Buffer.from(JSON.stringify(chain));
    items.push({
      name: 'session-chain.json',
      contentType: 'application/json',
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.length,
    });
  } catch {
    // affected principal may have no session recorder chain
  }
  for (const e of extra) {
    items.push({
      name: e.name,
      contentType: 'application/octet-stream',
      sha256: createHash('sha256').update(e.content).digest('hex'),
      bytes: e.content.length,
    });
  }
  const manifest = Buffer.from(
    JSON.stringify(items.map((i) => ({ name: i.name, sha256: i.sha256 })))
  );
  const manifestHash = createHash('sha256').update(manifest).digest('hex');
  return { incidentId, collectedAt: Date.now(), items, manifestHash };
}
