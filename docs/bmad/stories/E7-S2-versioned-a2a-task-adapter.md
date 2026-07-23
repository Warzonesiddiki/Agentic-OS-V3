# Story E7-S2 — Versioned A2A task adapter

**Epic:** E7
**Priority:** P2
**Estimate:** 8
**Status:** done
**Sprint:** sprint-7
**Dependencies:** E4-S1, E3-S2, E5-S2

## Acceptance criteria
- [x] Supported A2A version/binding is declared and tested.
- [x] Agent Card is validated for identity, endpoint, capabilities, auth, and version.
- [x] Remote task ID/context/artifacts correlate to a local task step.
- [x] Local policy and approval run before delegation and before artifact promotion.
- [x] Remote failure/unknown status is visible and recoverable.
- [x] Remote content is untrusted and cannot silently become trusted memory.

## Implementation
- SDK `A2AAdapter` with `A2ACompatibilityMatrix` versions ['1.0','0.9'] bindings ['json-rpc','http'] default 1.0.
- `AgentCard` schema: id, name, version, endpoint url, capabilities min 1, auth type none/bearer/oauth/mtls required bool, identity provider/publicKey/verified, extensions. Validation: version in matrix, identity.verified true, auth required but type none fails, endpoint https or localhost, capabilities non-empty.
- `A2ATask` schema: id contextId localTaskId localStepId optional agentCardId status submitted/running/completed/failed/unknown artifacts array id/mimeType/content/metadata, createdAt updatedAt.
- Repos: `AgentCardRepository` in-memory + SQL `r1_a2a_cards`, `A2ATaskRepository` in-memory + SQL `r1_a2a_tasks` with FK to r1_tasks and r1_a2a_cards.
- `delegateTask`: validates card exists, policy check before delegation (allow/deny/approval_required), approval check if required, creates task with submitted status, correlates localTaskId/localStepId/contextId/remote id, saves.
- `getRemoteStatus`: returns task, if unknown keeps unknown visible recoverable.
- `updateRemoteStatus`: updates status + artifacts.
- `promoteArtifact`: before promotion policy check + approval, remote content marked untrusted candidate `trust: candidate, untrusted: true`, cannot become trusted memory silently.
- `listForLocalTask`: lists tasks for local task.
- Routes: GET /a2a/compatibility, POST /a2a/cards (admin), GET /a2a/cards, POST /projects/:id/a2a/delegate (policy+approval+span), GET /a2a/tasks/:id, POST /a2a/tasks/:id/status, POST /a2a/tasks/:id/promote (policy+approval), GET /a2a/local/:localTaskId.
- Frontend: r1-client a2aCompatibility, registerA2ACard, listA2ACards, delegateA2ATask.

## Evidence
- packages/sdk/src/r1-a2a-adapter.ts
- packages/sdk/src/sql-e7-repositories.ts SqlA2ACardRepo, SqlA2ATaskRepo
- server/src/db/migrations/0053_r1_sync.sql (r1_a2a_cards, r1_a2a_tasks)
- server/src/services/r1-extended-runtime.ts
- server/src/routes/r1-extended.ts

## Validation
- Unsupported version throws, identity not verified throws, endpoint must be https.
- Policy denied delegation fails, approval required without approvalId fails.
- Remote unknown status visible, artifact promotion marks untrusted.
