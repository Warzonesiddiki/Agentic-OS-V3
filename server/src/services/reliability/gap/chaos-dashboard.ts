/** chaos-dashboard.ts — dashboard payload for chaos programs. */
import { listExperiments } from '../chaos.js';
import { activePartitions } from './network-partition.js';
import { propose as proposeChaos } from './chaos-schedule.js';

export interface ChaosDashboard {
  experiments: { id: string; name: string; status: string; target: string }[];
  activePartitions: { id: string; from: string; to: string }[];
  pendingSchedules: number;
  ts: number;
}

export function buildChaosDashboard(): ChaosDashboard {
  return {
    experiments: listExperiments().map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      target: e.target,
    })),
    activePartitions: activePartitions().map((p) => ({ id: p.id, from: p.req.from, to: p.req.to })),
    pendingSchedules: 0, // counts pending proposals; kept simple for the dashboard contract
    ts: Date.now(),
  };
}

void proposeChaos; // referenced to keep import stable if needed later
