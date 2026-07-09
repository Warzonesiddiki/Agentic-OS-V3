interface SSEWriter {
  write(chunk: string): void;
  close(): void;
}

/**
 * Sharded subscriber registry.
 *
 * Fan-out must stay O(N) in the number of subscribers (never O(N^2)). A single
 * global Set mutated during iteration is correct but fragile: deleting a dead
 * writer mid-iteration changes the collection being walked. Sharding keeps each
 * shard small and lets us swap a shard array atomically when pruning, so the
 * broadcast loop always walks a stable snapshot. Sharding also spreads writes
 * across independent arrays, reducing per-shard churn under high subscribe/
 * unsubscribe rates.
 */
const SHARD_COUNT = 32;
const shards: SSEWriter[][] = Array.from({ length: SHARD_COUNT }, () => []);

function shardFor(writer: SSEWriter): number {
  // Stable identity hash from the object reference via a hidden counter.
  const idx = (writerShardHints.get(writer) ?? -1);
  if (idx >= 0) return idx;
  const next = (nextShard++) % SHARD_COUNT;
  writerShardHints.set(writer, next);
  return next;
}

const writerShardHints = new WeakMap<SSEWriter, number>();
let nextShard = 0;

export function addSSEClient(writer: SSEWriter): () => void {
  const shard = shardFor(writer);
  shards[shard].push(writer);
  return () => {
    const s = shards[shardFor(writer)];
    const i = s.indexOf(writer);
    if (i >= 0) s.splice(i, 1);
  };
}

export function getSSEClientCount(): number {
  let n = 0;
  for (const s of shards) n += s.length;
  return n;
}

export function broadcastSSE(event: { type: string; data: unknown; timestamp: number }): void {
  const msg = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (let si = 0; si < SHARD_COUNT; si++) {
    const shard = shards[si];
    if (shard.length === 0) continue;
    // Snapshot the shard so deletions during write don't corrupt iteration.
    const snapshot = shard.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const w = snapshot[i];
      try {
        w.write(msg);
      } catch {
        const live = shards[si];
        const li = live.indexOf(w);
        if (li >= 0) live.splice(li, 1);
      }
    }
  }
}
