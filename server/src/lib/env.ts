/**
 * env.ts — lazy environment validation with Zod.
 *
 * Previous: `export const env = load()` executed at import time — any file
 * importing env.ts would crash if DATABASE_URL was missing, even tools that
 * don't need the DB (CLI help, tests, etc.).
 *
 * Now: validation is lazy. `env` is a Proxy that triggers `load()` on first
 * property access. This means importing the module is safe; the error only
 * fires when code actually reads a config value. `getEnv()` also provides
 * eager access when you need to check validity before use.
 */
import { config } from 'dotenv';
import { z } from 'zod';

config(); // Load .env file into process.env

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(9900),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default(''),
  NEXUS_API_KEY: z.string().default('nk_local_dev_key'),
  NEXUS_ALLOWED_ORIGINS: z.string().default('http://localhost:9900'),
  NEXUS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(120),
  NEXUS_RATE_LIMIT_SSE_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(1200),
  NEXUS_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(50 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  NEXUS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NEXUS_LOG_ERRORS: z.coerce.number().int().min(0).max(1).default(1),
  NEXUS_LLM_BASE_URL: z.string().default(''),
  NEXUS_LLM_API_KEY: z.string().default(''),
  NEXUS_LLM_MODEL: z.string().default(''),
  NEXUS_LLM_SIMPLE_MODEL: z.string().default(''),
  NEXUS_LLM_MEDIUM_MODEL: z.string().default(''),
  NEXUS_LLM_COMPLEX_MODEL: z.string().default(''),
  NEXUS_EMBEDDING_MODEL: z.string().default(''),
  NEXUS_OBSIDIAN_VAULT: z.string().default(''),
  NEXUS_DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  NEXUS_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  NEXUS_TRUST_PROXY: z.coerce.boolean().default(false),
  NEXUS_MCP_ORIGIN: z.string().default('http://localhost:9900'),
  NEXUS_DASHBOARD_DIR: z.string().default('../dist'),
  NEXUS_DREAM_MAX_MEMORIES: z.coerce.number().int().min(10).max(100000).default(500),
  NEXUS_DREAM_MAX_SESSIONS: z.coerce.number().int().min(1).max(1000).default(20),
  NEXUS_DREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  NEXUS_SANDBOX_ENABLED: z.coerce.boolean().default(false),
  NEXUS_SANDBOX_IMAGE: z.string().default('node:20-alpine'),
  NEXUS_SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  NEXUS_SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  NEXUS_BUS_BACKEND: z.enum(['memory', 'redis']).default('memory'),
  NEXUS_REDIS_URL: z.string().default('redis://localhost:6379'),
  // Embedding config
  NEXUS_EMBEDDING_DIM: z.coerce.number().int().min(64).max(8192).default(1536),
  NEXUS_EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(1024).default(64),
  // Recall config
  NEXUS_RRF_K: z.coerce.number().int().min(1).max(1000).default(60),
  NEXUS_SEMANTIC_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  NEXUS_RECENCY_HALFLIFE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  NEXUS_RECALL_WEIGHT_RRF: z.coerce.number().min(0).max(1).default(0.5),
  NEXUS_RECALL_WEIGHT_IMPORTANCE: z.coerce.number().min(0).max(1).default(0.3),
  NEXUS_RECALL_WEIGHT_RECENCY: z.coerce.number().min(0).max(1).default(0.1),
  NEXUS_RECALL_WEIGHT_FEEDBACK: z.coerce.number().min(0).max(1).default(0.1),
  // Skill compiler config
  NEXUS_COMPILATION_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
  NEXUS_EVAL_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(1.0),
  // Circuit breaker config
  NEXUS_CB_THRESHOLD: z.coerce.number().int().min(1).max(100).default(3),
  NEXUS_CB_RESET_MS: z.coerce.number().int().min(1000).max(600000).default(30000),
  // Worker defaults
  NEXUS_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60000).default(2000),
  NEXUS_WORKER_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(3),
  NEXUS_WORKER_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(120000),
  NEXUS_WORKER_MAINTENANCE_MS: z.coerce.number().int().min(5000).max(600000).default(60000),
  NEXUS_WORKER_STALE_TASK_MS: z.coerce.number().int().min(10000).max(3600000).default(300000),
  NEXUS_WORKER_HEARTBEAT_MS: z.coerce.number().int().min(10000).max(600000).default(120000),
  NEXUS_WORKER_AUTO_KILL: z.coerce.boolean().default(false),
  // Recall corpus cap
  NEXUS_MAX_RECALL_CORPUS: z.coerce.number().int().min(100).max(500000).default(10000),
  // Auth cache config
  NEXUS_AUTH_PRINCIPAL_TTL_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  NEXUS_AUTH_RESULT_TTL_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  NEXUS_AUTH_RESULT_CACHE_CAP: z.coerce.number().int().min(100).max(10000).default(1024),
  // OpenTelemetry
  NEXUS_OTEL_ENDPOINT: z.string().default(''),
  NEXUS_OTEL_API_KEY: z.string().default(''),
  // Blockchain anchoring
  NEXUS_BLOCKCHAIN_ENABLED: z.coerce.boolean().default(false),
  NEXUS_BLOCKCHAIN_RPC_URL: z.string().default(''),
  NEXUS_BLOCKCHAIN_PRIVATE_KEY: z.string().default(''),
  NEXUS_BLOCKCHAIN_ENCRYPTION_KEY: z.string().default(''),
  NEXUS_BLOCKCHAIN_CHAIN_ID: z.coerce.number().int().min(1).max(999999).default(1),
  NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL: z.coerce.number().int().min(1).max(100000).default(10),
  NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL_SEC: z.coerce.number().int().min(1).max(3600000).default(60),
  NEXUS_BLOCKCHAIN_ANCHOR_MAX_AGE: z.coerce.number().int().min(1).max(315360000).default(3600),
  // Provider API keys (standard env vars, validated through env proxy)
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  GOOGLE_API_KEY: z.string().default(''),
  VLLM_API_KEY: z.string().default(''),
  M3_API_KEY: z.string().default(''),
  PORTKEY_API_KEY: z.string().default(''),
  PORTKEY_BASE_URL: z.string().default(''),
  GROQ_API_KEY: z.string().default(''),
  MISTRAL_API_KEY: z.string().default(''),
  AZURE_OPENAI_API_KEY: z.string().default(''),
  AZURE_OPENAI_ENDPOINT: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

let _env: Env | null = null;

/**
 * Eagerly load and validate env. Throws with actionable errors on invalid config.
 * Production hardening: fail fast on unsafe origins.
 */
export function getEnv(): Env {
  if (_env) return _env;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  _env = parsed.data;
  if (_env.NEXUS_BLOCKCHAIN_PRIVATE_KEY && /^[a-fA-F0-9]{64}$/.test(_env.NEXUS_BLOCKCHAIN_PRIVATE_KEY) && !_env.NEXUS_BLOCKCHAIN_ENCRYPTION_KEY) {
    console.warn('[NEXUS] WARNING: NEXUS_BLOCKCHAIN_PRIVATE_KEY is a raw unencrypted 64-hex key, but NEXUS_BLOCKCHAIN_ENCRYPTION_KEY is empty. This is insecure!');
  }
  if (_env.NODE_ENV === 'production') {
    if (_env.NEXUS_ALLOWED_ORIGINS.includes('localhost') || _env.NEXUS_ALLOWED_ORIGINS === '*') {
      throw new Error(
        'Production must not allow localhost or wildcard origins (NEXUS_ALLOWED_ORIGINS).'
      );
    }
    if (!_env.NEXUS_API_KEY) {
      console.warn('[NEXUS] WARNING: no operator NEXUS_API_KEY set in production.');
    }
  }
  return _env;
}

/**
 * Backward-compatible `env` Proxy. Triggers validation on first property access.
 * Any module can do `env.DATABASE_URL` — validation fires only once, on first use.
 */
export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    return (getEnv() as Record<string, unknown>)[prop];
  },
});

export const isProduction = (): boolean => getEnv().NODE_ENV === 'production';
export const llmConfigured = (): boolean => {
  const e = getEnv();
  return Boolean(e.NEXUS_LLM_BASE_URL && e.NEXUS_LLM_API_KEY && e.NEXUS_LLM_MODEL);
};

/** Reset env cache (for tests that change process.env). */
export function resetEnv(): void {
  _env = null;
}
