# NEXUS V3 — Phase 0 Execution Plan
## Foundation Audit & Stabilization (Weeks 1-2)
## Ultra-Detailed. Every Command. Every File. Every Recovery Procedure.

> **Purpose:** This document is the executable specification for Phase 0. A low-level AI can follow these instructions step-by-step with zero ambiguity. Every step includes: exact command, expected output, failure detection, and recovery procedure.

> **Phase 0 Goal:** Understand exactly what exists, what works, and what's broken. Produce a complete inventory of server code, frontend code, database schema, API routes, and configuration files.

---

## TASK 0.0: Prerequisites & Environment Setup
**Time estimate:** 30 minutes
**Dependencies:** None (first task)
**Failure mode:** Missing tools → install before proceeding

### Step 0.0.1: Verify toolchain installed
Run this command and verify all return version numbers:
```powershell
node --version; if ($?) { npm --version; if ($?) { npx --version; if ($?) { git --version } } }
```

**Expected output:**
```
v20.x.x (must be >= 18.0.0)
10.x.x (must be >= 9.0.0)
10.x.x (must be >= 9.0.0)
git version 2.x.x
```

**Recovery if missing:**
1. `node --version` fails → Install Node.js 20+ from https://nodejs.org/ then re-run
2. `npm --version` fails → `npm install -g npm@latest` then re-run
3. `git --version` fails → Install Git from https://git-scm.com/ then re-run

### Step 0.0.2: Verify PostgreSQL running
```powershell
psql --version; if ($?) { psql -U postgres -c "SELECT 1;" }
```

**Expected output:**
```
psql (psql) 16.x
  ?column?
----------
         1
(1 row)
```

**Recovery if PostgreSQL not running:**
1. Check if Docker is available: `docker ps`
2. If Docker available: `docker compose up -d postgres` (from project root)
3. If no Docker: Install PostgreSQL 16 locally, start the service

### Step 0.0.3: Verify Redis running
```powershell
redis-cli ping
```

**Expected output:**
```
PONG
```

**Recovery if Redis not running:**
1. Via Docker: `docker compose up -d redis`
2. Or install locally and start service

### Step 0.0.4: Navigate to project root
```powershell
Set-Location -LiteralPath "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3"
```

**Expected output:** No error.

---

## TASK 0.1: Compile Server — Full Audit
**Time estimate:** 2-4 hours
**Dependencies:** Task 0.0 (env setup)
**Failure modes:** TypeScript errors, missing modules, path resolution failures

### Step 0.1.1: Install server dependencies
```powershell
Set-Location -LiteralPath "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3\server"
npm install
```

**Expected output:** `npm install` completes with 0 errors. May show warnings (ignore warnings).

**Recovery if fails:**
1. `npm ERR!` → Check if `package.json` exists: `Test-Path -LiteralPath "package.json"`
2. If missing → ensure you're in the server directory
3. If present → `npm cache clean --force; npm install`
4. If still fails → `npm install --legacy-peer-deps`
5. Document the exact error in `phase-0-issues.md`

### Step 0.1.2: Generate Drizzle migrations
```powershell
npx drizzle-kit generate
```

**Expected output:** Migration files generated in `server/drizzle/` directory.

**Recovery if fails:**
1. Check `drizzle.config.ts` exists: `Test-Path -LiteralPath "drizzle.config.ts"`
2. If missing → create it pointing to `./src/db/schema.ts`
3. Document the error

### Step 0.1.3: Push Drizzle schema to DB
```powershell
npx drizzle-kit push
```

**Expected output:** Tables created in PostgreSQL database.

**Recovery if fails:**
1. Check DB connection string in `.env` file
2. Ensure PostgreSQL is running
3. Check that database name matches
4. Document the error

### Step 0.1.4: First compilation attempt
```powershell
npx tsx --version; if ($?) { npx tsc --noEmit }
```

**Expected output:** List of TypeScript errors (there will be many). Save ALL output:
```powershell
npx tsc --noEmit 2>&1 | Out-File -FilePath "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\ts-errors-server.txt" -Encoding utf8
```

**What to look for in output:**
- Count total errors: `(tsc output) | Measure-Object -Line`
- Categorize errors by type: missing imports, type mismatches, path aliases, undefined variables
- Count errors per file

**Recovery procedure:**
1. Create the audit directory first: `New-Item -ItemType Directory -Path "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit" -Force`
2. If `tsc --noEmit` produces > 50 errors → this is expected, move to Step 0.1.5
3. If `tsc --noEmit` produces 0 errors → excellent, document as "clean compilation"

### Step 0.1.5: Attempt to start server (to find runtime errors)
```powershell
npx tsx src/index.ts 2>&1
```

This will likely error. Let it run for 5 seconds then Ctrl+C. Save the output:
```powershell
$start = Get-Date; $timeout = 10; $process = Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "tsx src/index.ts" -PassThru -RedirectStandardError "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\server-runtime-errors.txt"; Start-Sleep -Seconds $timeout; if (!$process.HasExited) { $process.Kill() }
```

### Step 0.1.6: Catalog every server file
For each file in `server/src/`, record:
1. File path
2. Line count
3. Key exports (list all exported functions/classes/types)
4. Import dependencies (what other modules does it import)
5. Potential issues (hardcoded values, incomplete implementations, TODO comments)

Create this as a structured JSON file:

```powershell
$serverFiles = @{}
Get-ChildItem -Path "server/src" -Recurse -Filter "*.ts" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $lines = ($content -split "`n").Count
    $exports = [regex]::Matches($content, '(?<=export\s+(?:const|function|class|interface|type|default\s+(?:class|function|const)))\s+\w+') | ForEach-Object { $_.Value.Trim() }
    $imports = [regex]::Matches($content, '(?<=from\s+[''"])([^''"]+)') | ForEach-Object { $_.Value }
    $todos = [regex]::Matches($content, '(TODO|FIXME|HACK|XXX)') | ForEach-Object { $_.Value }
    $serverFiles[$_.FullName.Replace($PWD.Path, '')] = @{
        lines = $lines
        exports = $exports
        imports = $imports
        todos = $todos
    }
}
$serverFiles | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\server-file-inventory.json" -Encoding utf8
```

### Step 0.1.7: Identify the 13 "existing features"
Search for feature markers in all files:
```powershell
$root = "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3"
$featurePatterns = @(
    "agent", "memory", "skill", "knowledge", "tool",
    "workflow", "pipeline", "chat", "dashboard", "audit",
    "schedule", "cron", "webhook", "auth", "api.key",
    "sandbox", "plugin", "connector", "integration",
    "recall", "search", "embedding"
)
$featureFiles = @{}
foreach ($pattern in $featurePatterns) {
    $matches = Get-ChildItem -Path $root -Recurse -Include "*.ts","*.tsx" | Select-String -Pattern $pattern -CaseSensitive -SimpleMatch
    $featureFiles[$pattern] = $matches | Group-Object Path | ForEach-Object { $_.Count }
}
$featureFiles | ConvertTo-Json | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\feature-coverage.json" -Encoding utf8
```

---

## TASK 0.2: Compile Frontend — Full Audit
**Time estimate:** 2-4 hours
**Dependencies:** Task 0.0 (env setup)
**Failure modes:** TypeScript errors, missing modules, path alias resolution

### Step 0.2.1: Install frontend dependencies
```powershell
Set-Location -LiteralPath "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3"
npm install
```

**Expected output:** `npm install` completes with 0 errors.

**Recovery if fails:** Same as Step 0.1.1 recovery.

### Step 0.2.2: First frontend compilation attempt
```powershell
npx tsc --noEmit 2>&1 | Out-File -FilePath "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\ts-errors-frontend.txt" -Encoding utf8
npx vite build 2>&1 | Out-File -FilePath "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\vite-build-errors.txt" -Encoding utf8
```

**Expected output:** TypeScript errors and Vite build errors. Save ALL output.

**What to look for:**
- `tsc` exit code (0 = clean, 1+ = errors)
- Vite build success/failure
- Count errors per file
- Identify the most common error type

### Step 0.2.3: Catalog every frontend file
Same as Step 0.1.6 but for `src/` directory:
```powershell
$feFiles = @{}
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $lines = ($content -split "`n").Count
    $feFiles[$_.FullName.Replace($PWD.Path, '')] = @{
        lines = $lines
        exports = [regex]::Matches($content, '(?<=export\s+(?:const|function|class|interface|type|default\s+(?:class|function|const)))\s+\w+') | ForEach-Object { $_.Value.Trim() }
        apis_called = [regex]::Matches($content, '(?<=fetch\(|axios\.|api\.)\s*[''"])([^''"]+)') | ForEach-Object { $_.Value }
    }
}
$feFiles | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\frontend-file-inventory.json" -Encoding utf8
```

---

## TASK 0.3: Map All API Routes
**Time estimate:** 4-6 hours
**Dependencies:** Task 0.1 (server audit)
**Failure modes:** Manual parsing complexity

### Step 0.3.1: Extract route definitions from server
Read every route definition from `server/src/routes.ts` and `server/src/routes/*.ts`:
```powershell
$routeFiles = @("server/src/routes.ts", "server/src/routes/agents.ts", "server/src/routes/automation.ts", "server/src/routes/sse.ts")
$allRoutes = @()
foreach ($file in $routeFiles) {
    if (Test-Path -LiteralPath $file) {
        $content = Get-Content $file -Raw
        $routeMatches = [regex]::Matches($content, '(app\.(?:get|post|put|patch|delete|options))\s*\(\s*[''"])([^''"]+)(?:[''"])(?:.*?(?:,\s*(.+?))?\))')
        foreach ($match in $routeMatches) {
            $allRoutes += @{
                method = $match.Groups[1].Value.Replace('app.', '').ToUpper()
                path = $match.Groups[2].Value
                file = $file
            }
        }
    }
}
$allRoutes | ConvertTo-Json | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\server-routes.json" -Encoding utf8
```

### Step 0.3.2: Extract API calls from frontend
```powershell
$apiCalls = Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" | Select-String -Pattern "(?:fetch|axios\.get|axios\.post|axios\.put|axios\.delete|api\.\w+)\([''`"])(\/api\/[^''`"]+)" | ForEach-Object {
    [PSCustomObject]@{
        File = $_.Filename
        Line = $_.LineNumber
        Path = $_.Matches.Groups[2].Value
        FullLine = $_.Line.Trim()
    }
}
$apiCalls | ConvertTo-Json | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\frontend-api-calls.json" -Encoding utf8
```

### Step 0.3.3: Build route coverage matrix
Compare frontend API calls vs server routes. For each frontend API call, check if a matching server route exists (same method + path). Output:
```
Route Coverage Matrix:
  Total server routes: X
  Total frontend API calls: Y
  Matched: Z (Z/Y %)
  Missing server routes: [list of routes frontend calls but server doesn't have]
  Unused server routes: [list of routes server has but frontend never calls]
```

Create this report:
```powershell
# Read the two JSON files
$serverRoutes = Get-Content "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\server-routes.json" | ConvertFrom-Json
$frontendCalls = Get-Content "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\frontend-api-calls.json" | ConvertFrom-Json

# Analyze coverage
$report = @{
    totalServerRoutes = $serverRoutes.Count
    totalFrontendCalls = $frontendCalls.Count
    matched = @()
    missing = @()
    unused = @()
}
# Compare... (detailed comparison logic)
$report | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\route-coverage.json" -Encoding utf8
```

---

## TASK 0.4: Map All Database Tables
**Time estimate:** 2-3 hours
**Dependencies:** Task 0.1 (server audit)
**Failure modes:** Schema differences between dev-schema.ts and schema.ts

### Step 0.4.1: Extract Drizzle schema definitions
Read both schema files and extract table definitions:
```powershell
$schemaContent = Get-Content "server/src/db/schema.ts" -Raw
$devSchemaContent = Get-Content "server/src/db/dev-schema.ts" -Raw

# Extract table names and their columns
$tables = @{}
$tablePattern = 'export const (\w+) = .*?pgTable\([''"](\w+)[''"],\s*\{([^}]+)\}'
$matches = [regex]::Matches($schemaContent, $tablePattern)
foreach ($match in $matches) {
    $tsName = $match.Groups[1].Value
    $dbName = $match.Groups[2].Value
    $columnsText = $match.Groups[3].Value
    # Parse columns (simplified)
    $tables[$tsName] = @{
        dbName = $dbName
        columns = @()  # would need detailed parsing
    }
}
$tables | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\db-schema-inventory.json" -Encoding utf8
```

### Step 0.4.2: Compare dev-schema vs production schema
```powershell
$diffReport = @{
    commonTables = @()
    onlyInProd = @()
    onlyInDev = @()
    columnDifferences = @()
}
# Compare the two schemas...
$diffReport | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\schema-diff.json" -Encoding utf8
```

### Step 0.4.3: Verify DB tables actually exist in PostgreSQL
```powershell
$envContent = Get-Content "server/.env" -Raw
# Extract connection string
$connString = [regex]::Match($envContent, 'DATABASE_URL=(.+)').Groups[1].Value.Trim()
# Query tables
psql -d "$connString" -c "\dt" 2>&1 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\actual-db-tables.txt" -Encoding utf8
```

Compare actual tables vs Drizzle schema tables. Flag any discrepancies.

---

## TASK 0.5: Discover & Document All 13 Existing Features
**Time estimate:** 4-6 hours
**Dependencies:** Tasks 0.1, 0.2, 0.3, 0.4
**Failure modes:** None (this is documentation)

### Step 0.5.1: Read handover documentation
Read the key handover documents to understand what features exist:
```powershell
Get-Content "HANDOVER.md" | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\handover-summary.md" -Encoding utf8
Get-Content "README.md" | Select-Object -First 200 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\readme-summary.md" -Encoding utf8
```

### Step 0.5.2: Define the 13 features with exact file mappings
Based on code analysis and documentation, enumerate all 13 features. For EACH feature, document:
1. **Feature name** (short, descriptive)
2. **Server files** involved (exact paths)
3. **Frontend files** involved (exact paths)
4. **DB tables** used
5. **API routes** (exact method + path)
6. **Status** (Working / Partial / Broken / Not started)
7. **What's missing** (specific gaps)

Use this template for each feature:
```markdown
### Feature N: [Name]
| Field | Value |
|---|---|
| Server files | `server/src/services/...`, `server/src/routes/...` |
| Frontend files | `src/pages/...`, `src/lib/...` |
| DB tables | `table1`, `table2` |
| API routes | `GET /api/...`, `POST /api/...` |
| Status | Working / Partial / Broken |
| Gaps | [specific things that need fixing] |
```

### Step 0.5.3: Output the feature inventory
```powershell
# Create structured feature inventory
$features = @(
    @{ name = "Agent Runtime"; status = "Unknown"; serverFiles = @("server/src/services/agent-runtime.ts"); frontendFiles = @(); notes = "Core agent engine" },
    @{ name = "Memory System"; status = "Unknown"; serverFiles = @("server/src/services/recall.ts"); frontendFiles = @("src/lib/recall.ts"); notes = "Episodic/semantic memory" },
    @{ name = "Skills System"; status = "Unknown"; serverFiles = @("server/src/services/skill-compiler.ts"); frontendFiles = @(); notes = "Neural skill compilation" },
    @{ name = "Audit Trail"; status = "Unknown"; serverFiles = @("server/src/services/audit-engine.ts","server/src/services/audit-worker.ts"); frontendFiles = @("src/pages/Audit.tsx"); notes = "Immutable append-only audit" },
    @{ name = "Knowledge Base"; status = "Unknown"; serverFiles = @(); frontendFiles = @("src/pages/Sessions.tsx"); notes = "RAG/knowledge management" },
    @{ name = "Chat Interface"; status = "Unknown"; serverFiles = @(); frontendFiles = @("src/pages/Sessions.tsx"); notes = "Agent chat UI" },
    @{ name = "Dashboard"; status = "Unknown"; serverFiles = @(); frontendFiles = @("src/pages/Dashboard.tsx"); notes = "Main overview" },
    @{ name = "LLM Gateway"; status = "Unknown"; serverFiles = @("server/src/services/llm.ts","server/src/services/llm-client.ts","server/src/services/llm-router.ts"); frontendFiles = @(); notes = "Multi-provider LLM" },
    @{ name = "Sandbox"; status = "Unknown"; serverFiles = @("server/src/services/sandbox.ts"); frontendFiles = @(); notes = "Docker/WASM sandbox" },
    @{ name = "Hermes Connector"; status = "Unknown"; serverFiles = @("server/src/connectors/hermes.ts"); frontendFiles = @(); notes = "Hermes agent integration" },
    @{ name = "Scheduler"; status = "Unknown"; serverFiles = @("server/src/services/task-worker.ts","server/src/routes/automation.ts"); frontendFiles = @(); notes = "Cron/scheduling" },
    @{ name = "Auth/Security"; status = "Unknown"; serverFiles = @("server/src/lib/security.ts","server/src/lib/tokens.ts","server/src/lib/verify.ts"); frontendFiles = @(); notes = "Auth, API keys, guards" },
    @{ name = "Settings"; status = "Unknown"; serverFiles = @(); frontendFiles = @("src/pages/Settings.tsx"); notes = "Configuration UI" }
)
$features | ConvertTo-Json -Depth 3 | Out-File "C:\Users\Tahir\OneDrive\Desktop\v3-expansion\audit\feature-inventory.json" -Encoding utf8
```

---

## TASK 0.6: Initial Fixes — Quick Wins
**Time estimate:** 4-8 hours
**Dependencies:** All previous Task 0 tasks
**Failure modes:** New errors introduced by fixes

### Step 0.6.1: Fix path aliases in tsconfig
Check if path aliases match Vite aliases:
```powershell
$tsconfig = Get-Content "tsconfig.json" -Raw | ConvertFrom-Json
$viteConfig = Get-Content "vite.config.ts" -Raw
Write-Host "tsconfig paths:"
$tsconfig.compilerOptions.paths
Write-Host "vite resolve.alias:" 
# Extract alias from vite config
```

**Fix if mismatched:**
- Ensure `@/*` maps to `./src/*` in both tsconfig.json AND vite.config.ts
- Ensure `@shared/*` maps to `./shared/*` in both

### Step 0.6.2: Fix low-hanging TypeScript errors
Categorize and fix errors by type:
1. **Missing imports** — add the import statement
2. **Wrong path aliases** — fix the path in tsconfig or the import
3. **Type mismatches** — fix the type or add `as` cast
4. **Undefined variables** — add the definition or import
5. **Unused variables** — prefix with `_` or remove

For each fix, document:
```
Error: [exact error message]
File: [file path]
Fix: [what was changed]
```

### Step 0.6.3: Create .env file if missing
```powershell
Copy-Item -Path "server/.env.example" -Destination "server/.env" -Force
# Edit .env to set correct values for local dev
```

### Step 0.6.4: Verify docker-compose.yml is valid
```powershell
docker compose config 2>&1
```

---

## TASK 0.7: Document All Findings
**Time estimate:** 2-3 hours
**Dependencies:** All previous tasks
**Failure modes:** None

### Step 0.7.1: Create the Phase 0 report
Create `C:\Users\Tahir\OneDrive\Desktop\v3-expansion\00-PHASE-0-REPORT.md` with:
1. **Executive Summary** — 3-5 bullet points on overall state
2. **Server Status** — compiles? errors? critical issues?
3. **Frontend Status** — compiles? errors? critical issues?
4. **DB Schema Status** — dev vs prod differences? tables exist?
5. **Route Coverage** — % matched, missing routes, unused routes
6. **Feature Status** — table of all 13 features with status
7. **Critical Issues** — top 10 things blocking Phase 1
8. **Quick Wins** — simple fixes that can be done immediately
9. **Next Steps** — what Phase 1 should prioritize

### Step 0.7.2: Tag all issues for Phase 1
Create a structured issue list:
```markdown
# Phase 1 Issue Queue
## Priority P0 (Blocks everything)
1. [Description] — File:Path — Fix: [approach]
2. ...

## Priority P1 (Major functionality)
...

## Priority P2 (Nice to have)
...
```

---

## ERROR RECOVERY QUICK REFERENCE

| Error Pattern | Likely Cause | Recovery |
|---|---|---|
| `Cannot find module '@shared/...'` | Path alias not configured | Update tsconfig paths + vite alias |
| `Cannot find module 'drizzle-orm/...'` | Missing dependency | `npm install drizzle-orm` |
| `Type 'X' is not assignable to type 'Y'` | Type mismatch | Fix type or use type assertion |
| `Property 'X' does not exist on type 'Y'` | Missing interface field | Add field to interface |
| `Cannot start server: EADDRINUSE` | Port conflict | Kill existing process or change port |
| `Cannot connect to PostgreSQL` | DB not running | Start PostgreSQL |
| `Relation "X" does not exist` | Migration not run | `npx drizzle-kit push` |
| `npm ERR!` | Dependency issue | `npm cache clean --force; npm install --legacy-peer-deps` |
| Build fails with 100+ errors | tsconfig strict mode issues | Add `// @ts-nocheck` temporarily to complex files, fix incrementally |

## SUCCESS CRITERIA FOR PHASE 0 COMPLETION

- [ ] All toolchain versions verified and documented
- [ ] Server `npm install` succeeds
- [ ] Frontend `npm install` succeeds
- [ ] TypeScript errors cataloged with count per category and per file
- [ ] Vite build tested, errors documented
- [ ] All API routes extracted from server
- [ ] All API calls extracted from frontend
- [ ] Route coverage matrix produced
- [ ] All DB tables extracted from Drizzle schema
- [ ] Dev vs production schema diff documented
- [ ] Actual DB tables verified in PostgreSQL
- [ ] All 13 features identified with exact file mappings
- [ ] Quick-win fixes applied and documented
- [ ] Phase 0 report written to `00-PHASE-0-REPORT.md`
- [ ] Issue queue prioritized for Phase 1

---

## DO NOT SKIP

Do NOT attempt to fix everything in Phase 0. Phase 0 is AUDIT ONLY + QUICK WINS. Major fixes happen in Phase 1.

Do NOT delete or rename files without documenting them first.

Do NOT modify the Drizzle schema in Phase 0 — just document it.

If any step takes > 2 hours, stop and document what's blocking progress.
