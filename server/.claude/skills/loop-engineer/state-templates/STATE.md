# Loop State — [GOAL]

## Status
current_status: [initializing|running|paused|completed|failed|stalled]
goal: [paste measurable acceptance criteria here]
goal_achieved: false
started_at: [ISO timestamp]
last_updated: [ISO timestamp]
current_cycle: 0

## Loop Contract
profile: [bug_fix|feature_build|full_stack_project|security_audit|deploy_pipeline|api_development|refactor|incident_response]
topology: [simple|ralph|nested|plan_execute]
max_iter: [N]
budget_usd: [X.XX]
verifier: [deterministic|llm_judge|maker_checker|human_gate]
trigger: [cron|webhook|manual|agent_spawn]

## Work Queue
### Completed
- [task description] — committed: [hash] — cycle: [N] — cost: $[X.XX]

### In Progress
- [task currently executing]

### Remaining
- [task 1]
- [task 2]

## Blockers
- [describe any blocker and what was tried]

## Key Decisions Made
- Cycle [N]: chose [approach A] over [approach B] because [reason]