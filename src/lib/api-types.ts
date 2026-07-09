/** Strict API envelope — discriminated union */
export type ApiEnvelope<T> =
  | { ok: true; data: T; traceId: string }
  | { ok: false; error: { code: string; message: string }; traceId: string };

// ── Domain API response types ────────────────────────────────────

export interface ApiMemory {
  id: string;
  kind: string;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  source: string;
  projectId: string | null;
  tokenCost: number;
  recallCount: number;
  createdAt: number;
  updatedAt: number;
  lastRecalledAt: number | null;
}

export interface ApiSkill {
  id: string;
  name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  trigger: string | null;
  rating: number;
  useCount: number;
  successCount: number;
  failureCount: number;
  source: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApiProject {
  id: string;
  name: string;
  description: string;
  source: string;
  status: string;
  memoryCount: number;
  skillCount: number;
  tokenFootprint: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiNote {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  charCount: number;
  mtime: number | null;
  indexedAt: number;
}

export interface ApiRecallItem {
  id: string;
  type: 'memory' | 'skill' | 'note';
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
}

export interface ApiRecallResult {
  query: string;
  returned: ApiRecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: 'semantic' | 'lexical';
}

export interface ApiAuditEntry {
  sequence: number;
  id: string;
  actor: string;
  action: string;
  payload: unknown;
  prevHash: string;
  entryHash: string;
  createdAt: number;
}

export interface ApiHealth {
  status: string;
  version: string;
  uptime: number;
  memory: number;
}

// ── Pipeline types (serialized) ──────────────────────────────────

export interface PipelineNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Pipeline {
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  createdAt?: number;
  updatedAt?: number;
}

export interface PipelineInput {
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

// ── Generic list response ───────────────────────────────────────

export interface ListResponse<T> {
  total: number;
  items: T[];
}
