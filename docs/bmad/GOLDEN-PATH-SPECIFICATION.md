# R1 Golden Path Specification (Zero-Compromise)
**Campaign:** BMAD-50SUB-2026-07-21  
**Subagents Responsible:** 13-Golden-Path-Definer + 16-PRD-Journeys-Detailer + 50-BMAD-Workflow-Executor-Simulator + 24-Measurement-Metrics-Definer

## Exact 14-Step Golden Path (R1)

**Preconditions**
- Clean project directory
- NEXUS initialized (local mode)
- At least one model provider configured (or lexical-only mode)
- Small bounded tool allowlist active (read-file, write-file with approval, constrained-shell)

**Step 1: Initialize Project**
- Command / UI: "Initialize project 'agentic-os-demo'"
- System: Creates project with stable ID, local storage, default policy, capability inventory.
- Evidence: Project record + initial audit entry
- Acceptance: Project visible in dashboard, local-only badge shown

**Step 2: Capture Initial Context**
- User pastes or selects 3-5 key project files
- System creates 5-8 provenance-backed memories (type=reference + fact)
- Evidence: Memory records with source hashes

**Step 3: Start Governed Task**
- Goal: "Refactor the authentication module to use the new token service. Add tests."
- Memory mode: scoped recall (budget 1800 tokens)
- Capabilities: read-file, write-file (approval), run-tests (constrained)
- System: Creates durable task (idempotency key), emits queued event

**Step 4: Recall + Planning**
- Agent runtime performs recall → receives 6 relevant memories
- Agent produces plan (visible in task timeline)
- Step recorded with memory IDs used

**Step 5: First Risky Action Proposed**
- Agent proposes: write-file to `src/auth/token.ts`
- System: Creates approval request (risk=high, action_hash=..., policy_version)
- Task enters `waiting_approval`
- UI: Approval inbox shows exact diff + risk reason

**Step 6: Human Approval**
- Developer reviews, approves
- System: Records decision, re-validates hash + kill-switch + policy
- Task transitions to running
- Receipt created for approval

**Step 7: Execute Write + Checkpoint**
- Tool executes inside project root allowlist
- Receipt created (tool, args_hash, outcome)
- Checkpoint written before next step
- Audit entry appended

**Step 8: Second Action (Read + Analyze)**
- Agent reads 2 more files (low risk — auto-allowed)
- New step + memory update candidate created

**Step 9: Test Execution (Constrained)**
- Agent requests constrained test run
- Sandboxed execution, receipt recorded
- Results fed back into task

**Step 10: Failure Injection (Simulated in test)**
- In acceptance: Worker killed mid-step
- System recovers from last checkpoint
- No duplicate side effect (verified via receipt)

**Step 11: Final Outcome**
- Task reaches `completed`
- Evidence package assembled (timeline + all IDs)
- Candidate skill/memory proposed (requires review)

**Step 12: Evidence Inspection**
- Developer opens task → Evidence tab
- Full correlated view: memories used, approvals, receipts, traces

**Step 13: Export Dry-Run**
- User triggers export
- System produces versioned package with redaction summary
- Import validation tested (dry-run)

**Step 14: Mark Useful + Close**
- Developer marks recall results "useful"
- Feedback recorded
- Project state remains clean and auditable

## Measurable Success Criteria (Subagent 24)
- End-to-end completion without data repair: 100% on golden fixture
- Approval pause before any side effect: 100%
- Recovery from worker death at 3+ checkpoints: no duplicate effects
- Recall usefulness feedback loop exercised
- Full evidence package exportable and re-importable without loss of provenance

**This specification is the single source of truth for R1 implementation and testing.**
