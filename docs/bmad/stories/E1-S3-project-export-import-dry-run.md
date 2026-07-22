# Story E1-S3 — Project export/import dry run

**Epic:** E1 — Project context and local persistence  
**Status:** review  
**Dependencies:** E1-S1 (done), E0-S3 (done), E5-S1 (done)

## Acceptance criteria → evidence

1. **Export is schema-versioned and scoped to a single project.**  
   `ProjectTransferService.exportProject` (`packages/sdk/src/project-transfer.ts`)
   emits a `ProjectExportBundle` validated by `ProjectExportBundleSchema`
   (`schemaVersion: 'r1.project-export.v1'`, super-refined so every exported
   row's `projectId` equals the bundle scope; unknown projects export as
   `null`). Each bundle carries a sha256 `contentHash` over the canonical JSON
   payload (sorted keys, `undefined` fields dropped) so integrity is
   independently verifiable.

2. **Secrets are redacted or omitted per export policy.**  
   `ExportPolicySchema` (`redactKeyPattern` defaulting to
   `password|passwd|secret|token|api[_-]?key|authorization|credential|private[_-]?key`,
   `omitReceiptPayloads`). Scrubbing is single-pass over metadata/scope/payload
   objects and records every redaction (path + matched key) in the bundle so
   the dry run can report them.

3. **Import validates schema and integrity before any mutation.**  
   `dryRunImport` parses the bundle with the schema, verifies `contentHash`,
   and never touches repositories; `applyImport` verifies schema + hash again
   before the first write. Tampered bundles fail closed with
   `integrity_mismatch` (proven live on PostgreSQL in the contract test).

4. **Dry run reports additions, conflicts, rejected records, redactions.**  
   The plan reports per-collection additions, idempotency/natural-key
   conflicts (existing `idempotencyKey` tasks, `(task_id, sequence)` events),
   rejected records with reasons, and the redaction ledger from the bundle.

5. **Invalid input cannot partially mutate.**  
   `applyProjectImport(candidate, runInTransaction)` executes the apply
   through a single transaction on both engines: SQLite via `withTransaction`
   on the shared connection, PostgreSQL via a transaction-scoped executor
   (`pg.begin`). The contract test poisons the executor mid-apply and asserts
   zero rows survive (full rollback) — see 400/409 route statuses for
   rejected/conflicted plans.

## Test evidence

- `packages/sdk/src/project-transfer.test.ts` — 12/12 PASS (invalid schema,
  duplicate records, redaction ledger, dry-run purity, hash tampering).
- `server/tests/r1-project-transfer-contract.test.ts` — 5/5 PASS, incl.
  SQLite export → fresh-database restore through the real application client
  (append-only triggers active), poisoned-executor mid-apply rollback, and a
  PGlite PostgreSQL export → restore → tamper-reject round trip.
- Routes (`server/src/routes/r1.ts`): `GET /projects/:projectId/export`
  (`memory:read`, `?omitReceiptPayloads=true`), `POST /projects/import/dry-run`
  (`memory:write`, always 200 with a plan), `POST /projects/import`
  (`brain:admin`; 200 applied / 400 rejected / 409 conflicts); anonymous → 401.
