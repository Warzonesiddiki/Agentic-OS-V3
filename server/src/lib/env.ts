/**
 * env.ts — Environment variable validation and access
 */

import { z } from 'zod';

// Schema for all environment variables
const envSchema = z.object({
  // Server
  PORT: z.string().default('9900').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().optional(),
  NEXUS_DB_POOL_MAX: z.string().default('20').transform(Number),
  NEXUS_QUERY_TIMEOUT_MS: z.string().default('15000').transform(Number),
  
  // Security
  NEXUS_API_KEY: z.string().optional(),
  NEXUS_ALLOWED_ORIGINS: z.string().default('http://localhost:9900'),
  NEXUS_RATE_LIMIT_PER_MINUTE: z.string().default('120').transform(Number),
  NEXUS_MAX_BODY_BYTES: z.string().default('5242880').transform(Number),
  NEXUS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NEXUS_LOG_ERRORS: z.string().default('1').transform(Boolean),
  NEXUS_TRUST_PROXY: z.string().default('false').transform(Boolean),
  
  // Bus
  NEXUS_BUS_BACKEND: z.enum(['memory', 'redis']).default('memory'),
  NEXUS_REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // LLM
  NEXUS_LLM_BASE_URL: z.string().optional(),
  NEXUS_LLM_API_KEY: z.string().optional(),
  NEXUS_LLM_MODEL: z.string().optional(),
  NEXUS_EMBEDDING_MODEL: z.string().optional(),
  
  // Recall
  NEXUS_EMBEDDING_DIM: z.string().default('1536').transform(Number),
  NEXUS_EMBEDDING_BATCH_SIZE: z.string().default('64').transform(Number),
  NEXUS_RRF_K: z.string().default('60').transform(Number),
  NEXUS_SEMANTIC_THRESHOLD: z.string().default('0.8').transform(Number),
  NEXUS_RECENCY_HALFLIFE_DAYS: z.string().default('30').transform(Number),
  NEXUS_RECALL_WEIGHT_RRF: z.string().default('0.5').transform(Number),
  NEXUS_RECALL_WEIGHT_IMPORTANCE: z.string().default('0.3').transform(Number),
  NEXUS_RECALL_WEIGHT_RECENCY: z.string().default('0.1').transform(Number),
  NEXUS_RECALL_WEIGHT_FEEDBACK: z.string().default('0.1').transform(Number),
  NEXUS_MAX_RECALL_CORPUS: z.string().default('10000').transform(Number),
  
  // Worker
  NEXUS_WORKER_POLL_MS: z.string().default('2000').transform(Number),
  NEXUS_WORKER_MAX_CONCURRENCY: z.string().default('3').transform(Number),
  NEXUS_WORKER_TIMEOUT_MS: z.string().default('120000').transform(Number),
  NEXUS_SCHEDULER_TICK_MS: z.string().default('60000').transform(Number),
  
  // Sandbox
  NEXUS_SANDBOX_ENABLED: z.string().default('false').transform(Boolean),
  NEXUS_SANDBOX_IMAGE: z.string().default('node:20-alpine'),
  NEXUS_SANDBOX_TIMEOUT_MS: z.string().default('30000').transform(Number),
  
  // Telemetry
  NEXUS_OTEL_ENDPOINT: z.string().optional(),
  NEXUS_OTEL_API_KEY: z.string().optional(),
  
  // Blockchain
  NEXUS_BLOCKCHAIN_ENABLED: z.string().default('false').transform(Boolean),
  NEXUS_BLOCKCHAIN_RPC_URL: z.string().optional(),
  NEXUS_BLOCKCHAIN_CHAIN_ID: z.string().default('1').transform(Number),
  NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL: z.string().default('10').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  
  try {
    cachedEnv = envSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid environment:\n${messages.join('\n')}`);
    }
    throw error;
  }
}

export function llmConfigured(): boolean {
  const env = getEnv();
  return !!(env.NEXUS_LLM_BASE_URL && env.NEXUS_LLM_API_KEY && env.NEXUS_LLM_MODEL);
}

export function embeddingsConfigured(): boolean {
  const env = getEnv();
  return !!(env.NEXUS_LLM_BASE_URL && env.NEXUS_LLM_API_KEY && env.NEXUS_EMBEDDING_MODEL);
}
