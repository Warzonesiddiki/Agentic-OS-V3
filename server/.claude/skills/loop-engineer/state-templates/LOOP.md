# Loop Contract — [SKILL/PROJECT NAME]

## Cadence
schedule: [cron expression or "manual" or "event-driven"]
trigger_event: [webhook URL or event type if event-driven]
timezone: UTC

## Stop Conditions (ALL three required, more recommended)
goal_condition: [exact measurable acceptance criteria]
max_iterations: [N]
budget_usd: [X.XX]
timeout_hours: [N]
no_progress_cycles: 3
oscillation_detection: true

## Human Escalation Gates
Pause and notify human when:
- Verifier fails [N] consecutive times
- Any cycle costs > $[X.XX]
- Security scan returns critical findings
- Irreversible action about to be taken: [list them]
Notification channel: mcp__slack → [channel]

## MCP Servers Required
- [server_id]: [auth_env_var]

## Worktree Isolation
use_worktree: [true|false]
worktree_prefix: [loop-engineer-]

## Loop Author
author: [name]
created: [date]
last_modified: [date]