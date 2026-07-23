# E10-S5 — Classify and Remediate Full-Suite Failures

**Epic:** E10-R1 Integrity, Security, and Release Requalification  
**Priority:** P0  
**Status:** in_progress

## User story

As a release owner, I need every failing full-suite test accounted for and remediated with evidence, so test selection cannot conceal product defects.

## Acceptance criteria

1. Every failing test file and all failed cases are preserved in a raw run artifact.
2. Every failing test file has one primary classification: `actual_product_defect`, `environment_native_dependency_failure`, `stale_or_broken_test`, or an approved replacement-coverage disposition.
3. Every classification has a concrete next action, owner, and rerun requirement before closure.
4. Environment failures are rerun on a supported machine; they are never treated as passing in the sandbox.
5. Stale/broken tests are repaired, or removed only with approved equivalent coverage and traceability.
6. Product defects receive regression tests and a green full-suite rerun.
7. The release gate remains blocked until the full configured suite is green or an approved test-policy change has removed/replaced every non-applicable test.

## Negative cases

- A failing test cannot be excluded because it is inconvenient, flaky, or outside R1 without documented replacement coverage.
- A native-binding error cannot hide secondary failures in the same test on a supported machine.
- A mock mismatch cannot be classified as environment failure.

## Initial evidence

- `docs/bmad/releases/evidence/2026-07-24-full-suite.log`
- `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`
- Current run: 98 failed files, 159 failed tests, 156 passed files, 1,750 passed tests, 12 skipped.

## Definition of done

The full suite is green under the approved test policy, every remediation is traceable, and an adversarial reviewer confirms no failing category was silently suppressed.
