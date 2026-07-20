/**
 * constants.ts — Shared constants for NEXUS 2.0
 */

// Ring levels for privilege separation
export const RING_LEVELS = {
  KERNEL: 0,      // Highest privilege
  SYSTEM: 1,      // System services
  SUB_AGENT: 2,   // Sub-agents
  USER: 3,        // User-level operations
  EXTERNAL: 4,    // External/untrusted
} as const;

export type RingLevel = typeof RING_LEVELS[keyof typeof RING_LEVELS];

// Default token budgets
export const DEFAULT_TOKEN_BUDGET = 100_000;
export const MAX_TOKEN_BUDGET = 1_000_000;

// RRF constants
export const RRF_K = 60;

// Recency decay
export const RECENCY_HALFLIFE_DAYS = 30;

// Importance weights
export const DEFAULT_IMPORTANCE = 0.5;
export const MAX_IMPORTANCE = 1.0;
export const MIN_IMPORTANCE = 0.0;

// Recall weights
export const RECALL_WEIGHTS = {
  RRF: 0.5,
  IMPORTANCE: 0.3,
  RECENCY: 0.1,
  FEEDBACK: 0.1,
} as const;

// API limits
export const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB
export const RATE_LIMIT_PER_MINUTE = 120;

// Worker settings
export const WORKER_POLL_MS = 2000;
export const WORKER_MAX_CONCURRENCY = 3;
export const WORKER_TIMEOUT_MS = 120_000;

// Sandbox settings
export const SANDBOX_TIMEOUT_MS = 30_000;
export const SANDBOX_MEMORY_LIMIT = '256m';
export const SANDBOX_CPU_LIMIT = '0.5';

// LLM settings
export const LLM_TIMEOUT_MS = 120_000;
export const EMBEDDING_DIM = 1536;
export const EMBEDDING_BATCH_SIZE = 64;

// Database settings
export const DB_POOL_MAX = 20;
export const DB_QUERY_TIMEOUT_MS = 15_000;

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_MEMORY_CONTENT_SIZE = 100 * 1024; // 100KB

// Cache settings
export const LRU_CACHE_MAX_SIZE = 4096;
export const QUERY_CACHE_MAX_SIZE = 4096;

// Audit settings
export const AUDIT_CHAIN_BREAK_THRESHOLD = 3;

// Memory types
export const MEMORY_TYPES = ['episodic', 'semantic', 'preference', 'reflexion', 'fact'] as const;
export type MemoryType = typeof MEMORY_TYPES[number];

// Agent statuses
export const AGENT_STATUSES = ['idle', 'running', 'paused', 'stopped', 'error'] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];

// Skill statuses
export const SKILL_STATUSES = ['draft', 'testing', 'active', 'deprecated', 'quarantined'] as const;
export type SkillStatus = typeof SKILL_STATUSES[number];
