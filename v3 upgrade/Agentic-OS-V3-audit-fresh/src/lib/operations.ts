/**
 * operations.ts — domain operations that mutate the brain.
 * Every mutating operation enforces the kill-switch, computes derived fields
 * (token cost, ratings), appends a hash-chained audit event, and records the
 * token ledger where relevant.
 */
import { clamp, estimateTokens, hashSecret, now, rid, sha256Hex, timingSafeEqual, tokenize } from "./core";
import { appendAudit, commit, getState } from "./engine";
import type {
  CaptureInput,
  CheckpointInput,
  LedgerEntry,
  LedgerEventType,
  Memory,
  MemoryInput,
  MemoryKind,
  NexusState,
  Skill,
  SkillInput,
  SkillOutcome,
  TransferInput,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertOperational() {
  if (getState().meta.killSwitch === "1") {
    throw new ApiError(423, "SAFETY_KILL_SWITCH", "Kill switch is engaged — mutations are blocked.");
  }
}

function normTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

type MemoryDraft = {
  kind: MemoryKind;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  source?: string;
};

function makeMemory(input: MemoryDraft, projectId: string | null, source?: string): Memory {
  const t = now();
  return {
    id: rid("mem"),
    kind: input.kind,
    title: input.title,
    content: input.content,
    tags: normTags(input.tags),
    importance: clamp(input.importance ?? 0.5, 0, 1),
    source: source ?? input.source ?? "manual",
    projectId,
    tokenCost: estimateTokens(input.content),
    recallCount: 0,
    createdAt: t,
    updatedAt: t,
    lastRecalledAt: null,
  };
}

function appendLedger(base: NexusState, ev: Omit<LedgerEntry, "id" | "createdAt">): NexusState {
  const entry: LedgerEntry = { ...ev, id: rid("ldg"), createdAt: now() };
  return { ...base, ledger: [...base.ledger, entry] };
}

/* ------------------------------------------------------------------ *
 * Memories
 * ------------------------------------------------------------------ */

export function createMemory(input: MemoryInput, actor: string): Memory {
  assertOperational();
  const mem = makeMemory(input, input.projectId ?? null);
  let next: NexusState = { ...getState(), memories: [mem, ...getState().memories] };
  next = appendAudit(next, "memory.created", { id: mem.id, kind: mem.kind, title: mem.title }, actor);
  commit(next);
  return mem;
}

export function updateMemory(id: string, patch: Partial<MemoryInput>, actor: string): Memory {
  assertOperational();
  const state = getState();
  const mem = state.memories.find((m) => m.id === id);
  if (!mem) throw new ApiError(404, "NOT_FOUND", `Memory ${id} not found.`);
  const updated: Memory = {
    ...mem,
    ...(patch.kind ? { kind: patch.kind } : {}),
    ...(patch.title ? { title: patch.title } : {}),
    ...(patch.content ? { content: patch.content, tokenCost: estimateTokens(patch.content) } : {}),
    ...(patch.tags ? { tags: normTags(patch.tags) } : {}),
    ...(patch.importance != null ? { importance: clamp(patch.importance, 0, 1) } : {}),
    ...(patch.source ? { source: patch.source } : {}),
    updatedAt: now(),
  };
  let next = { ...state, memories: state.memories.map((m) => (m.id === id ? updated : m)) };
  next = appendAudit(next, "memory.updated", { id, fields: Object.keys(patch) }, actor);
  commit(next);
  return updated;
}

export function deleteMemory(id: string, actor: string): void {
  assertOperational();
  const state = getState();
  if (!state.memories.some((m) => m.id === id)) throw new ApiError(404, "NOT_FOUND", `Memory ${id} not found.`);
  let next = { ...state, memories: state.memories.filter((m) => m.id !== id) };
  next = appendAudit(next, "memory.deleted", { id }, actor);
  commit(next);
}

export function getMemory(id: string): Memory | undefined {
  return getState().memories.find((m) => m.id === id);
}

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

export function createSkill(input: SkillInput, actor: string): Skill {
  assertOperational();
  const t = now();
  const skill: Skill = {
    id: rid("skl"),
    name: input.name,
    title: input.title,
    description: input.description,
    content: input.content,
    category: input.category,
    tags: normTags(input.tags),
    trigger: input.trigger ?? null,
    rating: 0,
    useCount: 0,
    successCount: 0,
    failureCount: 0,
    source: input.source,
    projectId: input.projectId ?? null,
    createdAt: t,
    updatedAt: t,
  };
  let next: NexusState = { ...getState(), skills: [skill, ...getState().skills] };
  next = appendAudit(next, "skill.created", { id: skill.id, name: skill.name }, actor);
  commit(next);
  return skill;
}

export function updateSkill(id: string, patch: Partial<SkillInput>, actor: string): Skill {
  assertOperational();
  const state = getState();
  const skill = state.skills.find((s) => s.id === id);
  if (!skill) throw new ApiError(404, "NOT_FOUND", `Skill ${id} not found.`);
  const updated: Skill = {
    ...skill,
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.title ? { title: patch.title } : {}),
    ...(patch.description ? { description: patch.description } : {}),
    ...(patch.content ? { content: patch.content } : {}),
    ...(patch.category ? { category: patch.category } : {}),
    ...(patch.tags ? { tags: normTags(patch.tags) } : {}),
    ...(patch.trigger !== undefined ? { trigger: patch.trigger } : {}),
    updatedAt: now(),
  };
  let next = { ...state, skills: state.skills.map((s) => (s.id === id ? updated : s)) };
  next = appendAudit(next, "skill.updated", { id }, actor);
  commit(next);
  return updated;
}

export function deleteSkill(id: string, actor: string): void {
  assertOperational();
  const state = getState();
  if (!state.skills.some((s) => s.id === id)) throw new ApiError(404, "NOT_FOUND", `Skill ${id} not found.`);
  let next = { ...state, skills: state.skills.filter((s) => s.id !== id) };
  next = appendAudit(next, "skill.deleted", { id }, actor);
  commit(next);
}

export function recordSkillOutcome(id: string, outcome: SkillOutcome, actor: string): Skill {
  assertOperational();
  const state = getState();
  const skill = state.skills.find((s) => s.id === id);
  if (!skill) throw new ApiError(404, "NOT_FOUND", `Skill ${id} not found.`);
  const useCount = skill.useCount + 1;
  const successCount = skill.successCount + (outcome === "success" ? 1 : 0);
  const failureCount = skill.failureCount + (outcome === "failure" ? 1 : 0);
  const updated: Skill = {
    ...skill,
    useCount,
    successCount,
    failureCount,
    rating: clamp(successCount / useCount, 0, 1),
    updatedAt: now(),
  };
  let next = { ...state, skills: state.skills.map((s) => (s.id === id ? updated : s)) };
  next = appendAudit(next, "skill.outcome", { id, outcome }, actor);
  commit(next);
  return updated;
}

/* ------------------------------------------------------------------ *
 * Session capture — guaranteed transcript preservation invariant.
 * ------------------------------------------------------------------ */

interface DistilledMemory {
  kind: MemoryKind;
  title: string;
  content: string;
  tags: string[];
  importance: number;
}

const SIGNAL = /\b(remember|note|decided|decision|lesson|learned|always|never|rule|policy|important|fact|preference|todo|fix|bug)\b/i;

function heuristicDistill(transcript: string): { memories: DistilledMemory[]; skills: SkillInput[] } {
  const lines = transcript
    .split(/\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8);

  const memories: DistilledMemory[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!SIGNAL.test(line)) continue;
    const key = sha256Hex(line.toLowerCase().slice(0, 120));
    if (seen.has(key)) continue;
    seen.add(key);
    memories.push({
      kind: line.match(/prefer|always|never|policy|rule/i) ? "preference" : "reflexion",
      title: line.slice(0, 80),
      content: line,
      tags: Array.from(new Set(tokenize(line))).slice(0, 5),
      importance: 0.6,
    });
  }

  const skills: SkillInput[] = [];
  const stepsMatch = transcript.match(/(?:steps?:?|how to)\s*([^]+?)(?:\n\n|$)/i);
  if (stepsMatch && stepsMatch[1].length > 20) {
    skills.push({
      name: `procedure-${rid("").slice(-6)}`,
      title: "Extracted procedure",
      description: "Heuristically extracted from a session transcript.",
      content: stepsMatch[1].trim(),
      category: "general",
      tags: [],
      trigger: null,
      source: "session",
      projectId: null,
    });
  }

  if (!memories.length) {
    memories.push({
      kind: "episodic",
      title: "Session summary",
      content: transcript.slice(0, 600),
      tags: Array.from(new Set(tokenize(transcript))).slice(0, 5),
      importance: 0.4,
    });
  }

  return { memories, skills };
}

export interface CaptureReport {
  distilled: boolean;
  transcriptPreserved: boolean;
  projectId: string | null;
  projectName: string | null;
  savedMemories: Memory[];
  savedSkills: Skill[];
  transcript: string;
  reason?: string;
}

export function ensureProject(name: string, description: string, source: string): { id: string; created: boolean } {
  const state = getState();
  const existing = state.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return { id: existing.id, created: false };
  const t = now();
  const project = {
    id: rid("prj"),
    name,
    description,
    source,
    status: "active" as const,
    memoryCount: 0,
    skillCount: 0,
    tokenFootprint: 0,
    metadata: {},
    createdAt: t,
    updatedAt: t,
  };
  commit({ ...state, projects: [project, ...state.projects] });
  return { id: project.id, created: true };
}

export function captureSession(input: CaptureInput, actor: string): CaptureReport {
  assertOperational();
  const transcript = input.transcript;
  let projectId: string | null = null;
  let projectName: string | null = null;

  if (input.projectName) {
    const p = ensureProject(input.projectName, "Created by session capture", "session");
    projectId = p.id;
    projectName = input.projectName;
  }

  const savedMemories: Memory[] = [];
  const savedSkills: Skill[] = [];
  let distilled = false;
  let transcriptPreserved = false;
  let reason: string | undefined;

  try {
    if (input.forceFail) throw new Error("Forced distillation failure (demo of safety invariant).");

    const { memories, skills } = heuristicDistill(transcript);
    let next = { ...getState() };
    for (const dm of memories) {
      const mem = makeMemory({ ...dm, source: "session", projectId: null } as MemoryInput, projectId, "session");
      savedMemories.push(mem);
      next = { ...next, memories: [mem, ...next.memories] };
    }
    for (const sk of skills) {
      const skill: Skill = {
        id: rid("skl"),
        name: sk.name,
        title: sk.title,
        description: sk.description,
        content: sk.content,
        category: sk.category,
        tags: normTags(sk.tags),
        trigger: sk.trigger ?? null,
        rating: 0,
        useCount: 0,
        successCount: 0,
        failureCount: 0,
        source: "session",
        projectId,
        createdAt: now(),
        updatedAt: now(),
      };
      savedSkills.push(skill);
      next = { ...next, skills: [skill, ...next.skills] };
    }
    next = appendLedger(
      next,
      ledger("capture", input.projectName ?? "session", savedMemories.reduce((s, m) => s + m.tokenCost, 0), savedMemories.length)
    );
    next = appendAudit(next, "session.captured", { distilled: true, memories: savedMemories.length, skills: savedSkills.length, projectId }, actor);
    commit(next);
    distilled = true;
  } catch (err) {
    reason = err instanceof Error ? err.message : "Distillation failed.";
    // INVARIANT: never lose the transcript.
    const raw: Memory = {
      id: rid("mem"),
      kind: "episodic",
      title: "Session transcript (undistilled)",
      content: transcript,
      tags: ["session", "undistilled", "preserved"],
      importance: 0.5,
      source: "session-raw",
      projectId,
      tokenCost: estimateTokens(transcript),
      recallCount: 0,
      createdAt: now(),
      updatedAt: now(),
      lastRecalledAt: null,
    };
    let next = { ...getState(), memories: [raw, ...getState().memories] };
    next = appendLedger(next, ledger("capture", input.projectName ?? "session", raw.tokenCost, 1));
    next = appendAudit(
      next,
      "session.captured",
      { distilled: false, transcriptPreserved: true, reason, projectId, rawMemoryId: raw.id },
      actor
    );
    commit(next);
    savedMemories.push(raw);
    transcriptPreserved = true;
  }

  return { distilled, transcriptPreserved, projectId, projectName, savedMemories, savedSkills, transcript, reason };
}

function ledger(eventType: LedgerEventType, query: string, saved: number, items: number): Omit<LedgerEntry, "id" | "createdAt"> {
  return {
    eventType,
    query,
    tokensInjected: saved,
    tokensReused: saved,
    tokensSaved: saved,
    itemsReturned: items,
    real: true,
  };
}

/* ------------------------------------------------------------------ *
 * Knowledge transfer
 * ------------------------------------------------------------------ */

export interface TransferReport {
  projectId: string;
  projectName: string;
  created: boolean;
  memoriesCreated: number;
  memoriesSkipped: number;
  skillsUpserted: number;
  tokenFootprint: number;
}

export function transferProject(input: TransferInput, actor: string): TransferReport {
  assertOperational();
  const { id: projectId, created } = ensureProject(input.projectName, input.description ?? "", "transfer");

  let next = { ...getState() };
  const existing = new Set(next.memories.map((m) => dedupeKey(m.title, m.content)));
  let memoriesCreated = 0;
  let memoriesSkipped = 0;
  const newMems: Memory[] = [];

  for (const m of input.memories) {
    const key = dedupeKey(m.title, m.content);
    if (existing.has(key)) {
      memoriesSkipped++;
      continue;
    }
    existing.add(key);
    const mem = makeMemory(m, projectId, "transfer");
    newMems.push(mem);
    memoriesCreated++;
  }

  // Distill transcript + files into memories as well.
  const distilled: DistilledMemory[] = [];
  if (input.transcript) distilled.push(...heuristicDistill(input.transcript).memories);
  for (const f of input.files) {
    distilled.push({
      kind: "semantic",
      title: f.path.split("/").pop() || f.path,
      content: f.content.slice(0, 2000),
      tags: [],
      importance: 0.5,
    });
  }
  for (const dm of distilled) {
    const key = dedupeKey(dm.title, dm.content);
    if (existing.has(key)) {
      memoriesSkipped++;
      continue;
    }
    existing.add(key);
    const mem = makeMemory({ ...dm, source: "transfer", projectId: null } as MemoryInput, projectId, "transfer");
    newMems.push(mem);
    memoriesCreated++;
  }

  next = { ...next, memories: [...newMems, ...next.memories] };

  // Upsert skills by name (+projectId).
  let skillsUpserted = 0;
  for (const sk of input.skills) {
    const idx = next.skills.findIndex((s) => s.name === sk.name && (s.projectId ?? null) === (sk.projectId ?? null));
    if (idx >= 0) {
      const prev = next.skills[idx];
      next.skills = next.skills.map((s, i) =>
        i === idx
          ? {
              ...prev,
              title: sk.title,
              description: sk.description,
              content: sk.content,
              category: sk.category,
              tags: normTags(sk.tags),
              trigger: sk.trigger ?? prev.trigger,
              updatedAt: now(),
            }
          : s
      );
    } else {
      const skill: Skill = {
        id: rid("skl"),
        name: sk.name,
        title: sk.title,
        description: sk.description,
        content: sk.content,
        category: sk.category,
        tags: normTags(sk.tags),
        trigger: sk.trigger ?? null,
        rating: 0,
        useCount: 0,
        successCount: 0,
        failureCount: 0,
        source: "transfer",
        projectId: sk.projectId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      next = { ...next, skills: [skill, ...next.skills] };
    }
    skillsUpserted++;
  }

  const tokenFootprint = newMems.reduce((s, m) => s + m.tokenCost, 0);
  // Update project counters.
  next = {
    ...next,
    projects: next.projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            memoryCount: next.memories.filter((m) => m.projectId === projectId).length,
            skillCount: next.skills.filter((s) => s.projectId === projectId).length,
            tokenFootprint: p.tokenFootprint + tokenFootprint,
            updatedAt: now(),
          }
        : p
    ),
  };

  next = appendLedger(next, ledger("transfer", input.projectName, tokenFootprint, memoriesCreated + skillsUpserted));
  next = appendAudit(
    next,
    "project.transferred",
    { projectId, projectName: input.projectName, memoriesCreated, memoriesSkipped, skillsUpserted },
    actor
  );
  commit(next);

  return { projectId, projectName: input.projectName, created, memoriesCreated, memoriesSkipped, skillsUpserted, tokenFootprint };
}

function dedupeKey(title: string, content: string): string {
  return sha256Hex(`${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 160)}`);
}

/* ------------------------------------------------------------------ *
 * Checkpoint
 * ------------------------------------------------------------------ */

export function checkpoint(input: CheckpointInput, actor: string): Memory {
  assertOperational();
  let projectId: string | null = null;
  if (input.projectName) projectId = ensureProject(input.projectName, "Checkpoint project", "checkpoint").id;
  const mem = makeMemory(
    { kind: "episodic", title: input.label, content: input.context, tags: ["checkpoint"], importance: 0.6, source: "checkpoint", projectId: null } as MemoryInput,
    projectId,
    "checkpoint"
  );
  let next: NexusState = { ...getState(), memories: [mem, ...getState().memories] };
  next = appendLedger(next, ledger("checkpoint", input.label, mem.tokenCost, 1));
  next = appendAudit(next, "checkpoint.created", { id: mem.id, label: input.label, projectId }, actor);
  commit(next);
  return mem;
}

/* ------------------------------------------------------------------ *
 * Governance / safety
 * ------------------------------------------------------------------ */

export function tripKillSwitch(enabled: boolean, reason: string | undefined, actor: string): { killSwitch: boolean } {
  const next: NexusState = {
    ...getState(),
    meta: { ...getState().meta, killSwitch: enabled ? "1" : "0", killSwitchReason: reason ?? "" },
  };
  const audited = appendAudit(next, enabled ? "safety.kill_switch.engaged" : "safety.kill_switch.released", { reason: reason ?? null }, actor);
  commit(audited);
  return { killSwitch: enabled };
}

export function heartbeat(): { lastHeartbeat: number } {
  const t = now();
  commit({ ...getState(), meta: { ...getState().meta, lastHeartbeat: String(t) } });
  // Heartbeats are not audited to avoid flooding the chain.
  return { lastHeartbeat: t };
}

/* ------------------------------------------------------------------ *
 * Feedback (recall relevance)
 * ------------------------------------------------------------------ */

export function recordFeedback(query: string, itemId: string, itemType: "memory" | "skill" | "note", helpful: boolean, actor: string): void {
  let next = { ...getState(), feedback: [{ id: rid("fb"), query, itemId, itemType, helpful, createdAt: now() }, ...getState().feedback] };
  next = appendAudit(next, "feedback.recorded", { itemId, itemType, helpful }, actor);
  commit(next);
}

/* ------------------------------------------------------------------ *
 * Security utilities — also exercised live in the Safety Lab.
 * ------------------------------------------------------------------ */

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "OpenAI key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Generic secret", re: /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9/+=_-]{8,}['"]?/i },
];

export function detectSecrets(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const p of SECRET_PATTERNS) {
    const m = text.match(p.re);
    if (m) matches.push(`${p.name}: ${m[0].slice(0, 24)}…`);
  }
  return { found: matches.length > 0, matches };
}

const INJECTION_PATTERNS = [
  /ignore (?:all )?(?:previous|prior) instructions/i,
  /disregard (?:the )?(?:above|previous|system)/i,
  /you are now (?:a |an )?[a-z ]+/i,
  /reveal (?:your )?(?:system )?prompt/i,
  /(?:print|show|output) (?:your )?(?:system )?prompt/i,
  /\[system\]/i,
  /act as (?:if )?(?:you are|an? )/i,
];

export function detectPromptInjection(text: string): { found: boolean; score: number; matches: string[] } {
  const matches: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) matches.push(m[0].slice(0, 40));
  }
  return { found: matches.length > 0, score: Math.min(1, matches.length * 0.5), matches };
}

const PRIVATE_IP = /(^127\.)|(^10\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)|(^192\.168\.)|(^169\.254\.)|(^::1$)|localhost/i;

export function isPrivateHost(host: string): boolean {
  return PRIVATE_IP.test(host.trim());
}

export function safeVaultPath(rawPath: string): { ok: boolean; resolved: string; reason?: string } {
  let p = rawPath.trim();
  if (!p) return { ok: false, resolved: "", reason: "Empty path." };
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.startsWith("/vault/")) p = "/vault/" + p.replace(/^\/+/, "");
  // Reject traversal and null bytes.
  if (p.includes("\0")) return { ok: false, resolved: p, reason: "Null byte detected." };
  if (/(^|\/)\.\.(\/|$)/.test(p)) return { ok: false, resolved: p, reason: "Path traversal detected (..)." };
  // Normalize repeated slashes.
  const resolved = p.replace(/\/+/g, "/");
  // Final guard: resolved must stay under /vault and not escape.
  const parts = resolved.split("/").filter(Boolean);
  let depth = 0;
  for (const part of parts) {
    if (part === "..") depth--;
    else if (part !== ".") depth++;
    if (depth < 0 || (parts[0] === "vault" && depth < 1)) return { ok: false, resolved, reason: "Path escapes vault root." };
  }
  if (parts[0] !== "vault") return { ok: false, resolved, reason: "Path must remain inside /vault." };
  return { ok: true, resolved };
}

export function verifyConstantTime(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}

export { hashSecret, sha256Hex };
