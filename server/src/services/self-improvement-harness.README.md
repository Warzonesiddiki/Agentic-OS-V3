# self-improvement-harness

## Purpose
Phase 18 control plane for AI-native self-optimization. Collects metrics, detects regressions, proposes
improvements (patches gated by `RiskClass` ADVISORY/BLOCKING/SAFETY), and runs an approval workflow with an
env-override allowlist + audit trail. `applyPatch` writes recommended env values (no in-process mutation).
`harnessTick` is the per-loop driver. Pulse owns the live tuners; this is the harness.

## Public exports (selected)
- `type RiskClass`, `type ProposalStatus`.
- `interface MetricWindow`, `interface ProposalPatch`, `interface ProposalInput`, `interface ProposalRecord`.
- `async function collectRecentMetrics(metric, limit?)`.
- `async function recordMetric(name, value, labels?)`.
- `function detectRegression(window): { regressed: boolean; delta: number }` — pure.
- `async function proposeImprovement(input): Promise<ProposalRecord>`.
- `async function listProposals(filter?)`, `getProposal(id)`, `approveProposal(id, reviewer)`,
  `rejectProposal(id, reviewer, reason)`.
- `const ENV_OVERRIDE_ALLOWLIST` — allowed `NEXUS_*` keys.
- `const ENV_AUDIT_TRAIL` — append-only audit array.
- `async function applyPatch(proposal): Promise<ProposalRecord>`.
- `async function measureAndFinalize(...)`, `harnessTick(opts)`.

## Env vars
Reads `NEXUS_*` tuning knobs (allowlisted). Writes only recorded recommendations, not live process.env.

## Test file
- `server/tests/self-improvement-harness.test.ts` (propose/approve/apply, regression detection).
