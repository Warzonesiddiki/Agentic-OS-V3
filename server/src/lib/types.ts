/**
 * types.ts — Shared TypeScript types for NEXUS 2.0
 */

// Core types
export interface Agent {
  id: string;
  name: string;
  kind: 'master' | 'sub-agent' | 'daemon';
  parentId?: string;
  ring: number;
  scopes: string[];
  status: string;
  llmModel?: string;
  tokenBudget: number;
  tokensUsed: number;
  cgroup?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  source: string;
  projectId?: string;
  tokenCost: number;
  recallCount: number;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryKind = 'episodic' | 'semantic' | 'preference' | 'reflexion' | 'fact';

export interface Skill {
  id: string;
  name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  status: SkillStatus;
  rating: number;
  ratingCount: number;
  triggerPattern?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SkillStatus = 'draft' | 'testing' | 'active' | 'deprecated' | 'quarantined';

export interface RecallResult {
  id: string;
  type: 'memory' | 'skill' | 'note';
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
  matchedBy: ('bm25' | 'semantic')[];
}

export interface RecallOptions {
  budget?: number;
  cursor?: number;
  limit?: number;
  types?: ('memory' | 'skill' | 'note')[];
}

export interface AuditEntry {
  sequence: number;
  hash: string;
  prevHash?: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  keyHash: string;
  name: string;
  scopes: string[];
  owner?: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
}

// API response envelope
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorResponse;
  traceId: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Health check
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: boolean;
  pgvector: boolean;
  killSwitch: boolean;
  version: string;
  uptime: number;
}
