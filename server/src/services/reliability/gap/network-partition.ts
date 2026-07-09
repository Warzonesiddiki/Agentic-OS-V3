/**
 * network-partition.ts — interface to the Rust `chaos` crate network-partition
 * fault injector. The heavy lifting (iptables/TC manipulation) lives in Rust; this
 * module issues the command and tracks partition state in-process.
 */
import { ApiError } from '../../../lib/errors.js';
import { forward } from '../../siem-forwarder.js';

export interface PartitionRequest {
  from: string; // node/zone A
  to: string; // node/zone B
  direction: 'one-way' | 'both';
  durationMs: number;
}

export interface PartitionState {
  id: string;
  req: PartitionRequest;
  startedAt: number;
  active: boolean;
}

const partitions = new Map<string, PartitionState>();
let counter = 0;

/** Issue a partition. In production this calls the Rust `chaos` crate over its FFI/CLI. */
export async function injectPartition(
  req: PartitionRequest,
  runner?: (r: PartitionRequest) => Promise<void>
): Promise<PartitionState> {
  const id = 'NP-' + ++counter;
  const state: PartitionState = { id, req, startedAt: Date.now(), active: true };
  partitions.set(id, state);
  void forward({
    ts: Date.now(),
    kind: 'chaos.partition',
    severity: 'warn',
    attrs: { id, from: req.from, to: req.to },
  });
  if (runner) {
    try {
      await runner(req);
    } catch (e) {
      state.active = false;
      throw new ApiError('PARTITION_INJECT_FAILED', (e as Error).message);
    }
  }
  return state;
}

export function healPartition(id: string, healer?: (r: PartitionRequest) => Promise<void>): void {
  const st = partitions.get(id);
  if (!st) throw new ApiError('PARTITION_NOT_FOUND', `No partition ${id}`);
  if (healer) void healer(st.req);
  st.active = false;
}

export function activePartitions(): PartitionState[] {
  return [...partitions.values()].filter((p) => p.active);
}
