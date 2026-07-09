# ADR-0010: FROZEN Core / `routes.ts` Sign-off Protocol

**Status:** Accepted (ratified 2026-07-09, Lorekeeper authority; per `AGENTS.md` FROZEN list)
**Owner:** Lorekeeper (docs namespace) · **Applies to:** all 20 agents
**Supersedes:** ad-hoc "don't touch FROZEN files" notes scattered in `AGENTS.md` / `TEAM_OWNERSHIP_GOVERNANCE.md`
**Companion:** `docs/TEAM_OWNERSHIP_GOVERNANCE.md` (§4 FROZEN list), `docs/AUTONOMOUS_OPERATIONS_MANUAL_v4.0.0.md` (§7.2)

---

## 1. Context

During the autonomous relaunch, the fleet repeatedly broke the build by editing files that are part
of the **shared public-surface contract** (the "FROZEN" set). The most damaging was `server/src/routes.ts`
— the central Hono route-aggregator that imports every `routes/*.ts` module. When an agent changed a
route module's **export signature** without updating the FROZEN aggregator (or changed the aggregator
itself), the whole `server/` tree failed `tsc`. The same hazard applies to `app.ts`, `db/client.ts`,
`db/schema.ts`, `services.ts`, and the `src/lib/*` utilities.

The root cause was **namespace-exclusivity confusion**: agents treated the import target's signature
as editable, when the correct action is to **fix their own module's signature to match the existing
FROZEN caller**, never the FROZEN file.

## 2. Decision

1. The following files are **FROZEN — Leader/Forge sign-off only**. No agent edits them without
   explicit approval. They are the shared-contract surface:
   - `server/src/index.ts`, `app.ts`, `proxy.ts`, `routes.ts`, `services.ts`, `typings.d.ts`,
     `cli.ts`, `setup.ts`, `_probe_status.ts`
   - `server/src/db/client.ts`, `db/schema.ts`, `db/schema-sqlite.ts`, `db/dev-schema.ts`
   - `server/src/lib/{envelope,errors,id,hono-env,env,guards,http,zvalidator,schemas,strings,payload-limit,protocol-integration,logging,logger}.ts`
   - `src/skill-registry.ts`
2. **Import-signature rule:** if an agent's module is consumed by a FROZEN file, the agent MUST match
   the **existing** signature the FROZEN file expects. The agent edits **only its own file**; the
   FROZEN file is never touched. A mismatch is the agent's bug, not the FROZEN file's.
3. **Sign-off for genuine FROZEN changes:** if a FROZEN file _must_ change (e.g. a new route must be
   registered in `routes.ts`), the change requires **explicit Leader or Forge sign-off** and is made
   by the signing authority, not the requesting agent. The requesting agent supplies the module +
   its exact export shape; the authority wires it.
4. **Mechanical guard (Bastion, when CI lands):** `tsconfig`'s `composite`/`noEmit` gate + a
   `CODEOWNERS` rule block PRs that touch FROZEN globs without the signing owner's approval. This is
   the structural enforcement; the doc is the policy.
5. **Phantom-error rule (2026-07-09 refinement):** when running the full `tsc` gate while _other_
   agents are mid-write, errors in **another owner's** files are **phantom** (half-written reads) and
   must be ignored — never halted on, never "fixed" cross-namespace. Only errors in _your own_
   namespace after a fresh `rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false` are real.

## 3. Consequences

- Editing a FROZEN file without sign-off → immediate revert + escalate to Leader (per GO rule #6 /
  v4.0.0 §7.2). The edit is treated as a contract break, not a local fix.
- Changing a route module's export shape → update **your module**, not `routes.ts`. If `routes.ts`
  must register it, request sign-off (decision #3).
- The RROZEN list in `TEAM_OWNERSHIP_GOVERNANCE.md` §4 is the canonical enumeration; this ADR is its
  procedural ratification.

## 4. Reconciliation note (2026-07-09)

This ADR was authored during the relaunch after the `routes.ts` import-surface breakage cascaded the
gate to ~134 errors (Bastion's `tracing.ts` signature drop) and again to transient 161/46 spikes from
concurrent mid-writes. It codifies the discipline that ultimately let the fleet hold `tsc=0`: **fix
your signature, never the FROZEN caller; ignore phantoms; sign-off for real FROZEN changes.**

_End of ADR-0010._
