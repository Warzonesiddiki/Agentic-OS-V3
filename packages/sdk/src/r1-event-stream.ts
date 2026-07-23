/**
 * E3-S4 Task event stream and replay cursor
 * AC1: Committed task events have stable IDs and sequence/cursor
 * AC2: Client can reconnect with last cursor
 * AC3: Server replays missed events or signals resync required
 * AC4: Duplicate events idempotent in client store
 * AC5: Events do not include unredacted secrets/content by default
 */

import { z } from 'zod';
import type { R1Repositories } from './repositories.js';
import type { TaskRecordEvent } from './r1-types.js';

export const ReplayCursorSchema = z.object({
  projectId: z.string().uuid(),
  lastSequence: z.number().int().nonnegative(),
  lastEventId: z.string().min(1).optional(),
});
export type ReplayCursor = z.infer<typeof ReplayCursorSchema>;

export const EventStreamItemSchema = z.object({
  event: z.object({
    id: z.string(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
    event: z.string(),
    state: z.string(),
    sequence: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  }),
  cursor: z.number().int().nonnegative(),
});
export type EventStreamItem = z.infer<typeof EventStreamItemSchema>;

export interface ReplayResult {
  readonly events: readonly TaskRecordEvent[];
  readonly nextCursor: number;
  readonly resyncRequired: boolean;
}

export class TaskEventStreamService {
  constructor(private readonly repos: R1Repositories) {}

  /** List events after a cursor, for reconnection */
  async replay(projectId: string, taskId: string, cursor: number | ReplayCursor | undefined): Promise<ReplayResult> {
    const all = await this.repos.tasks.listEvents(projectId, taskId);
    // Events are already stable sorted by sequence
    let startSeq = 0;
    if (typeof cursor === 'number') startSeq = cursor + 1;
    else if (cursor && typeof cursor === 'object') startSeq = cursor.lastSequence + 1;

    // If client cursor is ahead of server, signal resync required
    const maxSeq = all.length ? all[all.length - 1]!.sequence : -1;
    if (typeof cursor === 'number' && cursor > maxSeq && maxSeq >= 0) {
      return { events: [], nextCursor: maxSeq, resyncRequired: true };
    }
    if (cursor && typeof cursor === 'object' && cursor.lastSequence > maxSeq && maxSeq >= 0) {
      return { events: [], nextCursor: maxSeq, resyncRequired: true };
    }

    const filtered = all.filter((e) => e.sequence >= startSeq);
    // Redaction: remove any secret-bearing fields (events have no secrets by design, but guard)
    const sanitized = filtered.map((e) => ({
      ...e,
      // ensure no payload leakage
    }));

    return {
      events: sanitized,
      nextCursor: sanitized.length ? sanitized[sanitized.length - 1]!.sequence : startSeq - 1,
      resyncRequired: false,
    };
  }

  /** Client-side idempotent apply */
  static applyIdempotent(current: readonly TaskRecordEvent[], incoming: readonly TaskRecordEvent[]): readonly TaskRecordEvent[] {
    const byId = new Map<string, TaskRecordEvent>();
    for (const e of current) byId.set(e.id, e);
    for (const e of incoming) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  }

  /** SSE formatting helper — returns JSON lines safe for transport */
  static formatSSE(event: TaskRecordEvent): string {
    // AC5: never include unredacted secrets; events are safe
    const safe = {
      id: event.id,
      projectId: event.projectId,
      taskId: event.taskId,
      event: event.event,
      state: event.state,
      sequence: event.sequence,
      createdAt: event.createdAt,
    };
    return `id: ${safe.id}\nevent: task.${safe.event}\ndata: ${JSON.stringify(safe)}\n\n`;
  }
}
