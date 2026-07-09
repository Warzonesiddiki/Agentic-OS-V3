# llm-scheduler

## Purpose
Multi-tenant LLM request scheduler + cost/rate accounting. Prioritised queue (`interactive | background |
maintenance`), per-user rate limits + token budgets, model-route overrides, a ticking scheduler, and a
cost log. `schedule(req)` enqueues; `dequeue`/`complete`/`fail` drive execution; `getStatus`/`getMetrics`/
`getCostLog` report. (Cerebrum area.)

## Public exports (selected)
- `type SchedulerPriority`, `const PRIORITY_ORDER`, `type TaskCategory`, `interface ModelRoute`.
- `interface ScheduledRequest`, `enqueue`, `dequeue`, `peek`, `cancelRequest`.
- `async function schedule(req)`, `cancel(userId, requestId)`, `complete(requestId, ...)`, `fail(requestId, error)`.
- `function getStatus()`, `getMetrics()`, `getUserStatus(userId)`.
- `function setRateLimit`, `setTokenBudget`, `setModelRoutes`, `registerRateLimitProfile`.
- `function startScheduler(intervalMs?)`, `stopScheduler`, `resetScheduler`.
- `function getCostLog(filter?)`, `getUserCost(userId)`.

## Env vars
- `NEXUS_LLM_SIMPLE_MODEL` / `_MEDIUM_MODEL` / `_COMPLEX_MODEL` (model-route overrides).

## Test file
- `server/tests/llm-scheduler.test.ts` (enqueue/priority, schedule/complete, budgets, cost log).
