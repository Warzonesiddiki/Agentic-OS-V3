# Cost Control — Token/Dollar Governance Rules

## Production Cost Facts

- Agents consume approximately 4x more tokens than standard chat
- Multi-agent (maker-checker) systems use approximately 15x vs chat
- An uncontrolled loop ran 11 days in November 2025 and cost $47,000
- Traditional infrastructure monitoring (CPU/memory) misses token cost spirals — only per-cycle token tracking catches them

## Hard Rules (non-negotiable)

1. Set budget_usd before EVERY loop run. No exceptions.
2. Enforce token cap at INFRASTRUCTURE layer — revoke execution BEFORE the next LLM call goes out, not after it returns.
3. Track tokens PER CYCLE not just in aggregate. Aggregate tracking misses per-cycle anomalies.
4. Circuit breaker: if any single cycle costs > 3x the median cycle cost → pause loop immediately + alert.
5. Fix RAG/retrieval quality first — retrieval thrash is invisible token burn that looks like normal operation.

## Budget Initialization

At loop start, write to loop-budget.md:
- budget_usd_total: [from $ARGUMENTS.budget_usd, default $5.00]
- budget_tokens_estimated: [budget_usd / current_model_rate]
- budget_warning_threshold: 80% of total
- budget_hard_stop: 95% of total
- cycle_token_baseline: null (set after cycle 1)
- circuit_breaker_multiplier: 3x cycle_token_baseline

## Per-Cycle Budget Check

Run at the START of every PLAN phase (before execution):
1. Read loop-budget.md
2. Calculate remaining_budget = budget_usd_total - cumulative_cost_usd
3. Estimate this_cycle_cost based on planned tool calls
4. If this_cycle_cost > remaining_budget → STOP immediately
5. If cumulative_cost >= 80% threshold → warn but continue
6. If cumulative_cost >= 95% threshold → STOP
7. Update loop-budget.md with latest cumulative_cost after OBSERVE

## Retrieval Thrash Prevention

Retrieval thrash occurs when:
- First lookup misses → agent broadens query → pulls more documents
- Agent must reconcile contradictions across stale and current sources
- Every step is well-formed, billable, and invisible to monitoring

Prevention:
- Use mcp__context7 for all library/framework docs (always current)
- Limit retrieval rounds per cycle to maximum 2
- If first retrieval misses: refine query once, do not broaden
- Cache repeated context with prompt caching where supported

## Cost Anomaly Response

If circuit breaker triggers (cycle_cost > 3x median):
1. Stop execution immediately
2. Log anomaly with full cycle details
3. Analyze: what caused the spike?
   - Retrieval thrash (too many doc lookups)?
   - Unexpected tool output size?
   - Model reasoning loop (model calling same tool repeatedly)?
4. Fix root cause before resuming
5. Notify via mcp__slack if spike > $1.00 single cycle