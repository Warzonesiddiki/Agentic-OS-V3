/**
 * engine.ts — in-memory brain store, API-driven (no localStorage for business data).
 * Holds the in-memory NexusState, exposes pub/sub for React, centralizes audit append + pruning.
 * Persistence is now via remote API (api-client.ts) + store-cache.ts observable cache.
 * This file intentionally contains ZERO localStorage references – business data lives in
 * the Hono backend (Postgres/SQLite) and is hydrated via startRemoteSync() / syncFromRemote().
 * See Phase 5.2: api-client.ts + store-cache.ts + store.ts delegate to API, not localStorage.
 */
import { GENESIS_HASH, hashSecret, now, rid, sha256Hex, stableStringify } from "./core";
import { getLocalKey } from "./config";
import type { AuditEntry, LedgerEntry, NexusState, Principal } from "./types";

export const SCHEMA_VERSION = 2;

const MAX_AUDIT = 600;
const MAX_LEDGER = 400;
const MAX_FEEDBACK = 300;

/* ------------------------------------------------------------------ *
 * Seed data — gives the dashboard and recall something real to work on
 * when offline or before remote hydration.
 * ------------------------------------------------------------------ */

function seed(): NexusState {
  const t = now();
  const memories: NexusState["memories"] = [
    {
      id: rid("mem"),
      kind: "preference",
      title: "Prefer strict TypeScript with no any",
      content: "All new modules must use strict types. Avoid `any` unless justified with a comment. Prefer typed domain models and Zod schemas at every boundary.",
      tags: ["typescript", "quality", "style"],
      importance: 0.9,
      source: "transfer",
      projectId: null,
      tokenCost: 0,
      recallCount: 0,
      createdAt: t - 86400000 * 6,
      updatedAt: t - 86400000 * 6,
      lastRecalledAt: null,
    },
    {
      id: rid("mem"),
      kind: "fact",
      title: "BM25 ranking combines term frequency, IDF, and document length",
      content: "BM25 scores a document for a query term using IDF and a saturation function over term frequency, normalized by document length against the corpus average.",
      tags: ["search", "recall", "algorithm"],
      importance: 0.8,
      source: "manual",
      projectId: null,
      tokenCost: 0,
      recallCount: 0,
      createdAt: t - 86400000 * 4,
      updatedAt: t - 86400000 * 4,
      lastRecalledAt: null,
    },
    {
      id: rid("mem"),
      kind: "reflexion",
      title: "Never lose a transcript on distillation failure",
      content: "If session distillation fails or yields nothing usable, the raw transcript must always be preserved as an undistilled checkpoint memory. This invariant is integration-tested.",
      tags: ["sessions", "reliability", "invariant"],
      importance: 1,
      source: "reflexion",
      projectId: null,
      tokenCost: 0,
      recallCount: 0,
      createdAt: t - 86400000 * 2,
      updatedAt: t - 86400000 * 2,
      lastRecalledAt: null,
    },
    {
      id: rid("mem"),
      kind: "semantic",
      title: "Audit entries are hash-chained for tamper evidence",
      content: "Each audit entry stores the previous entry's hash and a hash of its own canonical content, forming a chain verifiable end-to-end via GET /api/v1/audit.",
      tags: ["audit", "security", "integrity"],
      importance: 0.85,
      source: "manual",
      projectId: null,
      tokenCost: 0,
      recallCount: 0,
      createdAt: t - 86400000,
      updatedAt: t - 86400000,
      lastRecalledAt: null,
    },
  ];

  for (const m of memories) m.tokenCost = Math.max(1, Math.ceil(m.content.length / 4));

  const skills: NexusState["skills"] = [
    {
      id: rid("skl"),
      name: "add-zod-validated-endpoint",
      title: "Add a Zod-validated API endpoint",
      description: "Procedure for safely adding a new versioned REST endpoint with input validation and auth.",
      content: "1) Define a Zod schema in types.ts.\n2) Add the route in api.ts with method+path.\n3) Require auth + scope.\n4) Validate body/query.\n5) Append an audit event.\n6) Return a typed envelope.",
      category: "backend",
      tags: ["api", "validation", "security"],
      trigger: "new api endpoint",
      rating: 0.92,
      useCount: 12,
      successCount: 11,
      failureCount: 1,
      source: "transfer",
      projectId: null,
      createdAt: t - 86400000 * 5,
      updatedAt: t - 86400000,
    },
    {
      id: rid("skl"),
      name: "debug-flaky-test",
      title: "Debug a flaky integration test",
      description: "Heuristic for isolating order- or timing-dependent test failures.",
      content: "Run the suite with --retry and -R seed shuffle. Capture the failing seed, isolate shared state, and add cleanup in afterEach.",
      category: "testing",
      tags: ["testing", "debugging"],
      trigger: "flaky test",
      rating: 0.78,
      useCount: 8,
      successCount: 6,
      failureCount: 2,
      source: "reflexion",
      projectId: null,
      createdAt: t - 86400000 * 3,
      updatedAt: t - 86400000 * 3,
    },
  ];

  const projects: NexusState["projects"] = [
    {
      id: rid("prj"),
      name: "best-agent-os",
      description: "Prior AI-agent memory/MCP server. Transferred to seed NEXUS 2.0 with retained lessons.",
      source: "transfer",
      status: "transferred",
      memoryCount: memories.length,
      skillCount: skills.length,
      tokenFootprint: memories.reduce((s, m) => s + m.tokenCost, 0) + skills.reduce((s, k) => s + Math.ceil(k.content.length / 4), 0),
      metadata: { transferred: "true" },
      createdAt: t - 86400000 * 7,
      updatedAt: t - 86400000 * 7,
    },
  ];

  const vaultFiles: NexusState["vaultFiles"] = [
    {
      path: "/vault/agents/recall-strategy.md",
      content:
        "---\ntitle: Recall Strategy\ntags: [search, recall]\n---\n# Recall Strategy\nToken-budgeted recall packs the highest-scoring items first and truncates the rest. See [[token-ledger]] for savings.\n\nAlways combine lexical and importance signals.",
      mtime: t - 86400000 * 2,
    },
    {
      path: "/vault/security/path-safety.md",
      content:
        "---\ntitle: Path Safety\ntags: [security, vault]\n---\n# Path Safety\nReject any note path containing `..` or escaping the vault root. Write-back must resolve to a path strictly inside /vault.",
      mtime: t - 86400000,
    },
  ];

  const localKey = getLocalKey();
  const principals: Principal[] = [
    {
      id: rid("prn"),
      name: "local-operator",
      keyHash: hashSecret(localKey),
      keyPreview: localKey.slice(-4),
      scopes: ["memory:read", "memory:write", "skill:read", "skill:write", "brain:admin", "vault:read", "vault:write", "safety:write", "audit:read"],
      status: "active",
      createdAt: t,
      lastUsedAt: null,
    },
  ];

  let state: NexusState = {
    memories,
    skills,
    projects,
    notes: [],
    audit: [],
    ledger: [],
    feedback: [],
    meta: {
      killSwitch: "0",
      lastHeartbeat: String(t),
      bootedAt: String(t),
      schemaVersion: String(SCHEMA_VERSION),
    },
    principals,
    vaultFiles,
  };

  state = appendAudit(state, "system.booted", { version: SCHEMA_VERSION, note: "NEXUS 2.0 brain initialized" }, "system");
  return state;
}

/* ------------------------------------------------------------------ *
 * Audit hash chain
 * ------------------------------------------------------------------ */

export function appendLedgerState(base: NexusState, entry: Omit<LedgerEntry, "id" | "createdAt">): NexusState {
  const full: LedgerEntry = { ...entry, id: rid("ldg"), createdAt: now() };
  return { ...base, ledger: [...base.ledger, full] };
}

export function appendAudit(base: NexusState, action: string, payload: unknown, actor: string): NexusState {
  const list = base.audit;
  const sequence = list.length ? list[list.length - 1].sequence + 1 : 1;
  const prevHash = list.length ? list[list.length - 1].entryHash : GENESIS_HASH;
  const createdAt = now();
  const canonical = [prevHash, sequence, action, actor, createdAt, stableStringify(payload)].join("|");
  const entryHash = sha256Hex(canonical);
  const entry: AuditEntry = { sequence, id: rid("aud"), actor, action, payload, prevHash, entryHash, createdAt };
  return { ...base, audit: [...list, entry] };
}

/* ------------------------------------------------------------------ *
 * Store + pub/sub — in-memory only, API-driven
 * Persistence is now via Hono backend (Postgres/SQLite) + SSE hydrator.
 * No browser storage for business data per Phase 5.2.
 * ------------------------------------------------------------------ */

export interface PersistenceStatus {
  lastWriteOk: boolean;
  lastError: string | null;
  quotaEvents: number;
  corruptionRecovered: boolean;
  recoveredFromBackup: boolean;
}

export const persistence: PersistenceStatus = {
  lastWriteOk: true,
  lastError: null,
  quotaEvents: 0,
  corruptionRecovered: false,
  recoveredFromBackup: false,
};

export function getPersistenceStatus(): PersistenceStatus {
  return { ...persistence };
}

function prune(s: NexusState): NexusState {
  const audit = s.audit.length > MAX_AUDIT ? s.audit.slice(s.audit.length - MAX_AUDIT) : s.audit;
  const ledger = s.ledger.length > MAX_LEDGER ? s.ledger.slice(s.ledger.length - MAX_LEDGER) : s.ledger;
  const feedback = s.feedback.length > MAX_FEEDBACK ? s.feedback.slice(s.feedback.length - MAX_FEEDBACK) : s.feedback;
  return { ...s, audit, ledger, feedback };
}

function seedEmpty(): NexusState {
  return { memories: [], skills: [], projects: [], notes: [], audit: [], ledger: [], feedback: [], meta: {}, principals: [], vaultFiles: [] };
}

let state: NexusState = seed();

const listeners = new Set<() => void>();

function persist() {
  // No-op: business data persists via API, not browser storage.
  persistence.lastWriteOk = true;
  persistence.lastError = null;
}

export function getState(): NexusState {
  return state;
}

export function commit(next: NexusState): NexusState {
  state = prune(next);
  persist();
  emit();
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function resetBrain(): void {
  state = seed();
  persist();
  emit();
}

export function wipeBrain(): void {
  state = prune(appendAudit(seedEmpty(), "system.wiped", { reason: "manual reset" }, "system"));
  persist();
  emit();
}

// ── Phase 3.3: MCP Event Logging ────────────────────────────────────

export interface MCPAuditPayload {
  serverId: string;
  serverName: string;
  transport: string;
  toolCount?: number;
  error?: string;
}

export function logMCPEvent(
  state: NexusState,
  action: "mcp.connected" | "mcp.disconnected" | "mcp.connect_failed" | "mcp.tools_discovered" | "mcp.health_check_failed",
  payload: MCPAuditPayload,
  actor: string
): NexusState {
  return appendAudit(state, action, payload, actor);
}

export function setMCPState(
  state: NexusState,
  servers: { id: string; name: string; transport: string; status: string; toolCount: number; error?: string }[]
): NexusState {
  const mcpServers = servers.map((s) => ({
    id: s.id,
    name: s.name,
    transport: s.transport,
    status: s.status,
    toolCount: s.toolCount,
    error: s.error,
    lastConnected: undefined as number | undefined,
    createdAt: Date.now(),
  }));
  return {
    ...state,
    osState: {
      ...((state.osState as Record<string, unknown>) ?? {}),
      mcpServers,
    },
  };
}
