/**
 * Environment validation and typed access.
 *
 * Keep every runtime setting in this schema: callers must not reach into
 * process.env directly and unrecognised boolean strings must never become true.
 */
import { z } from 'zod';

const integer = (fallback: number, min = 0) =>
  z.coerce.number().int().min(min).default(fallback);
const number = (fallback: number, min = 0) => z.coerce.number().min(min).default(fallback);
const boolean = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => ['true', '1', 'yes', 'on'].includes(value));
const optionalString = z.string().default('');

const envSchema = z.object({
  PORT: integer(9900, 1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: optionalString,
  /** Local SQLite path. Kept out of request-controlled inputs for durable local mode. */
  NEXUS_SQLITE_PATH: z.string().min(1).default('./agentic-os.db'),
  NEXUS_DB_POOL_MAX: integer(20, 1),
  NEXUS_QUERY_TIMEOUT_MS: integer(15_000, 1),

  NEXUS_API_KEY: optionalString,
  NEXUS_ALLOWED_ORIGINS: z.string().default('http://localhost:9900'),
  NEXUS_RATE_LIMIT_PER_MINUTE: integer(120, 1),
  NEXUS_RATE_LIMIT_SSE_PER_MINUTE: integer(60, 1),
  NEXUS_MAX_BODY_BYTES: integer(5_242_880, 1),
  NEXUS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NEXUS_LOG_ERRORS: boolean(true),
  NEXUS_TRUST_PROXY: boolean(false),
  NEXUS_AUTH_PRINCIPAL_TTL_MS: integer(30_000, 1),
  NEXUS_AUTH_RESULT_TTL_MS: integer(60_000, 1),
  NEXUS_AUTH_RESULT_CACHE_CAP: integer(1024, 1),
  ZERO_TRUST_SECRET: optionalString,
  GEOFENCE_ALLOW_COUNTRIES: optionalString,
  GEOFENCE_DENY_COUNTRIES: optionalString,
  GEOFENCE_ALLOW_ASNS: optionalString,
  GEOFENCE_DENY_ASNS: optionalString,
  TIME_GATE_START_HOUR: integer(9),
  TIME_GATE_END_HOUR: integer(17),
  TIME_GATE_ALLOWED_DAYS: optionalString,

  HSM_BACKEND: z.enum(['vault', 'aws-kms', 'azure-kv', 'local']).default('local'),
  HSM_LOCAL_KEY: optionalString,
  VAULT_ADDR: optionalString,
  VAULT_TOKEN: optionalString,
  AWS_KMS_KEY_ID: optionalString,
  AZURE_KEYVAULT_URL: optionalString,

  NEXUS_BUS_BACKEND: z.enum(['memory', 'redis']).default('memory'),
  NEXUS_REDIS_URL: z.string().default('redis://localhost:6379'),

  NEXUS_LLM_BASE_URL: optionalString,
  NEXUS_LLM_API_KEY: optionalString,
  NEXUS_LLM_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  GOOGLE_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  MISTRAL_API_KEY: optionalString,
  AZURE_OPENAI_API_KEY: optionalString,
  VLLM_API_KEY: optionalString,
  M3_API_KEY: optionalString,
  PORTKEY_API_KEY: optionalString,
  PORTKEY_BASE_URL: z.string().default('https://api.portkey.ai/v1'),
  NEXUS_LLM_SIMPLE_MODEL: optionalString,
  NEXUS_LLM_MEDIUM_MODEL: optionalString,
  NEXUS_LLM_COMPLEX_MODEL: optionalString,
  NEXUS_LLM_MAX_CONNS: integer(16, 1),
  NEXUS_LLM_CACHE_MAX: integer(1000, 1),
  NEXUS_LLM_CACHE_TTL_MS: integer(30_000, 1),
  NEXUS_CB_THRESHOLD: integer(3, 1),
  NEXUS_CB_RESET_MS: integer(30_000, 1),
  NEXUS_MCP_ORIGIN: z.string().default('http://localhost:9900'),
  NEXUS_EMBEDDING_MODEL: optionalString,

  NEXUS_EMBEDDING_DIM: integer(1536, 1),
  NEXUS_EMBEDDING_BATCH_SIZE: integer(64, 1),
  NEXUS_RRF_K: integer(60, 1),
  NEXUS_SEMANTIC_THRESHOLD: number(0.8),
  NEXUS_RECENCY_HALFLIFE_DAYS: number(30, 0.001),
  NEXUS_RECALL_WEIGHT_RRF: number(0.5),
  NEXUS_RECALL_WEIGHT_IMPORTANCE: number(0.3),
  NEXUS_RECALL_WEIGHT_RECENCY: number(0.1),
  NEXUS_RECALL_WEIGHT_FEEDBACK: number(0.1),
  NEXUS_RECALL_BUDGET: integer(8_000, 1),
  NEXUS_MAX_RECALL_CORPUS: integer(10_000, 1),

  NEXUS_WORKER_POLL_MS: integer(2_000, 1),
  NEXUS_WORKER_MAX_CONCURRENCY: integer(3, 1),
  NEXUS_WORKER_TIMEOUT_MS: integer(120_000, 1),
  NEXUS_WORKER_MAINTENANCE_MS: integer(60_000, 1),
  NEXUS_WORKER_STALE_TASK_MS: integer(300_000, 1),
  NEXUS_WORKER_HEARTBEAT_MS: integer(120_000, 1),
  NEXUS_WORKER_AUTO_KILL: boolean(false),
  NEXUS_AGENT_CONCURRENCY: integer(3, 1),
  NEXUS_SCHEDULER_TICK_MS: integer(60_000, 1),
  NEXUS_SCHEDULER_MAX_CONCURRENT: integer(10, 1),
  NEXUS_SCHEDULER_BACKPRESSURE_DEPTH: integer(1000, 1),
  NEXUS_SCHEDULER_POLICY: z.enum(['mlfq', 'edf', 'fairshare']).default('mlfq'),
  NEXUS_SCHEDULER_DRY_RUN: boolean(false),
  NEXUS_MLFQ_BOOST_MS: integer(30_000, 1),

  NEXUS_SANDBOX_ENABLED: boolean(false),
  NEXUS_SANDBOX_IMAGE: z.string().default('node:20-alpine'),
  NEXUS_SANDBOX_TIMEOUT_MS: integer(30_000, 1),

  NEXUS_OTEL_ENDPOINT: optionalString,
  NEXUS_OTEL_API_KEY: optionalString,
  NEXUS_DASHBOARD_DIR: z.string().default('../dist'),
  NEXUS_OBSIDIAN_VAULT: optionalString,
  NEXUS_COMPILATION_THRESHOLD: integer(5, 1),
  NEXUS_EVAL_MATCH_THRESHOLD: number(1),
  NEXUS_SELF_OPT_LIVE_WRITE: boolean(false),

  NEXUS_BLOCKCHAIN_ENABLED: boolean(false),
  NEXUS_BLOCKCHAIN_RPC_URL: optionalString,
  NEXUS_BLOCKCHAIN_PRIVATE_KEY: optionalString,
  NEXUS_BLOCKCHAIN_CHAIN_ID: integer(1, 1),
  NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL: integer(10, 1),
  NEXUS_BLOCKCHAIN_ANCHOR_MAX_AGE: integer(300_000, 1),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${messages.join('\n')}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

/** Clear the parsed snapshot after tests or an explicit runtime configuration reload. */
export function resetEnv(): void {
  cachedEnv = null;
}

/**
 * Backwards-compatible typed accessor. A proxy keeps it coherent with resetEnv()
 * in tests and explicit configuration reloads instead of retaining a stale copy.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, property: keyof Env) => getEnv()[property],
});

export function llmConfigured(): boolean {
  const current = getEnv();
  return Boolean(
    current.NEXUS_LLM_BASE_URL && current.NEXUS_LLM_API_KEY && current.NEXUS_LLM_MODEL,
  );
}

export function embeddingsConfigured(): boolean {
  const current = getEnv();
  return Boolean(
    current.NEXUS_LLM_BASE_URL &&
      current.NEXUS_LLM_API_KEY &&
      current.NEXUS_EMBEDDING_MODEL,
  );
}
