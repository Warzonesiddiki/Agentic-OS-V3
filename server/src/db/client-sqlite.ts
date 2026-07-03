/**
 * client-sqlite.ts — SQLite client using better-sqlite3.
 *
 * Lazy singleton pattern identical to client.ts: the database connection and
 * Drizzle instance are created on FIRST QUERY, not at import time. This
 * module is safe to import even when the DB is not needed.
 *
 * The SQLite database file (agentic-os.db) is created in the project root
 * automatically on first connect. Schema tables are created at that time
 * if they don't already exist.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema-sqlite.js";

export type Schema = typeof schema;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The DB file lives in the project root (two levels up from src/db/).
const DB_PATH = resolve(__dirname, "..", "..", "..", "agentic-os.db");

let _client: Database.Database | null = null;
let _instance: ReturnType<typeof drizzle<Schema>> | null = null;

function getInstance() {
  if (_instance) return _instance;

  _client = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance.
  _client.pragma("journal_mode = WAL");
  // Enable foreign key enforcement (off by default in SQLite).
  _client.pragma("foreign_keys = ON");

  _instance = drizzle(_client, { schema, logger: false });
  return _instance;
}

export type Db = ReturnType<typeof drizzle<Schema>>;

/**
 * Lazy-initialized database handle. A Proxy transparently delegates every
 * property/method access to the real Drizzle instance, deferring connection
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

/** Close the SQLite database connection (for graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (_client) {
    _client.close();
    _client = null;
    _instance = null;
  }
}

/** Returns whether the SQLite database has been lazily initialized. */
export function isPoolInitialized(): boolean {
  return _instance !== null;
}

/** The resolved path to the SQLite database file. */
export function getDbPath(): string {
  return DB_PATH;
}
