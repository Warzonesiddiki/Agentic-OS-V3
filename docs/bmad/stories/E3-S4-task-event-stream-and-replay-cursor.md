# Story E3-S4 — Task event stream and replay cursor

**Epic:** E3
**Priority:** P1
**Estimate:** 3
**Status:** done
**Sprint:** sprint-4

## Acceptance criteria
- [x] Committed task events have stable IDs and sequence/cursor.
- [x] Client can reconnect with the last cursor.
- [x] Server replays missed events or signals resync required.
- [x] Duplicate events are idempotent in the client store.
- [x] Events do not include unredacted secrets/content by default.

## Implementation
- SDK `TaskEventStreamService` with `ReplayResult` {events, nextCursor, resyncRequired}.
- `replay` filters by sequence >= startSeq, checks if cursor ahead of maxSeq -> resyncRequired true.
- `applyIdempotent` dedup by event.id, sorted by sequence.
- `formatSSE` returns safe payload with id, projectId, taskId, event, state, sequence, createdAt (no secrets).
- Routes:
  - GET /tasks/:taskId/events/stream?cursor= returns JSON {events, nextCursor, resyncRequired}
  - GET /tasks/:taskId/events/sse?cursor= returns text/event-stream with `id:`, `event: task.<event>`, `data: JSON`.
- Frontend `R1TaskDetail` loads events, calls `/events/stream?cursor=lastSeq` every 5s, merges idempotently, updates cursor.
- Persistence: events stored in `r1_task_events` with immutable (task_id, sequence) natural key, trigger on insert creates committed creation event.

## Evidence
- packages/sdk/src/r1-event-stream.ts
- server/src/routes/r1-extended.ts
- src/components/r1/R1TaskDetail.tsx

## Validation
- Performance test event reconnect replay idempotent, 5 events merged correctly.
- Security: events contain no payload secrets by design.
