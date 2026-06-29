# SKILL_REGISTRY.md — NEXUS 2.0 Skill Registry
**Author:** Artisan  
**Status:** Draft v1.0  
**Date:** 2026-06-29

---

## 1. SkillRegistry API

```typescript
// ─── Discovery ──────────────────────────────────────────────────────────────

// List all skills, optionally filtered by category
list(category?: SkillCategory): Promise<SkillManifest[]>

// Full inspection of a single skill (manifest + adapter signature)
inspect(skillId: string): Promise<SkillDetail>

// Search skills by name/description/tags
search(query: string, filters?: SearchFilters): Promise<SkillManifest[]>

// ─── Invocation ─────────────────────────────────────────────────────────────

// Invoke a skill with typed input/output and invocation context
invoke<TInput, TOutput>(
  skillId: string,
  input: TInput,
  ctx: InvocationContext
): Promise<SkillResult<TOutput>>

// ─── Lifecycle (admin only) ──────────────────────────────────────────────────

register(manifest: SkillManifest, adapter: SkillAdapter): void
deregister(skillId: string): void
reload(skillId?: string): Promise<void>

// ─── Supporting Types ────────────────────────────────────────────────────────

type SkillCategory = "read" | "write" | "exec" | "comms" | "state" | "admin"

interface InvocationContext {
  capabilityToken: CapabilityToken   // minted by Sentinel
  sessionId: string
  agentId: string
  scope: PermissionScope[]
}

interface CapabilityToken {
  issuer: "sentinel"
  subject: string          // agentId
  issuedAt: number
  expiresAt: number
  scopes: PermissionScope[]
}

interface PermissionScope {
  permission: string       // e.g. "fs:read", "net:outbound"
  resources: string[]      // e.g. ["$WORKSPACE/**", "*.md"]
}

interface SkillResult<T> {
  ok: boolean
  value?: T
  error?: ErrorEnvelope
  executionMs: number
  sideEffectsLogged: SideEffect[]
}

interface SkillDetail extends SkillManifest {
  adapterSignature: string       // e.g. "(input: FileReadInput) => Promise<FileReadOutput>"
  examples: SkillExample[]
}

interface SearchFilters {
  category?: SkillCategory
  hasSideEffects?: boolean
  requiredPermissions?: string[]
}
```

---

## 2. Capability Manifest Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://nexus.oss/schemas/skill-manifest.json",
  "type": "object",
  "required": ["skillId", "version", "name", "category", "inputs", "outputs", "sideEffects", "requiredPermissions", "failureMode"],
  "properties": {
    "skillId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9._-]*$",
      "examples": ["file.read", "bash.run", "team.send_message"]
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "name": {
      "type": "string",
      "maxLength": 64
    },
    "description": {
      "type": "string",
      "maxLength": 256
    },
    "category": {
      "type": "string",
      "enum": ["read", "write", "exec", "comms", "state", "admin"]
    },
    "inputs": {
      "$ref": "#/definitions/jsonSchema"
    },
    "outputs": {
      "$ref": "#/definitions/jsonSchema"
    },
    "sideEffects": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["effect", "blastRadius"],
        "properties": {
          "effect": {
            "type": "string",
            "examples": ["file.write", "net.outbound", "env.mutate", "state.write"]
          },
          "blastRadius": {
            "type": "string",
            "description": "Human-readable risk description"
          },
          "reversible": {
            "type": "boolean",
            "default": false
          }
        }
      }
    },
    "requiredPermissions": {
      "type": "array",
      "items": { "$ref": "#/definitions/permission" }
    },
    "sandbox": { "$ref": "#/definitions/sandboxConfig" },
    "rateLimit": {
      "type": "object",
      "properties": {
        "requestsPerMinute": { "type": "integer", "minimum": 1 },
        "burst": { "type": "integer", "minimum": 1 }
      }
    },
    "failureMode": {
      "type": "string",
      "enum": ["fail-closed", "fail-open", "degrade"],
      "default": "fail-closed"
    },
    "examples": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "input", "expectedOutput"],
        "properties": {
          "name": { "type": "string" },
          "input": { "type": "object" },
          "expectedOutput": { "type": "object" }
        }
      }
    },
    "changelog": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["version", "date", "note"],
        "properties": {
          "version": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "note": { "type": "string" }
        }
      }
    }
  },
  "definitions": {
    "jsonSchema": {
      "type": "object",
      "description": "JSON Schema draft-07 subset for skill inputs/outputs"
    },
    "permission": {
      "type": "object",
      "required": ["permission", "scope"],
      "properties": {
        "permission": { "type": "string" },
        "scope": { "type": "array", "items": { "type": "string" } }
      }
    },
    "sandboxConfig": {
      "type": "object",
      "properties": {
        "allowWrite": { "type": "boolean" },
        "allowExec": { "type": "boolean" },
        "allowNet": { "type": "boolean" },
        "allowEnv": { "type": "boolean" },
        "timeoutMs": { "type": "integer" },
        "maxMemoryMb": { "type": "integer" },
        "writeScope": { "type": "array", "items": { "type": "string" } },
        "allowedHosts": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

---

## 3. Skill Categories & Default Sandboxes

| Category | Emoji | Default Sandbox | Who Can Invoke |
|---|---|---|---|
| **read** | 📖 | No write, no exec, no net. Max file size 10 MB. | All agents |
| **write** | ✏️ | Write to `$WORKSPACE/**` only. No exec, no net. | All agents (token-scoped) |
| **exec** | ⚙️ | No net, no env vars. Timeout 30 s. Max memory 512 MB. | Sentinel-reviewed only |
| **comms** | 📡 | Outbound only. Allow-list hosts via Sentinel config. | Sentinel-reviewed only |
| **state** | 💾 | Read/write to NEXUS state store only. | All agents |
| **admin** | 🔐 | Full scope. Lead-only. | Leader only |

### Category Sandbox Defaults (YAML)

```yaml
read:
  allowWrite: false
  allowExec: false
  allowNet: false
  maxFileSizeMb: 10

write:
  allowWrite: true
  writeScope: ["$WORKSPACE/**"]
  allowExec: false
  allowNet: false

exec:
  allowExec: true
  timeoutMs: 30000
  maxMemoryMb: 512
  allowNet: false
  allowEnv: false

comms:
  allowNet: true
  allowedHosts: ["$ALLOWED_HOSTS"]   # resolved from Sentinel config at runtime
  allowInbound: false

state:
  allowWrite: true
  writeScope: ["$NEXUS_STATE/**"]

admin:
  allowWrite: true
  allowExec: true
  allowNet: true
  allowEnv: true
  # Lead-only — no token scope checks
```

---

## 4. Permission Model

### 4.1 Capability Tokens
Agents carry a `CapabilityToken` (issued by Sentinel) in every `InvocationContext`.

```
Token structure:
  issuer      → "sentinel"
  subject     → agentId
  issuedAt    → unix timestamp
  expiresAt   → unix timestamp
  scopes      → PermissionScope[]
```

**Issuance flow:**
1. Agent spawns → requests token from Sentinel
2. Sentinel mints token based on agent role + assigned permissions
3. Token passed implicitly in `InvocationContext` on every `invoke()` call

### 4.2 Allow-lists

| Resource | Allow-list Pattern |
|---|---|
| File read | `$WORKSPACE/**`, `$AGENT_HOME/**`, `$TEMP/**` |
| File write | `$WORKSPACE/**` (or narrower per token) |
| Network | Hosts in Sentinel's `allowedHosts` config |
| Execution | Requires `exec` permission in token |

### 4.3 Per-skill Authorization Flow

```
Agent calls skillRegistry.invoke("bash.run", input, ctx)
    ↓
Registry extracts ctx.capabilityToken
    ↓
Checks: token.scopes ⊇ skill.requiredPermissions?
    ↓
Sentinel reviews if skill has exec or comms side effects
    ↓
PASS → execute skill, return SkillResult
FAIL → return ErrorEnvelope(code: PERMISSION_DENIED)
```

### 4.4 Permission Hierarchy

```
admin > exec > comms > write > state > read
```

A token with `admin` scope implicitly covers all other categories.

---

## 5. Seed Skill Inventory (20 Skills)

| # | Skill ID | Category | Description |
|---|---|---|---|
| 1 | `file.read` | read | Read the contents of a file from the workspace. |
| 2 | `file.write` | write | Write content to a file in the workspace. |
| 3 | `file.glob` | read | List files matching a glob pattern (e.g. `**/*.md`). |
| 4 | `file.exists` | read | Check whether a file or directory exists. |
| 5 | `bash.run` | exec | Execute a shell command with timeout and no network. ⚙️ |
| 6 | `code.eval` | exec | Evaluate a snippet of code in an isolated sandbox. ⚙️ |
| 7 | `web.search` | read | Search the web and return structured results. |
| 8 | `web.fetch` | read | Fetch the content of a URL. ⚙️ |
| 9 | `memory.store` | state | Persist a key-value pair to the NEXUS state store. |
| 10 | `memory.search` | read | Query the NEXUS memory store by key or pattern. |
| 11 | `team.send_message` | comms | Send a structured message to a teammate or channel. ⚙️ |
| 12 | `task.create` | admin | Create a new task on the team task board. |
| 13 | `task.update` | admin | Update a task's status, owner, or blocked-by. |
| 14 | `task.list` | read | List tasks from the team task board with filters. |
| 15 | `skill.invoke` | admin | Invoke another skill by ID with given input. |
| 16 | `skill.list` | read | List all registered skills and their manifests. |
| 17 | `log.write` | write | Append a structured entry to the NEXUS audit log. |
| 18 | `env.get` | read | Read an environment variable by name. |
| 19 | `env.set` | write | Set or override an environment variable. ⚙️ |
| 20 | `time.now` | read | Return the current UTC timestamp and ISO date string. |

⚙️ = requires Sentinel review (exec or comms side effects)

**Skills with side effects requiring Sentinel sign-off:**
`bash.run`, `code.eval`, `web.fetch`, `team.send_message`, `env.set`

---

## 6. Failure Modes & Error Envelopes

### 6.1 ErrorEnvelope Schema

```typescript
interface ErrorEnvelope {
  code: ErrorCode           // machine-readable code
  message: string           // human-readable description
  detail?: unknown          // extra context: validation errors, stack, etc.
  retryable: boolean        // true → caller may retry
  retryAfterMs?: number     // suggested backoff (rate limit only)
  safeRetry: boolean        // true → idempotent; retry won't cause side effects
}
```

### 6.2 ErrorCode Enum

| Code | HTTP Equivalent | Description |
|---|---|---|
| `PERMISSION_DENIED` | 403 | Token missing required scope for this skill |
| `TOKEN_EXPIRED` | 401 | Capability token has passed its `expiresAt` |
| `SCOPE_MISMATCH` | 403 | Token scopes don't cover skill's `requiredPermissions` |
| `SKILL_NOT_FOUND` | 404 | No skill with this `skillId` is registered |
| `INVALID_INPUT` | 422 | Input payload fails the skill's `inputs` JSON Schema |
| `EXECUTION_TIMEOUT` | 408 | Skill exceeded its `sandbox.timeoutMs` |
| `EXECUTION_ERROR` | 500 | Skill adapter threw an unhandled exception |
| `RATE_LIMITED` | 429 | Skill has exceeded `rateLimit.requestsPerMinute` |
| `REGISTRY_UNAVAILABLE` | 503 | Skill registry itself is unreachable |
| `SANDBOX_VIOLATION` | 403 | Skill attempted an operation outside its sandbox |
| `MANIFEST_MALFORMED` | 500 | Registered skill has a malformed manifest |
| `SENTINEL_REVIEW_REQUIRED` | 403 | Skill has exec/comms effects but not yet reviewed |

### 6.3 Failure Mode Behaviors

| Mode | On Error | Use When |
|---|---|---|
| `fail-closed` | Return `ErrorEnvelope`; do not proceed | write, exec, comms, admin (default) |
| `fail-open` | Log error; return partial result if possible | read skills with non-critical errors |
| `degrade` | Return partial result with `safeRetry: true` | Skills with graceful degradation designed in |

### 6.4 Retry Policy

```
IF error.retryable === true AND error.safeRetry === true
    THEN client MAY retry after error.retryAfterMs (if set) or with exponential backoff
ELSE
    DO NOT retry without operator intervention
```

**Retryable + safeRetry = true:** `RATE_LIMITED`, `REGISTRY_UNAVAILABLE`, `EXECUTION_TIMEOUT` (for idempotent skills)  
**Never retry:** `PERMISSION_DENIED`, `SANDBOX_VIOLATION`, `MANIFEST_MALFORMED`  
**Conditional:** `EXECUTION_ERROR` (only if skill is designed idempotent)

---

*End of SKILL_REGISTRY.md — Artisan v1.0*
