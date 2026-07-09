# llm-router

## Purpose
Complexity-based LLM router. `callRoutedLLM` inspects a request's complexity (`simple|medium|complex`) and
routes to the configured model tier (env-driven overrides). Pure tier resolution + async routed call.
(Cerebrum area.)

## Public exports
- `type TaskComplexity = 'simple' | 'medium' | 'complex'`.
- `interface RouterConfig`.
- `async function callRoutedLLM(req, config?): Promise<LLMResponse>`.

## Env vars
- `NEXUS_LLM_SIMPLE_MODEL`, `NEXUS_LLM_MEDIUM_MODEL`, `NEXUS_LLM_COMPLEX_MODEL`. (fall back to `NEXUS_LLM_MODEL`)

## Test file
- `server/tests/llm-router.test.ts` (complexity routing + override).
