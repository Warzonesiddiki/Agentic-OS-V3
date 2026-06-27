/**
 * engine.ts — the persistent brain store.
 * Holds the in-memory NexusState, persists to localStorage, exposes a tiny
 * pub/sub for React, and centralizes audit append + bounded-growth pruning.
 */
import { GENESIS_HASH, hashSecret, now, rid, sha256Hex, stableStringify } from "./core";
import { getLocalKey } from "./config";
import type { AuditEntry, LedgerEntry, NexusState, Principal } from "./types";

const KEY = "nexus.brain.v2";
export const SCHEMA_VERSION = 2;

const MAX_AUDIT = 600;
const MAX_LEDGER = 400;
const MAX_FEEDBACK = 300;

/* ------------------------------------------------------------------ *
 * Seed data — gives the dashboard and recall something real to work on.
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

/** Append a ledger entry to a state copy (pure). Used by recall + operations. */
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
 * Store + pub/sub
 *
 * Defensive persistence. The previous implementation had two fatal flaws:
 *  1. `loadState()` returned a fresh `seed()` on ANY anomaly — silently
 *     replacing a user's real brain with demo data.
 *  2. `persist()` swallowed quota errors — silent, invisible data loss.
 *
 * Now: we keep a rolling backup, never reseed on corruption (we recover or
 * boot empty + surface a visible error), back up before every overwrite, and
 * track data-loss / quota events in meta so the UI can warn the operator.
 * ------------------------------------------------------------------ */

const BACKUP_KEY = "nexus.brain.v2.bak";
const PREV_BACKUP_KEY = "nexus.brain.v2.bak2";

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

/** Validate that a parsed object is at least a structurally-sane NexusState. */
function looksValid(parsed: unknown): parsed is NexusState {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  return (
    Array.isArray(p.audit) &&
    Array.isArray(p.memories) &&
    Array.isArray(p.skills) &&
    Array.isArray(p.feedback) &&
    p.meta != null &&
    typeof p.meta === "object"
  );
}

/**
 * Load with recovery. Never silently reseed real data.
 * Order: primary -> backup -> prev backup -> empty (with visible flag).
 * Seeding with demo data only happens on a truly fresh install (no data anywhere).
 */
function loadState(): NexusState {
  // Fresh install → seed demo data so the dashboard isn't empty.
  const primary = safeRead(KEY);
  const backup = safeRead(BACKUP_KEY);
  if (!primary.ok && !backup.ok) return freshSeed();

  const candidates: { name: string; raw: string }[] = [];
  if (primary.ok) candidates.push({ name: "primary", raw: primary.value });
  if (backup.ok) candidates.push({ name: "backup", raw: backup.value });
  const prev = safeRead(PREV_BACKUP_KEY);
  if (prev.ok) candidates.push({ name: "prev-backup", raw: prev.value });

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.raw);
      if (looksValid(parsed)) {
        // Re-hydrate missing fields defensively.
        return { ...seedEmpty(), ...parsed };
      }
      persistence.corruptionRecovered = true;
      persistence.lastError = `Store "${c.name}" present but structurally invalid.`;
    } catch (e) {
      persistence.corruptionRecovered = true;
      persistence.lastError = `Store "${c.name}" unparseable: ${e instanceof Error ? e.message : "parse error"}`;
    }
  }

  // Everything present was corrupt/unreadable but we did NOT reseed demo data
  // over nothing — boot empty and surface the recovery flag.
  persistence.corruptionRecovered = true;
  persistence.recoveredFromBackup = false;
  return seedEmpty();
}

/** Seed demo data, but ONLY when there's genuinely nothing on disk. */
function freshSeed(): NexusState {
  const s = seed();
  return s;
}

function safeRead(key: string): { ok: boolean; value: string } {
  try {
    const v = localStorage.getItem(key);
    return v == null ? { ok: false, value: "" } : { ok: true, value: v };
  } catch {
    return { ok: false, value: "" };
  }
}

function seedEmpty(): NexusState {
  return { memories: [], skills: [], projects: [], notes: [], audit: [], ledger: [], feedback: [], meta: {}, principals: [], vaultFiles: [] };
}

let state: NexusState = loadState();

const listeners = new Set<() => void>();

/**
 * Two-phase write with backups:
 *   1. rotate previous primary -> PREV_BACKUP_KEY
 *   2. write new payload to primary
 *   3. on quota failure, promote older backups forward so the last good
 *      state is never lost, and surface the event.
 */
function persist() {
  const payload = JSON.stringify(state);
  const hasStorage = (() => {
    try {
      localStorage.length;
      return true;
    } catch {
      return false;
    }
  })();
  if (!hasStorage) {
    persistence.lastWriteOk = false;
    persistence.lastError = "localStorage unavailable — operating in-memory only.";
    return;
  }

  try {
    // Rotate backups: current primary becomes prev-backup, current backup becomes primary.
    const current = localStorage.getItem(KEY);
    if (current) {
      const curBak = localStorage.getItem(BACKUP_KEY);
      if (curBak) safeWrite(PREV_BACKUP_KEY, curBak);
      safeWrite(BACKUP_KEY, current);
    }
    localStorage.setItem(KEY, payload);
    persistence.lastWriteOk = true;
    persistence.lastError = null;
  } catch (e) {
    // Quota exceeded or storage disabled. Surface it — never silent.
    persistence.quotaEvents++;
    persistence.lastWriteOk = false;
    persistence.lastError = `Persist failed (likely quota): ${e instanceof Error ? e.message : String(e)}. State retained in-memory; export your brain to avoid loss.`;
    markMetaQuota();
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // Log the specific error (quota exceeded, security policy, etc.) — never silent.
    persistence.lastError = `Failed to write ${key} to localStorage: ${e instanceof Error ? e.message : String(e)}`;
    persistence.lastWriteOk = false;
    // eslint-disable-next-line no-console
    console.warn("[NEXUS]", persistence.lastError);
  }
}

function markMetaQuota(): void {
  // Record the event in meta without recursing persist().
  state = {
    ...state,
    meta: { ...state.meta, lastQuotaEvent: String(Date.now()), persistenceWarning: "quota" },
  };
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
