# Deprecation Policy

**Last updated:** 2026-07-09 (Lorekeeper)
**Scope:** APIs, CLI flags, config keys, persona cards, skill/plugin manifests, ADRs.

## 1. Principles

- **No silent removals.** Anything shipped to a consumer (external agent, SDK user, operator)
  gets a deprecation window before removal.
- **Two-release notice.** A feature deprecated in release N is eligible for removal in N+2, never
  earlier. Emergency security removals are the only exception (documented in the post-mortem).
- **Single source of truth.** Deprecations are recorded here and linked from the relevant ADR
  and `CHANGELOG`/`RELEASE_NOTES`.

## 2. Lifecycle states

| State        | Meaning                            | Action required                          |
| ------------ | ---------------------------------- | ---------------------------------------- |
| `active`     | Supported                          | None                                     |
| `deprecated` | Still works, scheduled for removal | Warn in logs + docs; migration note      |
| `removed`    | Gone                               | Must have been `deprecated` ≥ 2 releases |

## 3. Process

1. **Propose:** open an ADR or task noting the deprecation + rationale +替代 (replacement).
2. **Announce:** add a `DEPRECATED` marker in code/docs, emit a runtime warning (not an error),
   and update this policy's register (§5).
3. **Migrate:** provide a codemod or migration guide where feasible.
4. **Remove:** only after the 2-release window; update ADRs and the `CHANGELOG`.

## 4. Special cases

- **Persona cards** (`PERSONA_REGISTRY.md`): rename requires Leader sign-off; deprecate the old
  `id`, keep alias for 2 releases.
- **A2A envelope** (`@agentic-os/a2a-server`, ADR-0008): wire-format changes need a new envelope
  version + dual-read window; never break external agents mid-flight.
- **Config keys** (`CONFIG_REFERENCE.md`): renamed keys keep the old name as an alias for 2
  releases with a warning.

## 5. Deprecation register

| Item       | Deprecated in | Removal in | Replacement |
| ---------- | ------------- | ---------- | ----------- |
| (none yet) | —             | —          | —           |

## 6. Emergency removal

Security-critical flaws may be removed early. Such removals MUST be:

- time-boxed,
- audit-logged,
- followed by a post-mortem referencing this policy.
