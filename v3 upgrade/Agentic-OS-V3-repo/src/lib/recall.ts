/**
 * recall.ts — token-budgeted unified recall.
 * Searches memories, skills, and indexed notes with a BM25 lexical core,
 * blended with importance, recency, and feedback signals, then greedily
 * packs results under a token budget and records the savings in the ledger.
 */
import { clamp, estimateTokens, lexicalScores, now, tokenize, truncate } from "./core";
import { appendAudit, appendLedgerState, commit, getState } from "./engine";
import type { LedgerEntry, Memory, NexusState, Note, RecallItem, RecallResult, Skill } from "./types";

interface Candidate {
  item: RecallItem;
  lexical: number;
  importance: number;
  recency: number;
  feedback: number;
}

const DAY = 86400000;

function recencyScore(updatedAt: number | null, createdAt: number): number {
  const ts = updatedAt ?? createdAt;
  const ageDays = (Date.now() - ts) / DAY;
  return Math.exp(-ageDays / 30);
}

function feedbackBonus(state: NexusState, itemId: string): number {
  let helpful = 0;
  let total = 0;
  for (const f of state.feedback) {
    if (f.itemId === itemId) {
      total++;
      if (f.helpful) helpful++;
    }
  }
  if (!total) return 0;
  return helpful / total * 0.15 + 0.05 * Math.min(total, 3) * 0.05;
}

export function recall(query: string, budget: number, actor = "system"): RecallResult {
  const state = getState();
  const memDocs = state.memories.map((m) => ({ id: m.id, text: `${m.title} ${m.content} ${m.tags.join(" ")}` }));
  const skillDocs = state.skills.map((s) => ({ id: s.id, text: `${s.title} ${s.description} ${s.content} ${s.tags.join(" ")}` }));
  const noteDocs = state.notes.map((n) => ({ id: n.id, text: `${n.title} ${n.content} ${n.tags.join(" ")} ${n.wikilinks.join(" ")}` }));

  const memScores = lexicalScores(memDocs, query);
  const skillScores = lexicalScores(skillDocs, query);
  const noteScores = lexicalScores(noteDocs, query);

  const allLex = [...memScores.values(), ...skillScores.values(), ...noteScores.values()];
  const maxLex = Math.max(0.0001, ...allLex);

  const candidates: Candidate[] = [];

  for (const m of state.memories) {
    const lex = (memScores.get(m.id) ?? 0) / maxLex;
    if (lex <= 0 && !titleOverlap(m.title, query)) continue;
    candidates.push({
      item: toItem(m, "memory", m.title, m.content),
      lexical: lex,
      importance: m.importance,
      recency: recencyScore(m.updatedAt, m.createdAt),
      feedback: feedbackBonus(state, m.id),
    });
  }
  for (const s of state.skills) {
    const lex = (skillScores.get(s.id) ?? 0) / maxLex;
    if (lex <= 0 && !titleOverlap(s.title, query)) continue;
    candidates.push({
      item: toItem(s, "skill", s.title, `# ${s.title}\n${s.description}\n\n${s.content}`),
      lexical: lex,
      importance: clamp(s.rating, 0.2, 1),
      recency: recencyScore(s.updatedAt, s.createdAt),
      feedback: feedbackBonus(state, s.id),
    });
  }
  for (const n of state.notes) {
    const lex = (noteScores.get(n.id) ?? 0) / maxLex;
    if (lex <= 0 && !titleOverlap(n.title, query)) continue;
    candidates.push({
      item: toItem(n, "note", n.title, n.content),
      lexical: lex,
      importance: 0.45,
      recency: recencyScore(n.indexedAt, n.indexedAt),
      feedback: feedbackBonus(state, n.id),
    });
  }

  for (const c of candidates) {
    const blended = c.lexical * 0.6 + c.importance * 0.25 + c.recency * 0.1 + c.feedback;
    c.item.score = Math.round(blended * 1000) / 1000;
  }

  candidates.sort((a, b) => b.item.score - a.item.score);

  let tokensUsed = 0;
  const returned: RecallItem[] = [];
  let truncated = 0;
  for (const c of candidates) {
    if (tokensUsed + c.item.tokenCost <= budget) {
      returned.push(c.item);
      tokensUsed += c.item.tokenCost;
    } else {
      truncated++;
    }
  }

  applyRecallSideEffects(query, returned, tokensUsed, actor);

  return {
    query,
    returned,
    tokensUsed,
    tokenBudget: budget,
    truncated,
    mode: "lexical",
  };
}

function titleOverlap(title: string, query: string): boolean {
  const q = new Set(tokenize(query));
  return tokenize(title).some((t) => q.has(t));
}

function toItem(src: Memory | Skill | Note, type: "memory" | "skill" | "note", title: string, content: string): RecallItem {
  return {
    id: src.id,
    type,
    title,
    content,
    score: 0,
    tokenCost: estimateTokens(content),
    source: type === "note" ? "vault" : type === "skill" ? "skill" : ("source" in src && typeof src.source === "string" ? src.source : "manual"),
  };
}

function applyRecallSideEffects(query: string, returned: RecallItem[], tokensUsed: number, actor: string): void {
  const state = getState();
  const ids = new Set(returned.map((r) => r.id));
  const memories = state.memories.map((m) =>
    ids.has(m.id) ? { ...m, recallCount: m.recallCount + 1, lastRecalledAt: now() } : m
  );
  const entry: Omit<LedgerEntry, "id" | "createdAt"> = {
    eventType: "recall",
    query: truncate(query, 120),
    tokensInjected: tokensUsed,
    tokensReused: tokensUsed,
    tokensSaved: tokensUsed,
    itemsReturned: returned.length,
    real: true,
  };
  let next: NexusState = { ...state, memories };
  next = appendLedgerState(next, entry);
  next = appendAudit(next, "recall.performed", { query: truncate(query, 80), items: returned.length, tokensUsed }, actor);
  commit(next);
}

/** Compact, token-efficient "ambient" brain context for an agent. */
export function ambient(): { text: string; tokens: number; memories: number } {
  const state = getState();
  const top = [...state.memories].sort((a, b) => b.importance - a.importance).slice(0, 4);
  const lines: string[] = ["# NEXUS ambient context"];
  const active = state.projects.find((p) => p.status === "active") ?? state.projects[0];
  if (active) lines.push(`Active project: ${active.name}`);
  for (const m of top) lines.push(`- (${m.kind}, imp ${m.importance.toFixed(2)}) ${truncate(m.title, 70)}`);
  const text = lines.join("\n");
  return { text, tokens: estimateTokens(text), memories: top.length };
}
