# Story E6-S2 — Task start and detail experience

**Epic:** E6
**Priority:** P1
**Estimate:** 8
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Start drawer shows goal, scope, agent, memory mode, capabilities, budgets, and approval preview.
- [x] Task detail has deep link, status, current step, timeline, evidence links, cost/latency, and valid actions.
- [x] UI renders all task states with the PRD language and no fake progress.
- [x] Event replay keeps the view correct after reload/reconnect.
- [x] Cancel/retry/recover actions require server-confirmed state.
- [x] UI never exposes raw secrets or unredacted tool arguments.

## Implementation
- `R1TaskStart`:
  - Goal textarea, project scope locked Input disabled showing projectId, agent/runtime Input, memory mode Select (auto/scoped recall/selected/none), token budget number, capabilities checkboxes with risk badges low/high/rose.
  - Approval preview card amber: safe defaults explanation, secrets redacted, no side effect before approval.
  - Start creates task with id randomUUID, projectId, principalId local-operator, agentId, state queued, title truncated goal, goal, capabilityIds, policyVersion v1, inputReference, correlationId, idempotencyKey unique, timestamps, POST /tasks.
- `R1TaskDetail`:
  - Params taskId from URL, projectId from localStorage.
  - Loads task, events via listTaskEvents, timeline via evidenceTimeline, recovery info if failed.
  - Event replay: fetches /events/stream?cursor=lastSeq every 5s, merges idempotently via Map by id, sorts by sequence, updates cursor.
  - Header: title, state badge via toneMap covering queued, running, waiting_approval, waiting_input, retrying, compensating, completed, failed, canceled, quarantined, ID mono, correlation, goal.
  - Overview card: agent, policy, capabilities, started/updated.
  - Timeline main: sequence, event, state, timestamp, event ID.
  - Evidence rail: timeline entries with task/step/receipt links.
  - Recovery card if failed: validActions, lastCheckpoint seq/timestamp, Retry from checkpoint and Cancel buttons.
  - Valid actions: cancel allowed for queued/running/waiting_approval/waiting_input/retrying, retry only if failed, recovery only if failed.
  - Server-confirmed: cancel/retry call API then reload; no optimistic UI for side effects.
  - No secrets: displays redacted args only via evidence timeline (receipts redacted), no raw tool args.
  - PRD language: states match PRD (queued, running, waiting_approval, etc.) no fake progress percentage.

## Evidence
- src/components/r1/R1TaskDetail.tsx
- src/lib/r1-client.ts
- server/src/routes/r1-extended.ts

## Validation
- Reload preserves deep link taskId; event replay keeps view correct.
- Keyboard accessible, screen-reader roles.
