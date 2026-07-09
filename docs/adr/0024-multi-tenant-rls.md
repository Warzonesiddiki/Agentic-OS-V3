# ADR-0024: Multi-Tenant Row-Level Security (RLS)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Helix (owner), Sentinel, Mnemosyne, Leader
- Supersedes: ADR-0002 (Database Choice)

## Context

Phase 17 enterprise requires hard isolation between tenants (OIDC/SAML, RBAC,
billing, multi-tenant). A single shared schema with app-level `WHERE tenant_id = ?`
filters is error-prone — one missed filter leaks data. We need **enforced**
isolation at the data layer, not just by convention.

## Decision

Multi-tenancy is enforced via **row-level scoping** in the data + query layers:

- **Schema:** Drizzle tables in `db/schema.ts` carry a `tenantId` column on every
  tenant-scoped entity (memories, projects, agents, audit, skills, plugins,
  marketplace, self-opt, orgs/workspaces).
- **Query scoping:** `enterprise.service.ts` is the tenant-context authority; it
  injects the caller's `tenantId` into queries and validates it against the
  resolved session (OIDC/SAML → RBAC → tenant). Cross-tenant access requires an
  explicit `enterprise:` capability + Helix mesh federation approval.
- **Federation:** Helix `p2p-swarm` + `federated-recall.ts` (ADR-0012) consult
  remote member nodes only when the caller holds federation capability; otherwise
  the tenant boundary is absolute.
- **Isolation guarantees:** tenant id is set per-request from the verified session,
  never trusted from client input; the recall/audit paths re-assert `tenantId` so a
  forgotten filter still cannot cross tenants.
- **Billing:** per-tenant usage is metered from the same `tenantId` fact
  (`enterprise.service.ts` + Metron metrics).

## Consequences

- Tenant isolation is enforced by construction (session-derived `tenantId` injected
  at the query boundary + re-asserted in recall/audit), drastically reducing
  cross-tenant-leak risk versus app-level filters alone.
- Federation is opt-in and capability-gated, so mesh mode does not weaken the
  default isolation.
- Every tenant-scoped table change must add the `tenantId` column — a schema
  convention enforced in review (Bastion CODEOWNERS + Quill merge gate).
- Tests: `enterprise.service.test.ts` covers tenant scoping, cross-tenant rejection,
  and federation-capability gating.
- Operational note: a missing `tenantId` on a new table is a compile/runtime
  violation caught by the schema lint in CI (ADR-0027).
