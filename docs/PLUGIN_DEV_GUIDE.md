# Plugin Development Guide

**Last updated:** 2026-07-09 (Lorekeeper)
**Companion:** `docs/skill-registry-design.md`, `docs/AGENT_DEV_GUIDE.md`.

A **plugin** bundles skills + optional UI widgets + an agent/memory template, published to the
NEXUS marketplace (Phase 19) and executed in a **scoped WASM sandbox** (Phase 19.3).

## 1. Plugin anatomy

```
my-plugin/
  plugin.json          # manifest (name, version, capabilities, sandbox profile)
  skills/              # skill modules (see skill-registry)
  sandbox-profile.toml # resource limits, allowed syscalls
  tests/               # must ship tests (coverage gate ≥ 80%)
```

## 2. Manifest (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "capabilities": ["read:memory", "exec:skill"],
  "sandboxProfile": "restricted",
  "skills": ["./skills/translate.ts"]
}
```

Capabilities use the **same tokens** as `AgentCapability` (ADR-0008 / a2a-server) and the
SkillRegistry permission scopes — do not invent new ones.

## 3. Skill module

```typescript
import type { Skill } from '@agentic-os/skill-registry';

export const translate: Skill = {
  id: 'translate',
  description: 'Translate text between languages',
  inputSchema: {/* Zod */},
  run: async (input, ctx) => {
    /* ... */
  },
};
```

## 4. Sandbox

- Executes in the WASM sandbox (Phase 19.3) with a `sandboxProfile` from
  `server/src/.../sandbox-profiles.ts`.
- No direct filesystem/network unless the profile + capability scope allow it.
- All side effects must be declared in `AgentCapability.sideEffects`.

## 5. Publishing (Phase 19)

1. `nexus plugin publish` (CLI, Phase 16).
2. Security review queue + signing (`code signing`, 19.29).
3. Versioning/upgrade matrix enforced; dependency resolver validates compat.
4. Ratings/reviews surface in the marketplace.

## 6. Local dev

```bash
pnpm --filter server dev
nexus plugin dev ./my-plugin      # hot-reload (Phase 16.7)
```

## 7. Rules

- No `any` in shipped TS; strict mode.
- Every new module ships passing tests (coverage gate).
- Do not redefine A2A types — import from `@agentic-os/a2a-server`.
