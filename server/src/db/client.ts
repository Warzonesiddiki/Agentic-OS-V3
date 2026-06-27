/**
 * client.ts — bounded connection pool with statement timeouts.
 *
 * Lazy singleton: the postgres pool and Drizzle instance are created on FIRST
 * QUERY, not at import time. This means importing this module is safe even if
 * DATABASE_URL is not set — the error only fires when code actually uses the
 * database (bootstrap, query, etc.). Tools, CLI help, and tests that don't
 * touch the DB won't crash at import time.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../lib/env.js";
import * as schema from "./schema.js";

export type Schema = typeof schema;

let _queryClient: ReturnType<typeof postgres> | null = null;
let _instance: ReturnType<typeof drizzle<Schema>> | null = null;

function getInstance() {
  if (_instance) return _instance;
  const e = getEnv();
  _queryClient = postgres(e.DATABASE_URL, {
    max: e.NEXUS_DB_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    // Statement-level timeout (ms) to protect the pool from runaway queries.
    connection: { statement_timeout: e.NEXUS_QUERY_TIMEOUT_MS },
    // Kept off to avoid prepared-statement issues with connection proxies
    // like PgBouncer in transaction mode.
    prepare: false,
  });
  _instance = drizzle(_queryClient, { schema, logger: e.NEXUS_LOG_LEVEL === "debug" });
  return _instance;
}

export type Db = ReturnType<typeof drizzle<Schema>>;

/**
 * Lazy-initialized database handle. A Proxy transparently delegates every
 * property/method access to the real Drizzle instance, deferring pool
 * creation until the first actual query.
 */
export const db = new Proxy({} as Db, {
  get(_, prop: string | symbol, receiver: unknown) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") return value.bind(instance);
    return value;
  },
});

/** Graceful shutdown: close the pool if it was initialized. */
export async function closeDb(): Promise<void> {
  if (_queryClient) {
    await _queryClient.end({ timeout: 5 });
    _queryClient = null;
    _instance = null;
  }
}

/** Returns whether the pool has been lazily initialized. Used by health checks. */
export function isPoolInitialized(): boolean {
  return _instance !== null;
}
