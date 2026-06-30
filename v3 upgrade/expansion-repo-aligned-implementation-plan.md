# NEXUS V3 Expansion — Repo-Aligned Implementation Plan

> This document supersedes the greenfield assumptions in `expansion-complete-with-code.md` for the live repository `Warzonesiddiki/Agentic-OS-V3`.

## Rule 1: Do not overwrite existing working modules

The current repo already contains real server and frontend code. Therefore:

- Treat `server/src/index.ts`, `server/src/app.ts`, `server/src/lib/env.ts`, `server/src/db/client.ts`, `server/src/db/schema.ts`, `server/src/services/task-worker.ts`, `server/src/services/llm.ts`, `server/src/services/llm-client.ts`, `server/src/services/llm-router.ts`, `src/store.ts`, and `src/lib/remote.ts` as existing production modules.
- Add V3 features as small patches or new modules that integrate with the current code.
- Use `/api/v1/*` envelope routes unless deliberately adding a new API namespace.

## Immediate patch set

Apply these before any new feature work:

1. Patch `server/src/lib/guards.ts` for IPv6 SSRF and vault absolute-path rejection.
2. Patch `server/src/lib/logging.ts` to avoid import-time env dereference.
3. Patch `server/src/db/schema.ts` to avoid importing `../lib/env.js` in Drizzle schema.
4. Patch `server/tests/sandbox.test.ts` timeout test.
5. Patch `server/tests/bus.test.ts` unused unsubscribe variable.
6. Run all validation gates.

See `REPO_DEEP_AUDIT_AND_FIX_PLAN.md` for exact code.

## V3 Feature Integration Strategy

### Multi-LLM Gateway

Do not replace `server/src/services/llm.ts`. Extend it:

- Add `model?: string` to `LLMRequest`.
- Make `callLLM()` use `req.model || env.NEXUS_LLM_MODEL`.
- Make `llm-router.ts` pass selected tier model.
- Include `contextText` in the user message.
- Add provider registry behind the existing API.

### Task Worker

Do not replace `server/src/services/task-worker.ts`. It already exists and starts at boot.

Patch only:

- Add metrics around task execution.
- Add stronger retry/backoff if needed.
- Add tests for HITL resume and stale-task requeue.

### Observability

`server/src/services/metrics.ts` already exists.

Patch:

- Add global Hono middleware in `server/src/app.ts` to increment request counters and duration histograms.
- Add task worker metrics.
- Add LLM provider metrics.

### Frontend Remote Mode

`src/store.ts` already has local/remote routing.

Patch:

- Stop swallowing remote errors.
- Add toast/error reporting.
- Move toward authoritative async remote writes.

### Plugin SDK / Marketplace / Pipelines / Voice

These are genuinely new areas. Add them as new folders/modules:

- `packages/nexus-sdk/`
- `server/src/services/plugin-manager.ts`
- `server/src/services/marketplace.ts`
- `server/src/services/pipeline-engine.ts`
- `server/src/services/voice.ts`
- `src/pages/Marketplace.tsx`
- `src/pages/PipelineBuilder.tsx`
- `src/pages/VoiceConsole.tsx`

But only after the current repo gates are green.
