# Phase 11 — Sentinel Security & QA Audit (Kernel + Scheduler)

**Auditor:** Sentinel (QA/Security)
**Date:** 2026-07-09
**Scope:** `server/src/services/kernel.ts`, `server/src/services/scheduler.ts`, `server/src/lib/audit.ts`, `server/src/routes/agents.ts`, `server/tests/services/kernel.test.ts`
**Method:** Read-only source review + test verification. No code changes by Sentinel — kernel code changes are Forge's domain; this is a findings + remediation brief.
**Companion doc:** `docs/PHASE11_WORKLIST.md` (Forge's implementation status classification).

---

## Severity legend

- **BLOCKING** — exploitable security/correctness defect; fix before Phase 11 sign-off.
- **ADVISORY** — correctness/reliability gap that won't ship a breach but should be fixed.
- **HARDENING** — defense-in-depth / observability gap; schedule, non-blocking.

---

## F-1 (BLOCKING) — `checkACL` `minRing` override escalates privilege instead of denying

**File:** `server/src/services/kernel.ts` — `checkACL(agent, tool)` (~L880–L907)

```ts
const minRing = tool.minRing ?? 99;
...
if (tool.minRing !== undefined) {
  minRing = tool.minRing;          // overwrite to the tool's defined minimum
}
...
// Final check: agent ring must be >= minRing
if (minRing !== undefined && agent.ring < minRing) {
  return false;                    // deny
}
return true;                       // <-- ALLOWED otherwise
```

**Bug:** The override sets `minRing = tool.minRing`. When `tool.minRing` (e.g. `2`) is **higher** than the agent's ring (`3`, i.e. lower privilege), the final check `agent.ring < minRing` → `3 < 2` is false, so the tool is **granted**. The intent of `minRing` is "this tool requires at least ring `N`"; the code inverts it — a ring-3 agent _gains_ a ring-2-only tool.

This is a privilege **escalation**, not a denial. Any tool with a `minRing` set below the caller's ring silently becomes available.

**Aggravating factor:** `server/tests/services/kernel.test.ts` encodes this as expected:

```ts
// ring 3, tool minRing 2 -> allowed (current behavior codifies the bug)
```

So the test _locks in_ the vulnerability. The test must be inverted when the fix lands.

**Recommended remediation (Forge):**

```ts
// minRing default 0 (any agent allowed if tool sets nothing)
const minRing = tool.minRing ?? 0;
// Do NOT overwrite with tool.minRing in a way that lowers the bar.
// Final check: deny if agent ring is BELOW the tool's required minimum.
if (agent.ring > minRing) return false; // ring number: lower = more privileged
return true;
```

> Note: ring numbering is inverted (0 = most privileged). A tool requiring ring ≤ `minRing` means `agent.ring <= minRing` to be allowed. The current `agent.ring < minRing` comparator plus the override is the defect. Confirm the ring-direction semantics with Forge and write a positive (allow) + negative (deny) case.

**Test fix:** invert the ring-3/tool-minRing-2 case to expect `false`, and add a ring-1 agent / tool-minRing-2 case expecting `true`.

---

## F-2 (ADVISORY) — Priority Inheritance Protocol (PIP) is dead code

**Files:** `server/src/services/scheduler.ts` — `MLFQPolicy.agents` (~L705), `registerResource` (~L1036), `boostToHighestPriority` (~L711); `server/src/services/kernel.ts` — `resourceHeldBy`/`resourceWaiters` maps (~L1049), `inheritPriority`/`restorePriority`/`getHeldResources` (~L1052–L1084).

**Finding:**

- `MLFQPolicy.agents` is a `Map` that **no caller ever populates** (`pickByPolicy`, `enqueueTask`, `pickNextTask` never call `this.agents.set(...)`).
- `boostToHighestPriority(agentId)` iterates `this.agents.get(agentId)?.waitingOn` — always `undefined` → **no-op**.
- `SchedulerPolicy` interface declares `registerResource`/`unregisterResource`, and `MLFQPolicy` implements them, but **nothing in the kernel ever calls `registerResource`** when an agent acquires a shared resource (lock, budget token, cgroup slot).
- Therefore the `inheritPriority`/`restorePriority` chain in `kernel.ts` has no `HeldResource` inputs and never fires.

**Impact:** Priority inversion is possible — a high-priority task blocked on a resource held by a low-priority task will **not** boost the holder. Under ring budgets this can deadlock scheduling progress or cause a high-priority agent to starve behind a low-priority holder (correctness + availability, not a breach, but a Phase-11 acceptance gap since PIP is listed ALREADY_BUILT in the worklist but is not actually wired).

**Recommended remediation (Forge):** wire `registerResource(agentId, resourceId)` into the shared-resource acquisition paths (`acquireRingBudget`, cgroup co-claim, gang co-claim) and `unregisterResource` on release; populate `MLFQPolicy.agents` from the live agent registry so `boostToHighestPriority` has data. Add a regression test asserting the holder's effective priority rises while a higher-priority waiter is blocked.

---

## F-3 (HARDENING) — `callerRing` escalation guard is unreachable over HTTP

**File:** `server/src/services/kernel.ts` — `spawnAgent` privilege-escalation guard (~L56–L66).

**Finding:** The guard only triggers when `input.callerRing` is provided. The production route `server/src/routes/agents.ts` calls `kernel.spawnAgent({ body, actor: p.id })` — it does **not** pass `callerRing`. So the guard is dead on the HTTP surface; escalation protection relies entirely on the `brain:admin` scope requirement on that route.

**Assessment:** Not exploitable today (route requires `brain:admin`), but the guard is misleading — it implies defense-in-depth that doesn't exist, and any future internal caller that passes a self-supplied `callerRing` would reintroduce the exact escalation F-1 describes. Recommend either (a) **remove** the `callerRing` parameter and derive ring from authenticated actor identity, or (b) derive `callerRing` server-side from the authenticated principal, never from request input.

---

## F-4 (ADVISORY) — Audit chain is write-only; tamper-evidence is unenforced

**File:** `server/src/lib/audit.ts` — `appendAudit` (L126) builds a hash chain via `chainTip`/`entryHashAsync`. No `verifyAuditChain` read-path exists anywhere in `server/src`.

**Finding:** Entries are hash-chained on write (prevHash → entryHash), which is good, but nothing ever **verifies** the chain on read. A reader (or an attacker with DB write) can mutate/insert entries and the system will not detect it. The "tamper-evident audit" claim in `docs/SECURITY.md` is therefore currently unsubstantiated at runtime.

**Recommended remediation (Sentinel/Bastion):** add `verifyAuditChain(from?, to?)` that recomputes each `entryHash` from `prevHash..payload` and returns the first break, plus a CI/periodic job (or `GET /api/audit/verify`) that runs it. Wire a failure to the SIEM forwarder (Phase 14 modules already exist: `siem-forwarder`, `audit-analytics`).

---

## F-5 (HARDENING) — `setRingPolicy` publishes the wrong event

**File:** `server/src/services/kernel.ts` — `RingPolicyStore.set` (~L942) publishes `'ring.budget_exceeded'` on a **policy update**.

**Finding:** A ring-policy _change_ emits a `ring.budget_exceeded` event. This misleads operators/alerting and corrupts the event taxonomy. Should publish a dedicated `ring.policy_changed` event (the worklist 11.29 already flags the missing `ring_change` audit). Add the event type and publish it; route `ring.budget_exceeded` to its actual trigger site.

---

## Cross-cutting QA notes

- **Test coverage trap (F-1):** a green unit test currently _encodes a vulnerability_. `server/src/services/kernel.test.ts` must be corrected as part of the F-1 fix; otherwise `pnpm run validate` will keep the bug "correct by test."
- **No `verifyAuditChain` test** (F-4): add a test that mutates an entry's payload and asserts `verifyAuditChain` detects the break.
- **PIP regression test** (F-2): add a priority-inversion scenario test before marking PIP ALREADY_BUILT.

---

## Disposition / next steps

| Finding                 | Severity  | Owner            | Action                                      |
| ----------------------- | --------- | ---------------- | ------------------------------------------- |
| F-1 checkACL escalation | BLOCKING  | Forge (kernel)   | Fix comparator + invert test                |
| F-2 PIP dead code       | ADVISORY  | Forge (kernel)   | Wire registerResource + populate agents map |
| F-3 callerRing guard    | HARDENING | Forge (kernel)   | Derive ring server-side or drop param       |
| F-4 audit verify path   | ADVISORY  | Sentinel/Bastion | Add `verifyAuditChain` + endpoint/job       |
| F-5 wrong event         | HARDENING | Forge (kernel)   | Publish `ring.policy_changed`               |

**Sentinel recommendation:** F-1 is the only **BLOCKING** item for Phase 11 sign-off. F-2 and F-4 should be fixed before the kernel is declared production-ready. F-3/F-5 are hardening and can be batched.

_Sentinel did not modify kernel code. This brief is for Forge's implementation queue; F-4's `verifyAuditChain` is a Sentinel/Bastion item Sentinel can pick up separately._
