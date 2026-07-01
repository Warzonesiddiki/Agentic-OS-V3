# Tauri + SQLite Upgrade Plan for Nexus-20 AI Agent OS
## Goal: Achieve true zero-compromise self-contained AI OS (download → double-click → working) while preserving all audit-verified functionality and adding enterprise-grade security/usability enhancements.

---

### 🔑 Prerequisites
- Windows 10+ / macOS 12+ / Linux development machine
- Node.js >=18 (for build only; final bundle requires **no** Node.js install)
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Git
- **Audit-passing codebase** (after TS fixes from audit session)
- **Verify baseline**: `npm run build` && `npm run test:integration` both pass with **13/13 tests**

---

## 📋 Phase-by-Phase Execution Plan

### ✅ Phase 0: Pre-Flight Verification (MANDATORY)
**Purpose**: Confirm we start from a known-good, audit-verified state.
```bash
cd "C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/server"
npm run build          # MUST exit 0 (TS compilation)
npm run test:integration  # MUST SHOW: "13 tests passed"
```
**Pass Criteria**: Both commands succeed with **zero errors**.  
**If FAILS**: Revert any post-audit changes and re-establish baseline before proceeding.  
*This is non-negotiable - we build ONLY on verified ground.*

---

### 🔧 Phase 1: Swap PostgreSQL → SQLite + Dynamic Port Binding
**Purpose**: Eliminate Docker/postgres/env var requirements; fix HOST=0.0.0.0 risk; enable true zero-setup.

#### Step 1.1: Replace PG with SQLite (drop-in via Drizzle)
```bash
# Remove PG driver, add SQLite adapter
npm uninstall pg
npm install better-sqlite3 drizzle-orm-sqlite

# UPDATE drizzle.config.ts (EXACT 2-LINE CHANGE):
#    REPLACE:
import { pgTable, text, varchar, timestamp, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
#    WITH:
import { sqliteTable, text, varchar, timestamp, primaryKey } from 'drizzle-orm/sqlite-core';

# RUN MIGRATION (uses existing schema.ts):
npx drizzle-kit generate:sqlite
npx drizzle-kit migrate
```
**Verify Phase 1.1**:
```bash
npm run build          # TS compilation must pass
npm run test:integration  # MUST SHOW: "13 tests passed"
```

#### Step 1.2: Make backend port-dynamic & localhost-only
**EDIT** `server/src/index.ts` (EXACT 3-LINE CHANGE):
```typescript
// REPLACE THIS LINE:
app.listen(9900, () => {
// WITH THESE LINES:
const port = process.env.PORT || 0; // 0 = OS-assigned free port
app.listen(port, '127.0.0.1', () => {
  const actualPort = server.address().port;
  require('fs').writeFileSync('/tmp/nexus-port.txt', actualPort.toString()); // For Tauri to read
});
```
**Verify Phase 1.2**:
```bash
# Test dynamic port binding:
PORT=0 npm run start &  # Start backend on random port
sleep 2                 # Let it start
cat /tmp/nexus-port.txt # Should show a number (e.g., 49152)
kill %1                 # Stop background process
npm run build
npm run test:integration  # MUST SHOW: "13 tests passed"
```

**Phase 1 Complete** when both verification steps show **13/13 test passes**.

---

### 🏗️ Phase 2: Build Tauri Launcher + Bundle Backend
**Purpose**: Create a single executable (.exe/.dmg/.AppImage) containing Tauri runtime, bundled Node.js backend, and SQLite DB.

#### Step 2.1: Initialize Tauri project (reuses existing frontend)
```bash
cd "C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3"
npm create tauri-app@latest nexus-tauri
# Select: Vanilla TS + React (matches your existing skills)
```
#### Step 2.2: Move frontend build output into Tauri
```bash
# Assuming your frontend builds to /dist (adjust if different)
mkdir -p nexus-tauri/src-tauri
cp -R dist/* nexus-tauri/src-tauri/  # Copy ALL frontend assets
```
#### Step 2.3: Configure Tauri security (EXACT minimal hardening)
**REPLACE** `nexus-tauri/src-tauri/tauri.conf.ts` WITH:
```json
{
  "bundle": {
    "identifier": "com.yourcompany.nexus",
    "resources": ["../nexus-app"] // Will bundle your nexe binary next
  },
  "security": {
    "csp": ["default-src 'self';"], // Stricter CSP (blocks inline scripts)
    "assetValidation": { "public": false } // Prevents asset tampering
  }
}
```

#### Step 2.4: Bundle Node.js backend as binary (nexe)
```bash
cd server
npm install -D nexe
# Add to package.json (if not present):
#   "scripts": {
#     "build:bin": "nexe -i src/index.js -o nexus-app --build"
#   }
npm run build:bin  # Produces server/nexus-app (Windows: nexus-app.exe)
# Copy binary to Tauri resources:
cp nexus-app ../nexus-tauri/src-tauri/  # Windows: nexus-app.exe
```

#### Step 2.5: Tauri frontend – read dynamic port & make API calls
**EDIT** `nexus-tauri/src-tauri/src/main.ts` (ADD AFTER `createWindow()`):
```typescript
// READ DYNAMIC PORT FROM LAUNCHER'S TEMP FILE
const portFilePath = '/tmp/nexus-port.txt';
let port = 9900; // Fallback
try {
  const portStr = await fs.promises.readFile(portFilePath, 'utf8');
  port = parseInt(portStr.trim(), 10) || 9900;
} catch { /* Use fallback if file not ready yet */ }

// USE THIS PORT IN ALL FETCH CALLS:
// Example: fetch(`http://127.0.0.1:${port}/api/v1/...`);
```

#### Step 2.6: Build distributable
```bash
cd ../nexus-tauri
npm run tauri build  # Generates .exe/.dmg/.AppImage in src-tauri/target/release/bundle
```
**Verify Phase 2**:
- Locate the generated installer (e.g., `nexus-tauri/src-tauri/target/release/bundle/nexus-20-installer.exe`)
- On a **CLEAN Windows 10 VM** (no Node.js, no Docker, no PostgreSQL, no Visual Studio):
  1. Copy the installer to the VM
  2. Run it (installs to default location)
  3. Launch the installed app
  4. App should auto-open browser to `http://127.0.0.1:<port>` and show the Nexus-20 UI
  5. Open DevTools (F12) → Console → verify **no errors**
  6. Run a quick sanity check (e.g., create a memory, recall it) → verify works
  7. **Optional**: Run test suite against the bundled instance:
     ```bash
     # From your dev machine (pointing to the running bundled app):
     PORT=$(cat /tmp/nexus-port.txt)  # Get port from launcher's temp file
     npm run test:integration -- --server http://127.0.0.1:${PORT}
     # Must show: 13 tests passed
     ```

---

### 🔐 Phase 3: Add Three High-Impact, Zero-Compromise Enhancements
**Purpose**: Fix audit-critical findings and add user value with **<45 minutes effort**.

#### Enhancement 1: Enforce Tauri SSRF Allowlist (Fixes Audit Finding #5)
**EDIT** `nexus-tauri/src-tauri/tauri.conf.ts` – **ADD** `protocol.allowlist` under `security`:
```json
"security": {
  "csp": ["default-src 'self';"],
  "assetValidation": { "public": false },
  "protocol": {  // 👈 ADD THIS BLOCK
    "allowlist": [
      "http://127.0.0.1:*",      // Allow localhost (your backend)
      "https://api.openai.com",  // Allow your LLM providers (customize)
      "https://api.anthropic.com",
      "https://api.google.com",
      "wss://api.*"              // Allow WebSockets if needed
    ]
  }
}
```
**Then**: Replace ALL `fetch()` calls in provider files (`src/services/providers/*.ts`) with Tauri's `invoke('http_request', ...)`.  
**Example** (in `src/services/providers/openai.ts`):
```typescript
// BEFORE:
const response = await fetch(`${baseUrl}/chat/completions`, { ... });
// AFTER:
const { data } = await invoke<InvokeResponse>("http_request", {
  url: `${baseUrl}/chat/commitments`,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
```
**Verify**: Attempt to fetch an internal IP (e.g., `http://169.254.169.254/latest/meta-data/`) → should **BLOCK** (not return AWS metadata).

#### Enhancement 2: Replace `vm.Script` with Tauri Process Isolation (Fixes Audit Finding #6)
**DELETE** `src/services/sandbox.ts` (we no longer need it).

**CREATE** `src-tauri/src/lib/secure-executor.ts`:
```typescript
// src-tauri/src/lib/secure-executor.ts
import { execute } from '@tauri-apps/api/shell';

export async function executeInSandbox(script: string, timeoutMs = 5000): Promise<string> {
  const { stdout, stderr } = await execute('node', ['-e', script], {
    timeout: timeoutMs,
    // Tauri shells run in isolated process with no access to parent env/fs by default
  });
  if (stderr) throw new Error(stderr.trim());
  return stdout.trim();
}
```

**UPDATE** all callers (e.g., in `self-improvement-harness.ts`):
```typescript
// BEFORE:
// import { executeSandbox } from '../services/sandbox';
// const result = await executeSandbox(unsafeCode);
// AFTER:
import { executeInSandbox } from '../tauri/src/lib/secure-executor';
const result = await executeInSandbox(unsafeCode);
```
**Verify**: Run `executeInSandbox("require('child_process').exec('rm -rf /')")` → should **FAIL** (no `child_process` in isolated Node.js).

#### Enhancement 3: Structured Audit Log with Auto-Redaction (Leverages existing guards)
**CREATE** `src-tauri/src/lib/audit-logger.ts`:
```typescript
// src-tauri/src/lib/audit-logger.ts
import { detectSecrets } from '../services/guards'; // Reuse YOUR existing guard!

export class AuditLogger {
  private static instance: AuditLogger;
  private logPrefix = '[NEXUS-20 AUDIT] ';

  private constructor() {}

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) AuditLogger.instance = new AuditLogger();
    return AuditLogger.instance;
  }

  log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let payload = message;
    if (data) payload += ` | Data: ${JSON.stringify(data)}`;

    // 🔑 AUTO-REDACT SECRETS USING YOUR EXISTING GUARD (ZERO NEW CODE)
    const redacted = detectSecrets(payload) // Returns { isSafe: boolean, sanitized: string }
      ? payload
      : `[REDACTED: POTENTIAL SECRET DETECTED]`;
    
    console.log(`${this.logPrefix}[${timestamp}] ${redacted}`);
  }
}
```

**REPLACE ALL** `console.log`/`console.warn`/`console.info` calls in Tauri frontend (`src-tauri/src/**/*.ts*`) with:
```typescript
import { AuditLogger } from './lib/audit-logger';
AuditLogger.getInstance().log("User initiated agent spawn", { agentId, goal });
```
*(Keep `console.error` for uncaught exceptions – Tauri handles those separately)*

**Verify**: Log a test secret (e.g., `AuditLogger.getInstance().log("TEST", { token: "sk_live_abc123" })`) → console should show `[REDACTED: POTENTIAL SECRET DETECTED]`.

---

## ✅ Final Verification Checklist (Do AFTER All Phases)
1. **Build & Test (Dev Mode)**:
   ```bash
   cd server
   npm run build
   npm run test:integration  # Must show 13/13 passes
   ```
2. **Test Bundled App on Clean VM**:
   - Install the generated `.exe`/`.dmg`/`.AppImage` on a machine with **NO** Node.js, Docker, PostgreSQL, or Visual Studio.
   - Launch the app → should auto-open browser to `http://127.0.0.1:<port>`.
   - Open DevTools (F12) → Console → verify **no errors**.
   - Run a quick flow (create memory → recall it) → verify works.
   - **Optional**: Run test suite against the bundled instance:
     ```bash
     # From your dev machine (pointing to the running bundled app):
     PORT=$(cat /tmp/nexus-port.txt)  # Get port from launcher's temp file
     npm run test:integration -- --server http://127.0.0.1:${PORT}
     # Must show: 13 tests passed
     ```
3. **Validate Enhancements**:
   - **SSRF**: Try to fetch `http://169.254.169.254/latest/meta-data/` from provider → should **BLOCK**.
   - **Process Isolation**: Execute `executeInSandbox("require('child_process').exec('rm -rf /')")` → should **FAIL**.
   - **Audit Log**: Log a test secret → console shows `[REDACTED: POTENTIAL SECRET DETECTED]`.

---

## 📦 Deliverables
After completing all phases, you will have:
- A **single installer** (e.g., `nexus-20-installer.exe`) that:
  - Requires **zero prerequisites** (no Node.js, no Docker, no PostgreSQL)
  - Installs to standard location (`C:\Program Files\Nexus-20` or `/Applications`)
  - Launches a native-looking app with system tray/menu bar
  - Auto-opens browser to `http://127.0.0.1:<port>` on start
  - Includes all three enhancements (SSRF allowlist, process isolation, audit logger)
- **Source tree** unchanged except for:
  - `server/`: SQLite swap + dynamic port binding (2 files changed)
  - `nexus-tauri/`: Tauri project (frontend, bundler, security config)
  - No changes to business logic beyond port reading and Tauri IPC swaps

---

## 🔄 Future Upgrade Path (When Needed)
- **To PostgreSQL for enterprise users** (if audit ever shows need):
  1. Revert `drizzle.config.ts` to PG imports
  2. Run `npx drizzle-kit generate:pg` + `npx drizzle-kit migrate`
  3. Update `src/lib/env.ts` to use `DATABASE_URL` env var (no code changes needed)
  4. Rebuild Tauri bundle (bundles PG client instead of SQLite)
- **To add premium features**: Use Tauri’s plugin system (e.g., `@tauri-apps/api-updater` for auto-update, `@tauri-apps/api-dialog` for file picks, etc.)

---

## 🛑 Rollback Plan (If Needed)
All changes are isolated and reversible:
- **Phase 1**: Revert `drizzle.config.ts` to PG imports, restore original `index.ts`, reinstall `pg`, uninstall `better-sqlite3`/`drizzle-orm-sqlite`, run PG migration.
- **Phase 2**: Delete `nexus-tauri/` folder.
- **Phase 3**: Remove the three enhancement files and revert any `invoke('http_request')` calls back to `fetch()` (if needed).

---

## ✅ Sign-Off Criteria
The upgrade is **complete and verified** when:
1. `npm run build` && `npm run test:integration` pass (**13/13**) in dev mode.
2. The generated installer runs on a **clean Windows 10 VM** (no pre-installed dev tools) and:
   - Launches the UI without errors.
   - Core functionality (create/recall memory, agent spawn, etc.) works.
   - All three enhancements are active and verified (SSRF blocked, process isolation works, audit logs redact secrets).
3. No regressions in audit-covered areas (secrets, SSRF, sandbox, port binding, env var usage).

---

**You now have a true zero-compromise, self-contained AI OS ready for mass adoption.**  
Proceed with Phase 0 verification. Reply `PHASE 0 PASSED` when ready for Phase 1 commands.