# Story E2-S1 — Create and manage provenance-backed memories

**Epic:** E2 — Trusted memory and recall  
**Status:** review

## Completed foundation

- Validated provenance metadata requires type, source, confidence, lifecycle, and one or more evidence IDs.
- R1 service verifies every declared evidence ID belongs to the target project before a memory is persisted.
- Memory/evidence link mismatch, duplicate links, unknown links, and cross-project links fail closed.
- Scoped listing and archive operations are available through the R1 service boundary.

## Completed 2026-07-23

- **Governed memory routes authorized and exposed** (`server/src/routes/r1.ts`):
  memory create (`memory:write`; dangling evidence → 403, agent binding
  outside provenance → 403), scoped list (`memory:read`), archive
  (`memory:write`, principal id recorded as receipt actor) — plus evidence
  append/list routes (`POST`/`GET /projects/:projectId/evidence`).
- **SQLite application-client contract and restart coverage:**
  `r1-application-sqlite-contract.test.ts` runs the repository contract
  through the real application client; `r1-sqlite-restart.test.ts` now
  persists a provenance memory **and its lifecycle receipt** across a full
  client close/reopen.
- **Durable lifecycle/audit receipts:** `R1Service.saveProvenanceMemory`
  appends a `memory.save` receipt (kind `db_write`, correlated by memory id,
  actor = provenance agent/source); `archiveMemory` deletes the row and its
  `memory.archive` receipt is the surviving lifecycle record.
- **PostgreSQL verification:** `r1-application-postgres-contract.test.ts`
  asserts both receipts by direct SQL (`SELECT … FROM r1_action_receipts WHERE
  correlation_id = $1`) after a live save→archive on PGlite (auto-switches to
  a live server under `DATABASE_URL`).

## Evidence

- SDK: 91/91 tests, build clean; server `r1-routes` 7/7; SQLite restart 1/1;
  PostgreSQL contract 3/3; typecheck/lint gates green (see
  `docs/bmad/reviews/E1-S3-code-review.md`).
