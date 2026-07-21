# Story E2-S1 — Create and manage provenance-backed memories

**Epic:** E2 — Trusted memory and recall  
**Status:** in_progress

## Completed foundation

- Validated provenance metadata requires type, source, confidence, lifecycle, and one or more evidence IDs.
- R1 service verifies every declared evidence ID belongs to the target project before a memory is persisted.
- Memory/evidence link mismatch, duplicate links, unknown links, and cross-project links fail closed.
- Scoped listing and archive operations are available through the R1 service boundary.

## Remaining

- Authorize and expose governed memory create/list/archive routes.
- Add SQLite application-client contract and restart coverage.
- Add durable lifecycle/audit receipts and PostgreSQL verification.
