# Agent Note: ws1-wave1-scheduler-quota-kernel-contracts

Status: implemented

## Problem

WS1 Wave-1 full-suite run showed 5 failing Forge-cluster files: (1) phase11-kernel asserted a RingPolicyStore named export that kernel.ts never exported despite AGENTS.md documenting "the runtime uses RingPolicyStore (class in kernel.ts)"; (2) resource-quota 'throttles writes beyond capacity' got a thrown NetworkQuotaExceededError although the module header documents setTimeout-throttling with throws reserved for hard-cap breaches; (3) FairnessTracker.correct() flagged only under-served teams and mutated nothing, so the over-served alpha team was neither corrected nor listed; (4) the EDF property requires declining a pool with zero finite deadlines, but EDFPolicy always returned a task (null-deadline surrogate Infinity), failing all-null pools and risking arbitrary ordering semantics; (5) scheduler-resilience-risk expected compareRisk(a=10,b=90)<0 which matches ascending semantics and contradicts the module's own docstring ("higher risk first"), the risk-model comment ("runtime loop prefers the higher-risk task"), and the live kernel.ts dispatch pre-sort ((b.risk??0)-(a.risk??0)).

## Decision

kernel.ts exports `RingPolicyStore` (class export added; `ringPolicyStore` singleton unchanged) matching the AGENTS.md Current-Reality surface. resource-quota.ts acquire(): requests exceeding current tokens but within burst capacity sleep ceil(deficit/bps*1000) ms via the injected sleep then debit (clamped at 0 tokens under frozen clocks); only requests larger than capacity emitExceeded + throw NetworkQuotaExceededError. scheduler.ts EDFPolicy.pick() skips deadline-less tasks and returns null when no finite deadlines exist; pickByPolicy() falls back to MLFQPolicy when the active policy declines a non-empty pool, keeping pickNextTask/dryRunSchedule starvation-free. FairnessTracker.correct() flags any team with |deviation| > epsilon and damped half-steps its recorded share toward entitlement*totalRaw (symmetric, convergent). compareRisk stays descending ((b.risk??0)-(a.risk??0)); scheduler-resilience-risk.test.ts expectation flipped to compareRisk(b,a)<0 citing the docstring, the risk-model comment, and kernel.ts's production pre-sort.
## Alternatives considered

**Ascending compareRisk (a.risk - b.risk) to satisfy the disk test literally**: lost — contradicts three same-repo citations of descending intent including the live dispatch pre-sort; would silently delay safety-critical work if ever used as a sort comparator. **Normalizing actualShare inside FairnessTracker.measure()**: lost for this wave — measure() is consumed by the property suite's entitlement-sum check and any future raw-unit callers; correcting in recorded units preserves measure() as a pure observer. **EDF treating null deadlines as Infinity while always returning a task, plus a kernel-side fallback**: lost — leaks EDF-specific fallback knowledge into pickNextTask; the decline+fallback belongs at the single dispatch seam (pickByPolicy) where both dryRunSchedule and the runtime loop already route through.
## Consequences

Bought: five failing files green without assertion weakening; over-quota writes now pay latency instead of throwing spuriously; fair-share correction actually converges state. Cost: EDF-under-edf-policy deadline-less tasks now dispatch via MLFQ order rather than priority-desc DB order (documented in pickByPolicy); Quill must keep comparator-direction expectations aligned with the descending contract when regenerating risk tests. ring-audit.ts untouched (not required).

