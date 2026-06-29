# Skill Registry Design — NEXUS 2.0
**Author:** Artisan  
**Status:** Draft v1.0 — pending Atlas MASTER_SPEC §3  
**Date:** 2026-06-29

---

## 1. SkillRegistry API Surface

```typescript
// Core interface
interface SkillRegistry {
  // Discovery
  list(category?: SkillCategory): Promise<SkillManifest[]>;
  inspect(skillId: string): Promise<SkillDetail>;
  search(query: string, filters?: SearchFilters): Promise<SkillManifest[]>;

  // Invocation
  invoke<TInput, TOutput>(
    skillId: string,
    input: TInput,
    ctx: InvocationContext
  ): Promise<SkillResult<TOutput>>;

  // Lifecycle (admin)
  register(manifest: SkillManifest, adapter: SkillAdapter): void;
  deregister(skillId: string): void;
  reload(skillId?: string): Promise<void>;
}

// Input/output types
interface InvocationContext {
  capabilityToken: CapabilityToken;
  sessionId: string;
  agentId: string;
  scope: PermissionScope[];
}

interface SkillResult<T> {
  ok: boolean;
  value?: T;
  error?: ErrorEnvelope;
  executionMs: number;
  sideEffectsLogged: SideEffect[];
}
```

**Key design decisions:**
- Manifest-first: the registry is a catalogue of manifests; the adapter is a pluggable implementation.
- Capability token carried in context — not stored in registry.
- Side effects are logged in result, not suppressed — transparency over hidden state.

---

## 2. Capability Manifest Schema

```yaml
skillId: string              # e.g. "file.read"
version: string             # semver
name: string
description: string
category: SkillCategory      # enum below
inputs:
  type: object
  properties: ...
  required: [...]
outputs:
  type: object
  properties: ...
sideEffects:
  - effect: SideEffectType   # enum: file.write, net.send, env.mutate, etc.
    blastRadius: string      # human-readable risk description
    reversible: boolean
requiredPermissions:
  - permission: string       # e.g. "fs:read", "net:outbound"
    scope: string[]          # e.g. ["*.txt", "/workspace/**"]
sandbox: SandboxConfig
rateLimit:
  requestsPerMinute: number
  burst: number
failureMode: FailureMode     # enum: fail-closed, fail-open, degrade
examples:
  - name: string
    input: object
    expectedOutput: object
changelog:
  - version: string
    date: string
    note: string
```

---

## 3. Skill Categories & Default Sandboxes

| Category | Symbol | Default Sandbox | Examples |
|---|---|---|---|
| `read` | 📖 | No write, no exec, no net | `file.read`, `web.search`, `memory.search` |
| `write` | ✏️ | No exec, no net, scoped dir | `file.write`, `memory.store` |
| `exec` | ⚙️ | No net, no env, timeout 30s | `code.run`, `bash`, `eval` |
| `comms` | 📡 | Outbound only, allow-list hosts | `send_message`, `webhook.call` |
| `state` | 💾 | Read/write on state store only | `memory.read`, `memory.write` |
| `admin` | 🔐 | Lead-only, full scope | `task.create`, `agent.spawn` |

**Sandbox config per category:**
```yaml
read:
  allowWrite: false
  allowExec: false
  allowNet: false
  maxFileSize: 10MB

write:
  allowWrite: true
  writeScope: ["$WORKSPACE/**"]   # resolved at runtime
  allowExec: false
  allowNet: false

exec:
  allowExec: true
  timeout: 30s
  maxMemory: 512MB
  allowNet: false
  allowEnv: false

comms:
  allowNet: true
  allowedHosts: ["$ALLOWED_HOSTS"] # from config
  allowInbound: false
```

---

## 4. Permission Model

### 4.1 Capability Tokens
Agents present a `CapabilityToken` at invocation time. Tokens are minted by Sentinel based on agent role.

```typescript
interface CapabilityToken {
  issuer: "sentinel";
  subject: string;           // agentId
  issuedAt: number;
  expiresAt: number;
  scopes: PermissionScope[];
}

interface PermissionScope {
  permission: string;        // "fs:read"
  resources: string[];       # ["$WORKSPACE/**", "*.md"]
}
```

### 4.2 Allow-lists
- **File access:** scoped to `$WORKSPACE`, `$AGENT_HOME`, `$TEMP`
- **Network access:** configured per-skill via `allowedHosts`; Sentinel maintains the allow-list
- **Execution:** exec skills require `exec` permission; timeout and memory capped

### 4.3 Per-skill Scopes
Each skill declares `requiredPermissions`. Before invocation:
1. Registry checks token scopes cover required permissions
2. Sentinel reviews skills with `exec` or `comms` side effects
3. If any check fails → `ErrorEnvelope` with `code: "PERMISSION_DENIED"`

---

## 5. Initial Skill Inventory (Seed Skills)

| # | Skill ID | Category | Description | Side Effects |
|---|---|---|---|---|
| 1 | `file.read` | read | Read file contents | None |
| 2 | `file.write` | write | Write content to file | `file.write` |
| 3 | `file.glob` | read | Glob pattern matching | None |
| 4 | `file.exists` | read | Check file existence | None |
| 5 | `bash.run` | exec | Run shell command | `env.mutate`, `file.rw` |
| 6 | `code.eval` | exec | Evaluate code snippet | `env.mutate` |
| 7 | `web.search` | read | Search the web | None |
| 8 | `web.fetch` | read | Fetch URL content | `net.outbound` |
| 9 | `memory.store` | state | Store in memory | `state.write` |
| 10 | `memory.search` | read | Query memory store | None |
| 11 | `team.send_message` | comms | Send message to teammate | `comms.outbound` |
| 12 | `task.create` | admin | Create task on board | `state.write` |
| 13 | `task.update` | admin | Update task status | `state.write` |
| 14 | `task.list` | read | List tasks | None |
| 15 | `skill.invoke` | admin | Invoke another skill | Varies |
| 16 | `skill.list` | read | List available skills | None |
| 17 | `log.write` | write | Write to log stream | `file.write` |
| 18 | `env.get` | read | Get environment variable | None |
| 19 | `env.set` | write | Set environment variable | `env.mutate` |
| 20 | `time.now` | read | Return current timestamp | None |

**🚨 Sentinel review required for:** `bash.run`, `code.eval`, `web.fetch`, `team.send_message`, `task.create`, `task.update`, `skill.invoke`

---

## 6. Failure Modes & Error Envelopes

```typescript
interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  detail?: unknown;          // e.g. validation errors, stack trace
  retryable: boolean;
  retryAfterMs?: number;     // for rate-limit errors
  safeRetry: boolean;        // true if idempotent
}

enum ErrorCode {
  // Permission
  PERMISSION_DENIED = "PERMISSION_DENIED",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  SCOPE_MISMATCH = "SCOPE_MISMATCH",

  // Invocation
  SKILL_NOT_FOUND = "SKILL_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  EXECUTION_TIMEOUT = "EXECUTION_TIMEOUT",
  EXECUTION_ERROR = "EXECUTION_ERROR",
  RATE_LIMITED = "RATE_LIMITED",

  // System
  REGISTRY_UNAVAILABLE = "REGISTRY_UNAVAILABLE",
  SANDBOX_VIOLATION = "SANDBOX_VIOLATION",
  MANIFEST_MALFORMED = "MANIFEST_MALFORMED",
}
```

**Failure mode behaviors:**
- `fail-closed`: on error, return `ErrorEnvelope`; do not proceed (default for write/exec/comms)
- `fail-open`: on error, log and continue with degraded functionality (only for read skills with non-critical errors)
- `degrade`: return partial result with `safeRetry: true`

**Retry guidelines:**
- `retryable: true` for rate limits, temporary unavailability
- `safeRetry: true` only if the operation is idempotent (read-only or designed to be re-entrant)

---

## 7. Open Questions for Atlas (§3)

1. What is the workspace directory convention (`$WORKSPACE`, `$AGENT_HOME`)?
2. Will skill manifests be co-located with skill code or centralized in a registry repo?
3. Should skill versioning be strict (exact match) or permissive (^semver)?
4. How does Pulse's runtime loop pass `InvocationContext` — as thread-local, argument, or header?
5. Will there be a skill manifest schema registry (JSON Schema stored alongside)?

---

*Standing by for Atlas MASTER_SPEC §3 to align on these open questions.*
