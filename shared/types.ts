/**
 * shared/types.ts — Common types shared between server and frontend.
 *
 * Both the NEXUS server and browser dashboard import from here,
 * eliminating the type duplication that previously caused drift.
 */

// ── Memory Operations ─────────────────────────────────────────

export interface MemoryRow {
  kind: string; title: string; content: string; tags: string[];
  importance: number; source: string; projectId: string | null;
}

export interface SkillRow {
  name: string; title: string; description: string; content: string;
  category: string; tags: string[]; trigger: string | null; source: string; projectId: string | null;
}

export interface CaptureReport {
  distilled: boolean; transcriptPreserved: boolean; memories: number; transcript: string; reason?: string;
}

// ── Recall ────────────────────────────────────────────────────

export interface RecallItem {
  id: string;
  type: "memory" | "skill" | "note";
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
  matchedBy: ("bm25" | "semantic")[];
}

export interface RecallResult {
  query: string;
  returned: RecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: "lexical" | "semantic";
}

// ── Agent Kernel ──────────────────────────────────────────────

export interface SpawnAgentInput {
  name: string;
  kind?: "sub-agent" | "daemon";
  parentId?: string;
  ring?: number;
  scopes?: string[];
  llmModel?: string;
  tokenBudget?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface EnqueueTaskInput {
  agentId: string;
  label: string;
  kind?: string;
  input?: unknown;
  idempotencyKey?: string;
  traceId?: string;
}

// ── Brain ─────────────────────────────────────────────────────

export interface BrainExport {
  format: "nexus-brain";
  version: number;
  exportedAt: number;
  memories: unknown[];
  skills: unknown[];
}

export interface BrainImportResult {
  memories: number;
  skills: number;
  duplicates: number;
}

// ── Browser ───────────────────────────────────────────────────

export interface BrowserResult {
  ok: boolean;
  url?: string;
  title?: string;
  text?: string;
  screenshot?: string;
  error?: string;
  durationMs: number;
}

// ── LLM ───────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { prompt: number; completion: number; total: number };
}

export interface DistilledMemory {
  kind: "episodic" | "semantic" | "preference" | "reflexion" | "fact";
  title: string;
  content: string;
  tags: string[];
  importance: number;
}

// ── Agent ─────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  kind: string;
  status: string;
  ring: number;
  currentTool: string | null;
  tokenBudget: number;
  tokensUsed: number;
  createdAt: string;
}

// ── Scheduler ─────────────────────────────────────────────────

export interface SchedulerStatus {
  depth: Record<string, number>;
  running: number;
  deadLetter: number;
}
