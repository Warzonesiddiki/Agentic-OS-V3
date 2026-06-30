/**
 * brain.ts — audit verification, brain export/import, compression,
 * embeddings report, and the Obsidian vault bridge (markdown parse, sync,
 * path-safe write-back).
 */
import { estimateTokens, now, rid, sha256Hex, stableStringify } from "./core";
import { appendAudit, commit, getState } from "./engine";
import { safeVaultFile, parseMarkdown } from "./vault";
import { brainExportSchema } from "./types";
import type { AuditEntry, Memory, Note, Skill } from "./types";

const MAX_MEMORIES = 1000;
const DAY = 86400000;

/* ------------------------------------------------------------------ *
 * Audit verification (hash chain)
 * ------------------------------------------------------------------ */

export interface AuditVerifyResult {
  valid: boolean;
  verifiedEntries: number;
  brokenAt: number | null;
  entries: AuditEntry[];
}

export function verifyAudit(): AuditVerifyResult {
  const { audit } = getState();
  let prevHash = "0".repeat(64);
  for (let i = 0; i < audit.length; i++) {
    const e = audit[i];
    if (e.prevHash !== prevHash) {
      return { valid: false, verifiedEntries: i, brokenAt: e.sequence, entries: audit };
    }
    const canonical = [e.prevHash, e.sequence, e.action, e.actor, e.createdAt, stableStringify(e.payload)].join("|");
    const expected = sha256Hex(canonical);
    if (expected !== e.entryHash) {
      return { valid: false, verifiedEntries: i, brokenAt: e.sequence, entries: audit };
    }
    prevHash = e.entryHash;
  }
  return { valid: true, verifiedEntries: audit.length, brokenAt: null, entries: audit };
}

/* ------------------------------------------------------------------ *
 * Brain export / import
 * ------------------------------------------------------------------ */

export interface BrainExport {
  format: "nexus-brain";
  version: number;
  exportedAt: number;
  memories: Memory[];
  skills: Skill[];
  notes: Note[];
  projects: { id: string; name: string; description: string; status: string }[];
  // NOTE: principals / API key hashes are intentionally NEVER exported.
}

export function exportBrain(): BrainExport {
  const s = getState();
  return {
    format: "nexus-brain",
    version: 2,
    exportedAt: now(),
    memories: s.memories,
    skills: s.skills,
    notes: s.notes,
    projects: s.projects.map((p) => ({ id: p.id, name: p.name, description: p.description, status: p.status })),
  };
}

export interface ImportReport {
  imported: boolean;
  memories: number;
  skills: number;
  notes: number;
  duplicates: number;
  reason?: string;
}

export function importBrain(raw: unknown, actor: string): ImportReport {
  const parsed = brainExportSchema.safeParse(raw);
  if (!parsed.success) {
    return { imported: false, memories: 0, skills: 0, notes: 0, duplicates: 0, reason: `Invalid brain payload: ${parsed.error.issues[0]?.message}` };
  }
  const data = parsed.data;
  const state = getState();
  const existing = new Set(state.memories.map((m) => dedupeKey(m.title, m.content)));
  let duplicates = 0;
  const newMems: Memory[] = [];
  for (const m of data.memories) {
    const key = dedupeKey(m.title, m.content);
    if (existing.has(key)) {
      duplicates++;
      continue;
    }
    existing.add(key);
    newMems.push(toMemory(m));
  }
  const existingSkills = new Set(state.skills.map((s) => s.name));
  const newSkills: Skill[] = [];
  for (const sk of data.skills) {
    if (existingSkills.has(sk.name)) {
      duplicates++;
      continue;
    }
    existingSkills.add(sk.name);
    newSkills.push(toSkill(sk));
  }
  const existingNotes = new Set(state.notes.map((n) => n.path));
  const newNotes: Note[] = [];
  for (const n of data.notes ?? []) {
    if (existingNotes.has(n.path)) {
      duplicates++;
      continue;
    }
    existingNotes.add(n.path);
    newNotes.push(toNote(n.path, n.title, n.content));
  }

  let next = {
    ...state,
    memories: [...newMems, ...state.memories],
    skills: [...newSkills, ...state.skills],
    notes: [...newNotes, ...state.notes],
  };
  next = appendAudit(next, "brain.imported", { memories: newMems.length, skills: newSkills.length, notes: newNotes.length, duplicates }, actor);
  commit(next);
  return { imported: true, memories: newMems.length, skills: newSkills.length, notes: newNotes.length, duplicates };
}

function dedupeKey(title: string, content: string): string {
  return sha256Hex(`${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 160)}`);
}

function toMemory(m: { kind: Memory["kind"]; title: string; content: string; tags?: string[]; importance?: number; source?: string }): Memory {
  const t = now();
  return {
    id: rid("mem"),
    kind: m.kind,
    title: m.title,
    content: m.content,
    tags: m.tags ?? [],
    importance: m.importance ?? 0.5,
    source: m.source ?? "import",
    projectId: null,
    tokenCost: estimateTokens(m.content),
    recallCount: 0,
    createdAt: t,
    updatedAt: t,
    lastRecalledAt: null,
  };
}

type SkillDraft = Pick<Skill, "name" | "title" | "description" | "content" | "category"> & {
  tags?: string[];
  trigger?: string | null;
  source?: string;
  projectId?: string | null;
};

function toSkill(s: SkillDraft): Skill {
  const t = now();
  return {
    id: rid("skl"),
    name: s.name,
    title: s.title,
    description: s.description,
    content: s.content,
    category: s.category,
    tags: s.tags ?? [],
    trigger: s.trigger ?? null,
    rating: 0,
    useCount: 0,
    successCount: 0,
    failureCount: 0,
    source: s.source ?? "import",
    projectId: s.projectId ?? null,
    createdAt: t,
    updatedAt: t,
  };
}

function toNote(path: string, title: string, content: string): Note {
  return { ...parseMarkdown(path, content), id: rid("nte"), charCount: content.length, mtime: null, indexedAt: now(), path, title, content };
}

/* ------------------------------------------------------------------ *
 * Compression / pruning policy
 * ------------------------------------------------------------------ */

export interface CompressReport {
  pruned: number;
  kept: number;
  totalBefore: number;
  totalAfter: number;
  cap: number;
}

export function compressBrain(actor: string): CompressReport {
  const state = getState();
  const totalBefore = state.memories.length;
  const kept: Memory[] = [];
  let pruned = 0;
  for (const m of state.memories) {
    const old = Date.now() - m.updatedAt > 7 * DAY;
    const lowValue = m.importance < 0.2 && m.recallCount === 0 && old && m.kind === "episodic";
    if (lowValue && kept.length + (totalBefore - pruned) > MAX_MEMORIES) {
      pruned++;
      continue;
    }
    kept.push(m);
  }
  // Hard cap: if still over, drop lowest-importance oldest.
  let finalMems = kept;
  if (finalMems.length > MAX_MEMORIES) {
    finalMems = [...finalMems]
      .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt)
      .slice(0, MAX_MEMORIES);
    pruned += kept.length - MAX_MEMORIES;
  }
  let next = { ...state, memories: finalMems };
  next = appendAudit(next, "brain.compressed", { pruned, totalBefore, totalAfter: finalMems.length, cap: MAX_MEMORIES }, actor);
  commit(next);
  return { pruned, kept: finalMems.length, totalBefore, totalAfter: finalMems.length, cap: MAX_MEMORIES };
}

export function rebuildEmbeddings(): { mode: "lexical"; reason: string; simulated: boolean; documents: number } {
  const s = getState();
  const documents = s.memories.length + s.skills.length + s.notes.length;
  return {
    mode: "lexical",
    reason: "No embedding provider configured — recall runs on BM25 lexical ranking (honest fallback).",
    simulated: true,
    documents,
  };
}

/* ------------------------------------------------------------------ *
 * Obsidian vault bridge
 * ------------------------------------------------------------------ */

export function indexVault(actor: string): { indexed: number; notes: number } {
  const state = getState();
  const byPath = new Map(state.notes.map((n) => [n.path, n]));
  for (const f of state.vaultFiles) {
    const parsed = parseMarkdown(f.path, f.content);
    byPath.set(f.path, {
      ...parsed,
      id: byPath.get(f.path)?.id ?? rid("nte"),
      charCount: f.content.length,
      mtime: f.mtime,
      indexedAt: now(),
      path: f.path,
    });
  }
  let next = { ...state, notes: Array.from(byPath.values()) };
  next = appendAudit(next, "vault.synced", { files: state.vaultFiles.length, notes: next.notes.length }, actor);
  commit(next);
  return { indexed: state.vaultFiles.length, notes: next.notes.length };
}

export function addVaultFile(path: string, content: string, actor: string): { path: string } {
  const safe = safeVaultFile(path);
  if (!safe.ok) throw new Error(safe.reason ?? "Unsafe vault path");
  const t = now();
  let next = {
    ...getState(),
    vaultFiles: [{ path: safe.resolved, content, mtime: t }, ...getState().vaultFiles.filter((f) => f.path !== safe.resolved)],
  };
  next = appendAudit(next, "vault.file.added", { path: safe.resolved, bytes: content.length }, actor);
  commit(next);
  return { path: safe.resolved };
}

export function writeBack(memoryId: string, path: string | undefined, actor: string): { ok: boolean; path: string } {
  const state = getState();
  const mem = state.memories.find((m) => m.id === memoryId);
  if (!mem) throw new Error("Memory not found");
  const target = path ?? `/vault/export/${slug(mem.title)}.md`;
  const safe = safeVaultFile(target);
  if (!safe.ok) throw new Error(safe.reason ?? "Unsafe write-back path");
  const md = `---\ntitle: ${mem.title}\ntags: [${mem.tags.join(", ")}]\nsource: nexus-memory\n---\n\n${mem.content}\n`;
  const t = now();
  let next = {
    ...getState(),
    vaultFiles: [{ path: safe.resolved, content: md, mtime: t }, ...getState().vaultFiles.filter((f) => f.path !== safe.resolved)],
  };
  next = appendAudit(next, "vault.writeback", { memoryId, path: safe.resolved }, actor);
  commit(next);
  return { ok: true, path: safe.resolved };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "memory";
}
