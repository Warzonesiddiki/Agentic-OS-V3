# S01 · Step 2 — Research: Repo Hygiene Precondition

> **Section:** S01 — Repo hygiene precondition
> **Sources:** current web data (cited inline) + repo verification (bash, this session)
> **Output type:** verified root-cause + inventory + recommended fix → Steps 3–10

---

## 1. The install blocker — `better-sqlite3` native build

### 1.1 Observed failure (this session)
`pnpm install --frozen-lockfile` failed during the `better-sqlite3@11.10.0` install:
1. `prebuild-install warn install unable to verify the first certificate` (TLS/MITM in sandbox).
2. Fell back to `node-gyp rebuild`, which tried to fetch
   `https://nodejs.org/download/release/v22.22.3/node-v22.22.3-headers.tar.gz`.
3. That fetch failed with `ECONNRESET` ("Client network socket disconnected before secure TLS
   connection was established") → install exits 1.

### 1.2 Root cause (verified)
This is the **classic better-sqlite3 prebuilt-binary / Node-version** problem, well-documented:

- `better-sqlite3@11.10.0` ships **prebuilt binaries for specific Node ABI versions only**. When the
  running Node has no matching prebuilt, `prebuild-install` falls back to compiling from source via
  `node-gyp`, which requires (a) a working C++ toolchain and (b) the Node headers tarball
  [1](https://github.com/openchamber/openchamber/issues/1478).
- The sandbox runs **Node 22.22.3**. The repo's own CI runs **Node 20** and explicitly adds a
  `pnpm rebuild better-sqlite3` step (`.github/workflows/ci.yml`) precisely to absorb this ABI gap.
- Multiple independent reports confirm the symptom and the fix: **aligning to the Node version with
  available prebuilts (Node 20) resolves it** [2](https://community.redwoodjs.com/t/better-sqlite3-issue/7882),
  and the official troubleshooting checklist lists Node version + node-gyp toolchain as items 1–2
  [7](https://app.unpkg.com/better-sqlite3@7.1.5/files/docs/troubleshooting.md).
- `better-sqlite3@12.x` adds newer-Node prebuilts but **drops Node 20 prebuilts**; bumping the
  version is a dependency change with broad impact and is **out of scope for a hygiene section**
  [1](https://github.com/openchamber/openchamber/issues/1478).

### 1.3 Verified fix options (ranked)

| # | Option | Risk | Faithful to repo? |
|---|---|---|---|
| 1 ⭐ | **Align local env to Node 20** (matches CI exactly; prebuilts exist for 11.x) | Low | ✅ Yes — CI already does this |
| 2 | Retry install on stable network (the `ECONNRESET` may be transient) | Low | Partial |
| 3 | Set `NODEJS_ORG_MIRROR` / header mirror so node-gyp fallback can fetch headers | Low-Med | Neutral |
| 4 | `--ignore-scripts` install + manual prebuilt extraction | Med | No |
| 5 | Bump `better-sqlite3` to `^12.0.0` | Med-High (drops Node 20 prebuilts, ABI churn) | **Out of scope for S01** |

**Recommendation:** Option **1** (Node 20, matching CI) as primary; Option **2/3** as fallback if
Node 20 is unavailable in this sandbox. **Do not** change the dependency version in S01.

> ⚠️ **Important framing for the audit:** this is primarily a **sandbox-environment constraint**
> (TLS + Node ABI), not a latent project defect — the repo's CI already mitigates it. The
> `PROGRESS_REPORT.md` and the 2026-07-24 Correct-Course proposal both record it as an
> "environment constraint." S01's job is to establish one **working local install path** for the
> Revenue Engine, not to rewrite the dependency graph.

---

## 2. Verified junk-file inventory (reference-checked)

### 2.1 Safe to delete (unreferenced scratch / output)
**Root:** `__check.cjs`, `__check.mjs`, `__check_tables.mjs`, `agent-dag-real.txt`, `dd-real.txt`,
`marketplace.service.ts` (0-byte, **unreferenced** — the real module is
`server/src/services/marketplace.service.ts`, imported by `server/src/routes/marketplace-routes.ts`
and tests), `meta.ts` (0-byte, no import found).

**`server/` scratch dumps:** `err.txt`, `eslint_cereb1.json`, `eslint_prov.json`,
`eslint_tests.txt`, `eval_out.txt`, `graph_out.txt`, `lint-out.txt`, `tsc-*.txt` (16 files),
`vitest_out.txt`.

**Temp:** `server/src/.hermes-tmp.M9XXin`, `server/tests/.hermes-tmp.1860`,
`server/tests/.hermes-tmp.X8Ohqu`.

**Empty BMAD run logs:** `_bmad-output/*.err` (7 empty files).

### 2.2 Verify-before-delete (0-byte files that *may* be imported)
`server/src/services/multimodal.ts`, `server/src/services/reliability/{chunked-transfer,event-loop-lag,graceful-drain}.ts`,
`server/tests/memory-storage.test.ts`, `src/lib/os/control-plane.ts`, `src/lib/os/control-plane.test.ts`,
`src/services/{llm-scheduler,task-worker}.ts`, `src/services/self-opt/*` (6 files),
`tests/{blockchain,desktop-actuator,enterprise,fairness-corrector,guardrails-quarantine,killswitch-race,task-worker}.test.ts`,
`tests/e2e/system.e2e.test.ts`, `tests/helpers/mock-llm.ts`, `server/scripts/lint-tests.json`.
→ Each must be `grep`-checked for imports in Step 10; **referenced empties are removed together with
their import statements** (or documented and kept), never silently deleted.

### 2.3 Findings worth flagging (beyond pure cleanup)
- **Hardcoded local-machine paths leaked into committed JSON:**
  `server/scripts/lint-clean.json` and `server/scripts/lint-tests.json` embed
  `C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3\server\...`. These are
  scratch lint dumps that leak a developer's local path and break portability. Recommend delete +
  gitignore (not secrets, but cruft + minor info-leak). Carries into S05 (threat model) as a note.

---

## 3. `.gitignore` gap analysis

Current `.gitignore` covers deps/build/db/env/logs/IDE/OS/coverage, `*.log`, `*.tmp`, etc. — but it
does **not** cover the recurring scratch patterns that produced this mess. Recommended additions
(to prevent recurrence after deletion):

```gitignore
# Lint/typecheck/test scratch output (do not commit)
server/tsc-*.txt
server/tsc*.txt
server/eslint_*.json
server/eslint_tests.txt
server/*_out.txt
server/lint-out.txt
server/err.txt
__check*.cjs
__check*.mjs
agent-dag-real.txt
dd-real.txt

# Local editor/agent temp files
**/.hermes-tmp.*
*.hermes-tmp.*

# BMAD run logs
_bmad-output/*.err
```

---

## 4. Out of scope for S01 (deferred to later sections)
- The **171-service sprawl** in `server/src/services/` — noted, not reorganized here.
- The **single squashed commit** history — attribution will instead be handled by a clean **baseline
  snapshot commit** on this branch before any engine code (per brainstorming Q3 = "GO").
- Any dependency version change (`better-sqlite3`, etc.).

---

## 5. Conclusion → feeds Steps 3–10
- **Install fix:** Node 20 (match CI) primary; retry/mirror fallback. No dep bump.
- **Cleanup:** delete §2.1 (verified unreferenced), verify-then-delete §2.2, gitignore §3.
- **Baseline:** one clean snapshot commit on `arena/019f98ab-agentic-os-v3`.
- **Proof:** install exits 0; `git status` clean of scratch; representative test run executes; no
  previously-passing test broken.

**Sources:**
[1](https://github.com/openchamber/openchamber/issues/1478) ·
[2](https://community.redwoodjs.com/t/better-sqlite3-issue/7882) ·
[7](https://app.unpkg.com/better-sqlite3@7.1.5/files/docs/troubleshooting.md)
