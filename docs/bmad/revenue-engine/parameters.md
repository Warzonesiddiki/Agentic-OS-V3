# Initial Project Parameters — FROZEN

> Frozen 2026-07-25 from `MASTER_PROJECT_PLAN.md` §6. User confirmed via "CONTINUE"
> (all defaults accepted). Any change after this point requires a BMAD Correct-Course
> proposal and a version bump recorded in `shared/merge-checkpoint-log.md`.

| # | Parameter | Value |
|---|---|---|
| 1 | **Project Name** | Autonomous Revenue Engine & Mitosis (working name) |
| 2 | **Epic / ADR / Phase** | Epic **E11** · ADR **0031** · Phase **21** |
| 3 | **Core Idea** | An isolated module of Agentic-OS-V3 that lets the CLI AI earn money autonomously via pluggable strategies, tracked in a tamper-evident per-wallet ledger, with capital splitting + agent cloning above $100 realized profit; simulation-first, human-gated for real money, hard-capped, denylist-gated. |
| 4 | **Tech Stack** | Reuse Agentic-OS-V3: TS/Hono server, Drizzle over Postgres+SQLite, React/Vite dashboard. New code as an **isolated module (Option C)** behind a feature flag + kill switch. Integrate via MCP + REST. Reuse existing audit/saga/WASM-sandbox/kernel/scopes. |
| 5 | **CLI AI identity** | The **existing** OS CLI agent (`server/src/cli.ts` + MCP) |
| 6 | **First strategy category** | **Content / affiliate** (lowest risk for simulation) |
| 7 | **Currency / unit** | **USD**, fixed-point integer cents (no floating-point money) |
| 8 | **Fleet ceilings (R6)** | max **50** clones · max **5** generations deep · max **$10,000** total capital |
| 9 | **Non-goals (v1)** | No crypto custody; no real exchange API keys in v1; no leverage/margin/credit (impossible by design per R3) |

**Reuse contract (non-negotiable):** hash-chain → `server/src/lib/audit.ts`
(`appendAudit`, `verifyAuditChain`, `computeEntryHash`, `GENESIS_HASH`); saga/compensation
→ existing saga engine; sandbox → existing WASM capability sandbox (default-deny); agent
spawn → existing kernel spawn (Ring 0–4); scopes → `requireScope` + new `ledger:*` scopes.

**Governance gate:** post-R1 / Phase 21, gated behind `E10-S30`, not release-blocking for R1.
