# Loop Engineer Skill

Production-grade autonomous coding loop skill for agentic AI systems.

## Installation

```bash
# Option 1: Using skill install command
/skill-install loop-engineer

# Option 2: Manual placement
mkdir -p .claude/skills/loop-engineer
# Copy all files to .claude/skills/loop-engineer/
```

## Invocation

```bash
# Basic usage - auto-detects profile
/loop-engineer "make all tests pass"

# With explicit profile
/loop-engineer "build a REST API with auth" --profile api_development

# With custom budget and iterations
/loop-engineer "fix all critical bugs" --budget_usd 10.00 --max_iter 30

# Full parameter example
/loop-engineer "deploy to staging" --profile deploy_pipeline --topology plan_execute --verifier maker_checker --budget_usd 20.00
```

## MCP Configuration

1. Copy `.mcp-config.json` to your project root or `.claude/` directory
2. Set required environment variables (see `mcp-registry.md` for auth requirements):
   ```bash
   export GITHUB_TOKEN="ghp_..."
   export SNYK_TOKEN="..."
   export POSTGRES_URL="postgresql://..."
   # etc.
   ```
3. Run health check: the loop will verify all required MCP servers on startup

### Critical MCP Servers (must have for any loop)
- `github` — PR/commit operations
- `filesystem` — file read/write
- `git` — version control
- `context7` — framework docs (never use training data)
- `sandbox` — secure code execution
- `snyk` — security scanning

### High-Priority Servers (profile-dependent)
- `kubernetes`, `docker` — deploy_pipeline, incident_response
- `playwright` — feature_build, api_development
- `semgrep`, `sonarqube` — security_audit, refactor
- `grafana`, `slack`, `jira` — incident_response, deploy_pipeline
- `postgres`, `sqlite` — any profile with DB work

## Budget Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `budget_usd` | $5.00 | Hard cap for entire loop run |
| `max_iter` | 20 | Maximum cycles before forced stop |
| `verifier` | deterministic | Verification strategy |

Budget is enforced at INFRASTRUCTURE layer — execution revokes BEFORE the next LLM call, not after.

## 8 Loop Profiles

| Profile | Topology | Use When |
|---------|----------|----------|
| `bug_fix` | simple | Fixing errors, failing tests, crashes |
| `feature_build` | plan_execute | New features, components, endpoints |
| `full_stack_project` | ralph | Entire apps from scratch |
| `security_audit` | nested | Vulnerability scanning, CVE hunting |
| `deploy_pipeline` | plan_execute | Production releases, rollouts |
| `api_development` | plan_execute | REST/GraphQL APIs, OpenAPI specs |
| `refactor` | ralph | Tech debt, code cleanup, DRY |
| `incident_response` | simple | Production outages, alerts firing |

### Profile Auto-Detection
The skill analyzes your goal text for trigger keywords (see `loop-profiles.md`). Explicit `--profile` overrides auto-detection.

## Reading Run Logs

After a loop completes, check these files in `.claude/skills/loop-engineer/state-templates/`:

- **STATE.md** — Final status, completed/remaining work, blockers
- **loop-run-log.md** — Append-only cycle-by-cycle record with tokens, tools, verifier results
- **loop-budget.md** — Cost breakdown per cycle, alerts fired

### Key Metrics to Review
- `cycles_completed` vs `max_iter`
- `cumulative_cost_usd` vs `budget_usd_total`
- `verifier_result` progression (should trend toward pass)
- `cycle_outcome` — why did the loop stop?

## Troubleshooting

### Oscillation (state[cycle_N] ≈ state[cycle_N-2])
- **Cause**: Agent alternating between two approaches
- **Fix**: Check `loop-run-log.md` for repeated failed actions; add explicit "never retry identical failed action" instruction

### Budget Exceeded
- **Cause**: Retrieval thrash, large tool outputs, or model reasoning loops
- **Fix**: Check `loop-budget.md` anomaly column; enable circuit breaker (3x median cycle cost); use `mcp__context7` for docs

### MCP Failure
- **Cause**: Auth expired, server down, SSRF block
- **Fix**: Health-check servers before loop; check `.mcp-config.json` env vars; see `mcp-registry.md` SECURITY_WARNING

### Verifier Keeps Failing
- **Cause**: Flaky tests, non-deterministic behavior, or verification theater
- **Fix**: Run deterministic layer first; ensure maker ≠ checker; add human_gate after 2 consecutive failures

### Loop Not Making Progress
- **Cause**: Context degradation (long sessions), scope creep, or blocked on external dependency
- **Fix**: Use `ralph` topology (fresh context every cycle); enforce one task per cycle; check `Blockers` in STATE.md

## Architecture Notes

- **Three Laws**: Loop is unit of work; Doer ≠ Verifier; Every loop killable
- **Topologies**: simple (continuous context), ralph (fresh instance/cycle), plan_execute (planner + executor), nested (sub-loops)
- **Verification Priority**: deterministic → llm_judge → maker_checker → human_gate
- **Cost Control**: Per-cycle tracking, circuit breaker at 3x median, retrieval thrash prevention

## Extending the Skill

Add new profiles to `loop-profiles.md` following the template. Register new MCP servers in `mcp-registry.md` and `.mcp-config.json`. Custom hooks go in `hooks.yaml`.