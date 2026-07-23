# E10-S4 — Establish Machine-Readable Release Evidence Ledger

**Epic:** E10-R1 Integrity, Security, and Release Requalification  
**Priority:** P0  
**Status:** in_progress

## User story

As an independent reviewer, I need a machine-readable, immutable-in-practice ledger of validation commands and results, so a release decision is reproducible rather than narrative.

## Acceptance criteria

1. Ledger uses a versioned schema and records commit SHA, generation date, Node/pnpm versions, platform, install mode, and database mode.
2. Each validation record includes command, expected result, actual result, status, artifact path, and reviewer field.
3. Failed commands are recorded as failed/blocked; no failing result may be omitted.
4. Raw command output is retained with the ledger or an integrity-addressed external artifact.
5. Ledger distinguishes targeted evidence from full-release evidence.
6. The release decision is derived from blocking records, not manually asserted.
7. Schema and content validation run in CI/release qualification.

## Negative cases

- A command with nonzero exit code cannot have `pass` status.
- A log path outside repository evidence storage is rejected.
- A targeted test result cannot overwrite a full-suite result.

## Evidence

- `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json`
- `docs/bmad/releases/evidence/2026-07-24-full-suite.log`

## Definition of done

A fresh environment can execute the ledger commands, compare result to expectation, and independently reach the same blocked/pass conclusion.
