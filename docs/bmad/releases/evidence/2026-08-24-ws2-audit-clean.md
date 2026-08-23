# WS2 Dependency Audit — Clean Result — 2026-08-24

**Blocker:** B2 (production dependency advisories).
**Command:** `pnpm@9.15.0 audit --prod` on Windows, portable Node v22.23.2, lockfile regenerated after fixes.
**Result: AUDIT EXIT 0 — "No known vulnerabilities found".**

## Remediation applied (commit `ab38fb7`, verified by this re-audit)

| Advisory | Severity | Fix |
|---|---|---|
| fast-uri host confusion (GHSA-7p8r-x3mc-p8w7), vulnerable ≥3.0.0 <3.1.5 | high | override `^3.1.5` (previous ^3.1.4 override was itself inside the vulnerable range) |
| ip-address octal-decode SSRF (GHSA-mwp4-54f8-5fhr), ≤10.3.0 | high | override `^10.3.1` |
| ip-address CIDR/NAT64 moderates | moderate | same override |
| hono ReDoS / memo() SSRF / complexity DoS / proxy-header (×3 moderate, 1 low), <4.12.34 | moderate+low | direct dep bumped `^4.6.14` → `^4.12.34` |

Preliminary (pre-fix) output retained at `2026-08-24-ws2-pnpm-audit-prod-preliminary.txt`.

## Notes

- Non-fatal peer warnings remain (react 18.3 vs a dev-tool wanting ≥19.2.7; @vitest/coverage-v8 vs vitest 3.2.6) — dev-dependency surface, not production advisories; tracked for post-R1 housekeeping.
- Typecheck true gate (`tsc --noEmit --incremental false`) re-run post-bump: EXIT 0.
- Full suite after dependency refresh: **243/255 files pass · 2508/2548 tests pass · 12 failed files** (down from 27 this morning, 67 at baseline).
