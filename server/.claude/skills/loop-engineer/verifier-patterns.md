# Verifier Patterns — Verification Architecture

## The Verifier Law

The model that did the work must never grade its own output. This is not a model limitation — it is a structural one. The doer and the checker must always be separated. /goal in Claude Code enforces this under the hood: a fresh model decides if the loop is done, not the one that did the work.

## Pattern 1: Deterministic Verification

**When to use**: ALWAYS as the first layer. Non-negotiable default.
**How**: Run test suite, linter, type checker, security scanner
**Pass condition**: exit code 0, zero errors, zero critical vulns
**Implementation**: mcp__sandbox → run pytest|jest|eslint|tsc|snyk
**Cost**: lowest. **Trust**: highest.

Example pass condition: "pytest returns exit 0 with 0 failures, eslint returns 0 errors, snyk returns 0 critical vulnerabilities"

## Pattern 2: LLM-as-Judge

**When to use**: After deterministic passes, for quality/style/architecture
**How**: Separate LLM instance with different system prompt grades output against explicit rubric
**Pass condition**: Judge scores >= 4/5 on all rubric dimensions
**Rubric dimensions**: [correctness, maintainability, security, consistency_with_codebase, test_coverage]

**Anti-pattern**: Using the same model instance or same system prompt as the creator — this is verifier theater, not verification

**Cost**: medium. **Trust**: medium.

## Pattern 3: Maker-Checker (Subagent Split)

**When to use**: Complex features, full-stack projects, production changes

**How**:
- Maker agent: implements with goal-oriented instructions
- Checker agent: reviews with adversarial instructions — told explicitly to find problems, not approve work, trust tests over its own read of the diff, and block on any concern
- Checker sees: the diff, the test results, the acceptance criteria
- Checker does NOT see: the maker's reasoning or conversation history

**Pass condition**: Checker explicitly outputs APPROVED with no blockers
**Cost**: high (2x model calls per cycle). **Trust**: high.

## Pattern 4: Human Gate

**When to use**: Irreversible actions (production deploy, delete data, send communications), budget threshold crossed, critical security findings, 3+ consecutive failed verifications

**How**: pause loop → notify via mcp__slack with full context → wait for human approval → resume or abort based on response

Never use as default — it defeats autonomous operation. Use selectively at critical decision points only.

**Cost**: variable. **Trust**: highest.

## Verification Selection Logic

1. Is there a deterministic test/scan/lint? → USE IT FIRST (always)
2. Passes deterministic? → Is this complex feature or production change?
   - YES → add llm_judge or maker_checker layer
   - NO → accept result and continue loop
3. Is this irreversible or crosses budget threshold?
   - YES → add human_gate
4. Has same cycle failed verification 2+ times?
   - YES → stop, report, escalate — do not keep looping on same failure

## Anti-patterns (never do these)

- **Self-verification**: agent grades its own output with same context
- **Empty verification**: claiming "I reviewed the code" without running tests
- **Single-tool verification**: using only linter with no functional tests
- **Trusting agent's "done" self-report**: without running acceptance criteria
- **Skipping verification to save tokens**: verification failures are 100x cheaper than production incidents