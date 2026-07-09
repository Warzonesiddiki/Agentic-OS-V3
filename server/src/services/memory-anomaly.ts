// server/src/services/memory-anomaly.ts
//
// Per-agent rolling-window anomaly detection: flags high-importance memories
// that have not been accessed within the stale threshold inside a rolling
// window (default 7 days) of agent activity.

export interface AnomalyMemory {
  id: string;
  agentId: string;
  importance: number;
  lastAccessedAt: Date | null;
  lastRecalledAt?: Date | null;
  createdAt: Date;
}

export interface MemoryAnomaly {
  memoryId: string;
  agentId: string;
  reason: string;
  importance: number;
  hoursSinceLastAccess: number;
}

export interface AnomalyOptions {
  now?: Date;
  windowDays?: number;
  highImportanceThreshold?: number;
  staleHours?: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function detectMemoryAnomalies(
  memories: AnomalyMemory[] = [],
  options: AnomalyOptions = {}
): MemoryAnomaly[] {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 7;
  const highImportanceThreshold = options.highImportanceThreshold ?? 0.7;
  const staleHours = options.staleHours ?? 48;

  const windowStart = now.getTime() - windowDays * DAY_MS;
  const anomalies: MemoryAnomaly[] = [];

  for (const memory of memories) {
    if (memory.importance < highImportanceThreshold) continue;

    const last: Date | null = memory.lastAccessedAt ?? memory.lastRecalledAt ?? null;
    const hoursSince = last === null ? Infinity : (now.getTime() - last.getTime()) / HOUR_MS;
    const stale = last === null || hoursSince > staleHours;
    const withinWindow = memory.createdAt.getTime() >= windowStart;

    if (stale && withinWindow) {
      anomalies.push({
        memoryId: memory.id,
        agentId: memory.agentId,
        reason:
          last === null
            ? 'high-importance memory never accessed'
            : 'high-importance memory not accessed within stale threshold',
        importance: memory.importance,
        hoursSinceLastAccess: last === null ? Infinity : hoursSince,
      });
    }
  }

  anomalies.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.hoursSinceLastAccess - a.hoursSinceLastAccess;
  });

  return anomalies;
}
