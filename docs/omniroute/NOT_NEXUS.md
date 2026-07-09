# ⚠️ NOT PART OF NEXUS 2.0 / AGENTIC OS V3

This directory (`docs/omniroute/`) is a **vendored third-party project** and is **NOT** part of
NEXUS 2.0 or Agentic OS V3.

- **Project:** **OmniRoute** — an independent LLM routing proxy by **diegosouzapw**
  (separate npm packages: `@omniroute/open-sse`, `@omniroute/cli`, `@omniroute/opencode-provider`;
  own CLI: `omniroute serve` / `omniroute plugin install`).
- **Why it is here:** it was embedded into this repository as a reference/upstream source. It is
  kept isolated under `docs/omniroute/` precisely so it does NOT get mistaken for NEXUS code or
  documentation.
- **NEXUS's own routing module** is `server/src/services/omniroute-bridge.ts` — a small adapter
  that shares the _name_ only. It is unrelated to this vendored doc set.

## Security review notice

> **REMOVED (2026-07-09).** Sentinel delivered the REMOVE verdict (zero-compromise) and deleted
> `docs/omniroute/security/` — the 13 third-party security-circumvention files (MITM-TPROXY-DECRYPT,
> STEALTH_GUIDE, SOCKET_DEV_FINDINGS, PUBLIC_CREDS, SUPPLY_CHAIN, EGRESS_POLICY, CLI_TOKEN,
> GUARDRAILS, ERROR_SANITIZATION, COMPLIANCE, ROUTE_GUARD_TIERS, meta.json) are **gone from the
> tree**. The supply-chain finding (Phase 14.20) is **closed**. If a future upstream sync ever
> re-introduces `docs/omniroute/security/` with such material, Sentinel's standing verdict is
> REMOVE — do not follow, ship, or wire any of those techniques into NEXUS.

## Rules

- Do NOT import, link, or cite `docs/omniroute/` as NEXUS documentation.
- Do NOT assume anything here reflects NEXUS architecture, APIs, or policy.
- Treat as read-only upstream reference. Changes belong upstream in the OmniRoute project.

See `docs/README.md` (External Vendored References) for the canonical pointer.
