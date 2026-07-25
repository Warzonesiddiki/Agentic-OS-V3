# Section Index — Autonomous Revenue Engine & Mitosis (100 Sections)

> Generated after parameters were frozen (`parameters.md`). One section at a time,
> strict sequential pacing. A section is `COMPLETE: 100% READY` only after all 11
> BMAD steps pass, including the Step-11 adversarial code review.
> **Live status** lives in each `sections/S##/STATUS.md`.

## Status legend
`backlog` · `active` · `step-N/11` · `review` · `COMPLETE: 100% READY` · `blocked`

---

## A — Foundation & Governance (S01–S10)
*Gate for the entire engine. R1, R5.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S01 | Repo hygiene precondition | Minimal safe cleanup (install fix, scratch/empty-file removal) to unblock the engine on a clean base | — | Foundation |
| S02 | Option-C module scaffold | Isolated ledger namespace + feature flag + kill switch + CODEOWNERS | S01 | Foundation |
| S03 | ADR-0031 + naming freeze | Author ADR-0031 (Option C, reuse, 7 rules); update ADR README index | S01 | Foundation |
| S04 | Legal & regulatory research | MTL/MSB, affiliate disclosure, gig ToS, trading regs — research artifact only | S01 | R5 |
| S05 | Threat model & risk register | Money-path risks: RCE, leakage, double-spend, ceiling races | S01 | R7 |
| S06 | Strategy denylist v1 | Spam, ToS-scraping, market manipulation, unlicensed MTL/lending, deceptive AI marketing, tax/reg evasion + ambiguous→review | S04 | R5 |
| S07 | Safety-invariants harness | The 7 rules as machine-checkable invariants + test scaffolding | S02 | R1–R7 |
| S08 | Canonical-docs merge scaffolding | Land placeholders: PRD scope/NFR-REV, Arch module 5.10, Epic E11 stub | S03 | Foundation |
| S09 | Money-representation contract | USD fixed-point cents; no float money; units/currency types | S02 | R3 |
| S10 | E10-S30 gate + governance framing | Verify post-R1/Phase-21 framing in sprint-status; confirm gate | S08 | Governance |

## B — The Ledger Core (S11–S26)
*Part 2 / R7. The tamper-evident per-wallet ledger, reusing the audit pattern.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S11 | Wallet model + create API | Wallet entity + `POST /wallet` (the "create a wallet" of the proof) | S02,S09 | Part 2 |
| S12 | Ledger schema (Postgres) | `revenue_ledger` table: own sequence/prevHash/entryHash/GENESIS | S09 | Part 2/R7 |
| S13 | Ledger schema (SQLite mirror) | Dual-engine parity for the ledger table | S12 | Part 2/R7 |
| S14 | Ledger append primitive | Reuse `audit.ts` pattern: chainTip, advisory lock, computeEntryHash | S12,S13 | Part 2/R7 |
| S15 | Global-audit cross-link | Every ledger event also calls `appendAudit` (cross-linked chains) | S14 | Part 2/R7 |
| S16 | Ledger tamper-detection | Mirror `verifyAuditChain` — the "tampering is detectable" proof | S14 | Part 2/R7 |
| S17 | Balance read-back API | `GET /wallet/:id/balance` (the "read it back" of the proof) | S11,S14 | Part 2 |
| S18 | Realized vs pending vs paper | Accounting that blocks mitosis on paper/pending profit | S14 | Part 3/R4 |
| S19 | Ledger event taxonomy | earn/spend/fee/split/seed/adjust + idempotency keys | S14 | Part 2 |
| S20 | `ledger:*` scopes | ledger:read/write/admin + `requireScope` wiring | S11,S14 | R2 |
| S21 | Simulation-mode flag | Wallet defaults sim; never live without promotion | S11 | R1 |
| S22 | Replay/audit endpoints | Replay a wallet's full chain back to origin | S16 | R7 |
| S23 | Atomic append tx | ledger append + balance + audit cross-link in one tx | S15,S17 | R7 |
| S24 | Large-chain streaming verify | Paginated verify for big chains | S16 | R7 |
| S25 | Ledger tests | Unit + integration + tamper negative tests | S16,S23 | R7 |
| S26 | Category-B merge checkpoint | Fold ledger stories into canonical docs | S25 | Foundation |

## C — Strategy Framework (S27–S46)
*Part 1 / R1, R5. Pluggable strategies as sagas in the sandbox.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S27 | Strategy interface/contract | Manifest: inputs/outputs/capabilities/cost/determinism class | S02,S07 | Part 1 |
| S28 | Strategy saga wrapper | Wrap strategy in existing saga engine (steps) | S27 | Part 1 |
| S29 | Compensation/rollback | No half-finished ledger entries on partial failure | S28 | Part 1 |
| S30 | Default-deny sandbox integration | Capability manifest → WASM capability sandbox | S27 | R5 |
| S31 | Denylist gate enforcement | Strategy blocked unless it passes denylist | S06,S27 | R5 |
| S32 | Ambiguous → human review queue | Non-clearly-compliant strategies flagged, not auto-approved | S31 | R5 |
| S33 | Strategy registry | register/enable/disable/version | S27 | Part 1 |
| S34 | Simulation runner | Run strategy in sim, record ledger entries, no real money | S14,S28 | R1 |
| S35 | Outcome tracking reuse | Per-strategy win/loss via skill outcome (bayesian) | S34 | Part 1 |
| S36 | Strategy packaging + signing | Signing esp. for agent-written strategies | S27 | R5 |
| S37 | Validation gate | schema + capability bounds + denylist before registration | S31,S36 | R5 |
| S38 | Content/affiliate contract + sim | First category, fully simulated | S34 | Part 1 |
| S39 | Affiliate disclosure/ToS guards | Compliance guards within the category | S06,S38 | R5 |
| S40 | Freelance bidding contract + sim | Second category, simulated | S34 | Part 1 |
| S41 | Bid budgeting + cap integration | Bids respect spend caps | S40 | R3 |
| S42 | Trading/arbitrage contract + sim | Third category, paper only in v1 | S34 | Part 1 |
| S43 | No-leverage/no-borrow in adapter | Adapter exposes NO borrow/leverage fn (R3 by design) | S42 | R3 |
| S44 | Agent-written strategy lifecycle | sandbox + denylist + review onboarding | S37,S36 | R5 |
| S45 | Strategy framework tests | Unit + integration + adversarial | S29,S37 | R1,R5 |
| S46 | Category-C merge checkpoint | Fold strategy stories into canonical docs | S45 | Foundation |

## D — Money Movement & Caps (S47–S56)
*R2, R3. Real spend, hard caps, human custodianship.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S47 | Spend/withdraw primitive | Cap-checked **before** money moves | S23,S48 | Part 2 |
| S48 | Hard per-action spend cap | Enforced pre-move | S09 | R3 |
| S49 | Hard per-day spend cap | Enforced pre-move | S48 | R3 |
| S50 | No-shrink-to-fit | Reject outright, never auto-reduce | S47 | R3 |
| S51 | No-leverage/no-borrow by design | No borrow/leverage fn exists anywhere | S43 | R3 |
| S52 | Custodial credential model | Human-owned accounts; narrow/short-lived/capped creds | S20 | R2 |
| S53 | Payment-adapter abstraction | bank/PayPal/exchange/crypto — sandboxed, capability-gated | S52 | R2 |
| S54 | Reconciliation | Ledger vs external account statement | S47 | R7 |
| S55 | Payment-failure handling | Compensating moves on failure | S29,S47 | R3 |
| S56 | Category-D tests + merge | Caps + custody tests; merge checkpoint | S55 | R2,R3 |

## E — Learning & Selection (S57–S63)
*R1. Favor winners, still try underdogs.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S57 | Strategy scoring | ROI/win-rate/variance from realized outcomes | S35 | Part 1 |
| S58 | Weighted/bandit selection | Favor winners + exploration of underdogs | S57 | Part 1 |
| S59 | Exploration budget guard | Experiments never blow caps | S58 | R3 |
| S60 | Simulation track-record ledger | Per-strategy history | S34 | R1 |
| S61 | Promotion evidence requirements | Profitable-sim thresholds to be promotion-eligible | S60 | R1 |
| S62 | Cold-start policy | New-strategy seeding | S58 | Part 1 |
| S63 | Category-E tests + merge | Selection tests; merge checkpoint | S62 | R1 |

## F — Mitosis Protocol (S64–S79)
*Part 3 / R1, R4, R6, R7. Split capital + spawn clones.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S64 | Realized-profit computation | Wallet realized P&L (not paper/pending) | S18 | Part 3/R4 |
| S65 | $100 threshold check | Configurable realized-profit threshold | S64 | Part 3 |
| S66 | Split-rule engine | Configurable split (default 50/50) | S65 | Part 3 |
| S67 | Clone-spawn via kernel spawn | Ring 3, parent/child recorded | S02,S66 | Part 3 |
| S68 | Atomic split + seed wallet | Split ledger entries + spawn in one tx | S66,S67 | Part 3/R7 |
| S69 | Simulation auto-mitosis | Full autonomy in sim (no money at risk) | S68 | R4 |
| S70 | Live signed-approval gate | Mitosis pauses for signed human approval | S68 | R4 |
| S71 | Promotion-to-live signing | sim→live requires signed approval | S61,S70 | R1 |
| S72 | Ceiling: max total clones | R6 | S67 | R6 |
| S73 | Ceiling: max generation depth | R6 | S67 | R6 |
| S74 | Ceiling: max total capital | R6 | S66 | R6 |
| S75 | Ceiling enforcement: refuse + alert | Never fail silent / spawn anyway | S72,S73,S74 | R6 |
| S76 | At-ceiling wallets keep earning | Stop reproducing, keep working | S75 | R6 |
| S77 | Clone lineage & provenance | Parent chain back to origin | S68 | R7 |
| S78 | Mitosis auditability | Hash-chained clone events, replay | S77 | R7 |
| S79 | Category-F tests + merge | Mitosis + ceiling tests; merge checkpoint | S78 | R4,R6,R7 |

## G — Cross-Agent Knowledge Sharing (S80–S87)
*R7. Clones benefit from parent's learnings; no central controller.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S80 | Parent/child + sibling sync contract | What syncs, how often | S67 | Part 3 |
| S81 | Reuse cross-node recall | "Which strategies work" propagation | S80 | R7 |
| S82 | Reuse signed-RPC | Authentic clone communication | S80 | R7 |
| S83 | Strategy-success signal schema | The shared payload | S81 | Part 3 |
| S84 | Privacy/isolation | No wallet secrets leaked across clones | S83 | R2 |
| S85 | Merge/conflict handling | Reconcile shared learnings | S83 | Part 3 |
| S86 | Peer-to-peer only | No central controller dictates actions | S82 | Part 3 |
| S87 | Category-G tests + merge | Sync tests; merge checkpoint | S86 | R7 |

## H — CLI / Agent Integration (S88–S93)
*The CLI AI connects here.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S88 | MCP tool surface | `nexus_revenue_*`: wallet/ledger/run-strategy/status | S20,S34 | Integration |
| S89 | REST API | `/api/v1/ledger/*`, `/api/v1/revenue/*` | S88 | Integration |
| S90 | Scope/auth + kill switch | ledger scopes + engine kill switch | S20,S02 | R2 |
| S91 | CLI-agent connect/onboarding | Existing CLI agent connects to the engine | S88 | Integration |
| S92 | Revenue observability/metrics | OTEL spans + dashboard | S89 | R7 |
| S93 | Category-H tests + merge | Integration tests; merge checkpoint | S92 | Integration |

## I — Hardening, Audit & Release (S94–S100)
*R7 / Release. Production-ready, zero compromise.*

| ID | Title | Scope (1 line) | Depends | Part/Rule |
|---|---|---|---|---|
| S94 | Adversarial security review | All money paths reviewed | S56,S79 | R7 |
| S95 | End-to-end audit-replay verify | Any clone → origin, tamper-proof | S78,S95 | R7 |
| S96 | Chaos/failure injection | Partial failures, double-spend, ceiling races | S79 | R4,R6 |
| S97 | Golden-path E2E | earn → cap → mitosis → share → replay | S93,S96 | Release |
| S98 | Documentation | ops, safety, denylist governance, runbook | S97 | Release |
| S99 | Release gate | Feature flag default-off, kill-switch drill, sim soak | S97,S98 | Release |
| S100 | Post-release monitoring + retro | Monitoring + BMAD retrospective | S99 | Release |

---

**Totals:** A=10 · B=16 · C=20 · D=10 · E=7 · F=16 · G=8 · H=6 · I=7 → **100 sections**.
**First buildable proof** (founding spec): wallet + ledger + tamper-detection = **S11 → S17 + S16**.
