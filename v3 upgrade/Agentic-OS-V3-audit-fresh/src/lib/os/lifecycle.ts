/**
 * os/lifecycle.ts — CLI-agent lifecycle hooks + dream consolidation + handoffs.
 * Hooks make the agent smarter automatically (context injection before
 * sessions, observation capture after tools, distillation + handoff on end)
 * so memory works even when the LLM forgets to call tools.
 */
import { now, rid, tokenize, truncate } from "../core";
import { appendAudit, commit, getState as getBrain } from "../engine";
import { createMemory } from "../operations";
import { getOSState, updateOS, commitOS } from "./store";
import { addCard, compactContext, observeCommand, syscall } from "./kernel";
import type { RecallResult } from "../types";
import type { DreamRun, Handoff, MemoryCard, SessionRecord } from "./types";

const ACTOR = "lifecycle";

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export function sessionStart(agentId: string, agentKind: SessionRecord["agentKind"], cwd?: string): { sessionId: string; context: string; tokens: number } {
  const session: SessionRecord = { id: rid("ses"), agentId, agentKind, cwd, startedAt: now(), events: 0 };
  commitOS({ ...getOSState(), sessions: [session, ...getOSState().sessions] });
  syscall({ type: "signal.emit", agentId, signalType: "agent.heartbeat", message: "session-start" });
  const ctx = compactContext();
  return { sessionId: session.id, context: ctx.text, tokens: ctx.tokens };
}

export function bumpSession(sessionId: string): void {
  updateOS((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, events: x.events + 1 } : x)) }));
}

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

export interface HookResult {
  event: string;
  injected?: string;
  decision?: { allowed: boolean; reason: string };
  captured?: { id: string; lesson?: string };
  saved?: { memories: number };
  handoff?: string;
}

/** UserPromptSubmit — capture intent, run lightweight recall, suggest context. */
export function hookUserPrompt(sessionId: string, prompt: string): HookResult {
  bumpSession(sessionId);
  const session = getOSState().sessions.find((s) => s.id === sessionId);
  const agentId = session?.agentId ?? "system";
  const r = syscall({ type: "memory.recall", agentId, query: prompt, budget: 600 });
  const data = r.ok && r.data ? (r.data as RecallResult) : undefined;
  const injected = data?.returned.length
    ? `Relevant context:\n${data.returned.map((i) => `- ${i.title}`).join("\n")}`
    : undefined;
  return { event: "UserPromptSubmit", injected };
}

/** PreToolUse — risk policy gate (warn/block), no execution. */
export function hookPreToolUse(sessionId: string, tool: string, args: Record<string, unknown>): HookResult {
  bumpSession(sessionId);
  const session = getOSState().sessions.find((s) => s.id === sessionId);
  const r = syscall({ type: "tool.invoke", agentId: session?.agentId ?? "system", tool, args });
  if (r.ok) return { event: "PreToolUse", decision: { allowed: true, reason: "permitted" } };
  return { event: "PreToolUse", decision: { allowed: false, reason: r.error ?? "denied" } };
}

/** PostToolUse — capture observation + extract durable lessons. */
export function hookPostToolUse(sessionId: string, tool: string, result: { command?: string; exitCode?: number; stdout?: string; stderr?: string; filesChanged?: string[] }): HookResult {
  bumpSession(sessionId);
  const session = getOSState().sessions.find((s) => s.id === sessionId);
  const obs = observeCommand(result.command ?? tool, result.exitCode ?? 0, result.stdout ?? "", result.stderr ?? "", result.filesChanged ?? []);
  let lesson: string | undefined;
  if (obs.result === "failure" && obs.lesson) {
    // Promote a failure into a known_pitfall card (draft until confirmed).
    addCard({ type: "known_pitfall", title: truncate(obs.lesson, 80), summary: obs.lesson, importance: 0.7, confidence: 0.6, evidence: [{ source: "tool", command: obs.command, exitCode: obs.exitCode, timestamp: now() }] }, ACTOR);
    lesson = obs.lesson;
  }
  void session;
  return { event: "PostToolUse", captured: { id: obs.id, lesson } };
}

/** PreCompact — snapshot context before the host compacts it. */
export function hookPreCompact(sessionId: string, taskId?: string): HookResult {
  const session = getOSState().sessions.find((s) => s.id === sessionId);
  const r = syscall({ type: "context.snapshot", agentId: session?.agentId ?? "system", taskId });
  const snapId = r.ok && r.data ? (r.data as { snapshotId?: string }).snapshotId : undefined;
  return { event: "PreCompact", injected: `snapshot ${snapId ?? "?"} saved` };
}

/** Stop — extract memories from the latest assistant message. */
export function hookStop(sessionId: string, lastMessage: string): HookResult {
  bumpSession(sessionId);
  const lines = lastMessage.split(/\n|(?<=[.!?])\s+/).filter((l) => /\b(remember|note|decided|lesson|always|never|fact)\b/i.test(l));
  let memories = 0;
  for (const line of lines.slice(0, 3)) {
    createMemory({ kind: "reflexion", title: truncate(line, 80), content: line, tags: tokenize(line).slice(0, 4), importance: 0.6, source: "hook:stop", projectId: null }, ACTOR);
    memories++;
  }
  return { event: "Stop", saved: { memories } };
}

/** SessionEnd — distill, create handoff, consolidate. */
export function hookSessionEnd(sessionId: string): HookResult {
  const session = getOSState().sessions.find((s) => s.id === sessionId);
  if (!session) return { event: "SessionEnd" };
  updateOS((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, endedAt: now() } : x)) }));
  const handoff = createHandoff(session.agentId, sessionId);
  commit(appendAudit(getBrain(), "session.ended", { sessionId, handoffId: handoff.id, events: session.events }, ACTOR));
  return { event: "SessionEnd", handoff: handoff.id };
}

/** Error — capture; promote recurring errors into known pitfalls. */
export function hookError(sessionId: string, message: string): HookResult {
  bumpSession(sessionId);
  const obs = observeCommand("(error)", 1, "", message, []);
  const similar = getOSState().observations.filter((o) => o.stderrSummary && message.includes(o.stderrSummary.slice(0, 20))).length;
  if (similar >= 2) {
    addCard({ type: "known_pitfall", title: `Recurring error: ${truncate(message, 60)}`, summary: message, importance: 0.8, confidence: 0.85, stability: "confirmed" }, ACTOR);
  }
  void obs;
  return { event: "Error", captured: { id: obs.id, lesson: similar >= 2 ? "Promoted to known pitfall (recurring)." : obs.lesson } };
}

/* ------------------------------------------------------------------ *
 * Handoffs
 * ------------------------------------------------------------------ */

export function createHandoff(agentId: string, sessionId?: string): Handoff {
  const s = getOSState();
  const failures = s.observations.filter((o) => o.result === "failure").slice(0, 5);
  const successes = s.observations.filter((o) => o.result === "success").slice(0, 5);
  const ctx = compactContext();
  const handoff: Handoff = {
    id: rid("hnd"),
    agentFrom: agentId,
    goal: "Advance NEXUS 2.0 stability",
    status: "in-progress",
    completedWork: successes.map((o) => o.command),
    filesChanged: Array.from(new Set(s.observations.flatMap((o) => o.filesChanged))),
    knownFailures: failures.map((o) => o.lesson ?? o.command),
    nextBestStep: failures[0]?.lesson ?? "Continue from last checkpoint.",
    importantContext: truncate(ctx.text, 600),
    commands: {
      recommended: successes.map((o) => o.command).slice(0, 3),
      avoid: failures.map((o) => o.command).slice(0, 3),
    },
    openQuestions: [],
    createdAt: now(),
  };
  commitOS({ ...s, handoffs: [handoff, ...s.handoffs] });
  if (sessionId) updateOS((st) => ({ ...st, sessions: st.sessions.map((x) => (x.id === sessionId ? { ...x, handoffId: handoff.id } : x)) }));
  commit(appendAudit(getBrain(), "handoff.created", { handoffId: handoff.id, agentFrom: agentId }, ACTOR));
  return handoff;
}

export function acceptHandoff(agentId: string, handoffId: string): { loaded: boolean; context: string } {
  const s = getOSState();
  const h = s.handoffs.find((x) => x.id === handoffId || x.id === "latest" || handoffId === "latest") ?? s.handoffs[0];
  if (!h) return { loaded: false, context: "No handoff available." };
  commit(appendAudit(getBrain(), "handoff.accepted", { handoffId: h.id, agentTo: agentId }, ACTOR));
  return { loaded: true, context: `# Handoff from ${h.agentFrom}\n\n## Next step\n${h.nextBestStep}\n\n## Avoid\n${h.commands.avoid.map((c) => `- ${c}`).join("\n")}\n\n${h.importantContext}` };
}

export function latestHandoff(): Handoff | undefined {
  return getOSState().handoffs[0];
}

/* ------------------------------------------------------------------ *
 * Dream / consolidation — deterministic, capped
 * ------------------------------------------------------------------ */

const DREAM_MAX_MEMORIES = 500;
const DREAM_MAX_SESSIONS = 20;

export function dreamRun(): DreamRun {
  const s = getOSState();
  const t = now();
  const cards = s.cards.slice(0, DREAM_MAX_MEMORIES);

  // 1. Merge duplicates (same title+type).
  const seen = new Map<string, MemoryCard>();
  let mergedDuplicates = 0;
  const deduped: MemoryCard[] = [];
  for (const c of cards) {
    const key = `${c.type}:${c.title.toLowerCase()}`;
    if (seen.has(key)) {
      const prev = seen.get(key)!;
      prev.evidence = [...prev.evidence, ...c.evidence].slice(0, 8);
      prev.confidence = Math.min(1, prev.confidence + 0.1);
      mergedDuplicates++;
    } else {
      seen.set(key, c);
      deduped.push(c);
    }
  }

  // 2. Promote repeated corrections (evidence >= 2, draft) to confirmed.
  let promotedPreferences = 0;
  for (const c of deduped) {
    if (c.stability === "draft" && c.evidence.length >= 2) {
      c.stability = "confirmed";
      c.confidence = Math.min(1, c.confidence + 0.15);
      promotedPreferences++;
    }
  }

  // 3. Detect contradictions — ONLY genuine polarity conflicts on the same
  //    entity (one asserts X, a newer one asserts NOT-X). Mere co-occurrence
  //    of an entity never downgrades a valid memory.
  let contradicted = 0;
  const byEntity = new Map<string, MemoryCard[]>();
  for (const c of deduped) {
    for (const e of c.entities) {
      const arr = byEntity.get(e) ?? [];
      arr.push(c);
      byEntity.set(e, arr);
    }
  }
  for (const group of byEntity.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.updatedAt - a.updatedAt);
    const newer = group[0];
    for (let i = 1; i < group.length; i++) {
      const older = group[i];
      if (older.stability !== "confirmed") continue;
      if (isPolarityConflict(newer.summary, older.summary) || isPolarityConflict(newer.title, older.title)) {
        older.stability = "contradicted";
        contradicted++;
      }
    }
  }

  // 4. Decay stale, low-access cards.
  let decayed = 0;
  for (const c of deduped) {
    const ageDays = (t - c.updatedAt) / 86400000;
    if (c.accessCount === 0 && ageDays > c.decayHalfLifeDays && c.stability === "draft") {
      c.importance = Math.max(0, c.importance * 0.7);
      decayed++;
    }
  }

  // 5. Consolidate recent sessions.
  const consolidatedSessions = Math.min(DREAM_MAX_SESSIONS, s.sessions.filter((x) => !x.endedAt).length);

  const digest = [
    `Merged ${mergedDuplicates} duplicate cards.`,
    `Promoted ${promotedPreferences} cards to confirmed.`,
    `Marked ${contradicted} cards as contradicted.`,
    `Decayed ${decayed} stale draft cards.`,
    `Consolidated ${consolidatedSessions} open sessions.`,
  ];
  const run: DreamRun = { id: rid("drm"), mergedDuplicates, promotedPreferences, contradicted, decayed, consolidatedSessions, digest, createdAt: t };

  commitOS({ ...s, cards: deduped, dreamLog: [run, ...s.dreamLog] });
  commit(appendAudit(getBrain(), "dream.completed", { mergedDuplicates, promotedPreferences, contradicted, decayed }, ACTOR));
  return run;
}

/**
 * Detect genuine polarity conflicts: one statement asserts X while a paired
 * statement asserts the opposite (negation). Co-occurrence alone is NOT a
 * conflict. Conservative on purpose — false positives destroy real memories.
 */
function isPolarityConflict(a: string, b: string): boolean {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  if (A === B) return false;
  // Only treat as a conflict if one side carries an explicit negation that the
  // other side lacks, AND they otherwise share the same key noun.
  const neg = /\b(not|never|don't|do not|avoid|never use|disable|should not|must not)\b/;
  const aNeg = neg.test(A);
  const bNeg = neg.test(B);
  if (aNeg === bNeg) return false; // same polarity → not a conflict
  // Require a shared significant token so "always use X" vs "never use Y" doesn't false-fire.
  const ta = new Set(tokenize(a));
  const shared = tokenize(b).filter((t) => ta.has(t));
  return shared.length >= 1;
}

/* ------------------------------------------------------------------ *
 * Memory quality commands
 * ------------------------------------------------------------------ */

export function setCardStability(id: string, stability: MemoryCard["stability"], actor = "operator"): void {
  updateOS((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, stability, confidence: stability === "confirmed" ? Math.min(1, c.confidence + 0.1) : c.confidence, updatedAt: now() } : c)) }));
  commit(appendAudit(getBrain(), "card.stability", { id, stability }, actor));
}

export function verifyCard(id: string, actor = "operator"): void {
  updateOS((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, lastVerifiedAt: now(), confidence: Math.min(1, c.confidence + 0.1) } : c)) }));
  commit(appendAudit(getBrain(), "card.verified", { id }, actor));
}

export function linkCards(from: string, to: string, kind: import("./types").EdgeKind, actor = "operator"): void {
  const edge = { id: rid("edg"), from, to, kind, createdAt: now() };
  updateOS((s) => ({ ...s, edges: [...s.edges.filter((e) => !(e.from === from && e.to === to && e.kind === kind)), edge] }));
  commit(appendAudit(getBrain(), "card.linked", { from, to, kind }, actor));
}
