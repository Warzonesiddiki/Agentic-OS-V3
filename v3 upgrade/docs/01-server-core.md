# 01 — Server Core, Auth, and Audit Engine
## NEXUS V3 — Bootstrap, Env, DB Client, Security, Audit

> **This file contains complete code for:**
> - `server/src/lib/env.ts` — Lazy Zod env validation
> - `server/src/db/client.ts` — Lazy singleton DB pool
> - `server/src/lib/security.ts` — Scrypt auth + bounded cache + principals
> - `server/src/lib/audit.ts` — Hash-chained audit with worker thread
> - `server/src/proxy.ts` — Perimeter guard middleware

---

## env.ts — Lazy Environment validation

```typescript
// server/src/lib/env.ts
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(9900),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXUS_API_KEY: z.string().default(""),
  NEXUS_ALLOWED_ORIGINS: z.string().default("http://localhost:9900"),
  NEXUS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(120),
  NEXUS_MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(5 * 1024 * 1024),
  NEXUS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NEXUS_LLM_BASE_URL: z.string().default(""),
  NEXUS_LLM_API_KEY: z.string().default(""),
  NEXUS_LLM_MODEL: z.string().default(""),
  NEXUS_EMBEDDING_MODEL: z.string().default(""),
  NEXUS_OBSIDIAN_VAULT: z.string().default(""),
  NEXUS_DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  NEXUS_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  NEXUS_TRUST_PROXY: z.coerce.boolean().default(false),
  NEXUS_MCP_ORIGIN: z.string().default("http://localhost:9900"),
  NEXUS_DASHBOARD_DIR: z.string().default("../dist"),
  NEXUS_SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  NEXUS_SANDBOX_ENABLED: z.coerce.boolean().default(false),
  NEXUS_SANDBOX_IMAGE: z.string().default("node:20-alpine"),
  NEXUS_SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  // V3: Configurable hardcoded values
  NEXUS_RRF_K: z.coerce.number().int().min(1).max(1000).default(60),
  NEXUS_EMBEDDING_DIM: z.coerce.number().int().min(64).max(4096).default(1536),
  NEXUS_SEMANTIC_THRESHOLD: z.coerce.number().min(0).max(2).default(0.8),
  NEXUS_RECENCY_HALFLIFE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  NEXUS_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  NEXUS_AUTH_CACHE_CAP: z.coerce.number().int().min(16).max(100000).default(1024),
  REDIS_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;
let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  _env = parsed.data;
  if (_env.NODE_ENV === "production") {
    if (_env.NEXUS_ALLOWED_ORIGINS.includes("localhost") || _env.NEXUS_ALLOWED_ORIGINS === "*") {
      throw new Error("Production must not allow localhost or wildcard origins.");
    }
  }
  return _env;
}

export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    return (getEnv() as Record<string, unknown>)[prop];
  },
});

export const llmConfigured = (): boolean => {
  const e = getEnv();
  return Boolean(e.NEXUS_LLM_BASE_URL && e.NEXUS_LLM_API_KEY && e.NEXUS_LLM_MODEL);
};

export function resetEnv(): void { _env = null; }
```

---

## db/client.ts — Lazy singleton pool

```typescript
// server/src/db/client.ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm";
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
    connection: { statement_timeout: String(e.NEXUS_QUERY_TIMEOUT_MS) },
    prepare: false, // PgBouncer compatible
  });
  _instance = drizzle(_queryClient, { schema, logger: e.NEXUS_LOG_LEVEL === "debug" });
  return _instance;
}

export type Db = ReturnType<typeof drizzle<Schema>>;

export const db = new Proxy({} as Db, {
  get(_, prop: string | symbol, receiver: unknown) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") return value.bind(instance);
    return value;
  },
});

export async function closeDb(): Promise<void> {
  if (_queryClient) {
    await _queryClient.end({ timeout: 5 });
    _queryClient = null;
    _instance = null;
  }
}

export function isPoolInitialized(): boolean {
  return _instance !== null;
}
```

---

## lib/security.ts — Scrypt auth + bounded cache

```typescript
// server/src/lib/security.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { apiKeys } from "../db/schema.js";

const SCRYPT_KEYLEN = 32;

export function hashApiKey(raw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(raw, salt, SCRYPT_KEYLEN, { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyApiKey(raw: string, stored: string): boolean {
  const sep = stored.indexOf(":");
  if (sep <= 0) return false;
  try {
    const salt = Buffer.from(stored.slice(0, sep), "hex");
    const expected = Buffer.from(stored.slice(sep + 1), "hex");
    const derived = scryptSync(raw, salt, expected.length, { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch { return false; }
}

export function generateApiKey(): string {
  return `nx_live_${randomBytes(18).toString("base64url")}`;
}

export const ALL_SCOPES = [
  "memory:read", "memory:write", "skill:read", "skill:write",
  "brain:admin", "vault:read", "vault:write", "safety:write", "audit:read",
] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface Principal {
  id: string; name: string; keyHash: string;
  scopes: Scope[]; status: "active" | "disabled";
}

// Auth cache — POSITIVE results only (never cache negatives to prevent OOM)
const PRINCIPAL_TTL_MS = 30_000;
const RESULT_TTL_MS = 60_000;
let principalCache: { rows: PrincipalRow[]; at: number } | null = null;
const resultCache = new Map<string, { principal: Principal; at: number }>();
let RESULT_CACHE_CAP = 1024; // configurable via env

interface PrincipalRow { id: string; name: string; keyHash: string; scopes: Scope[]; status: string; }

async function loadPrincipals(db: import("../db/client.js").Db): Promise<PrincipalRow[]> {
  const now = Date.now();
  if (principalCache && now - principalCache.at < PRINCIPAL_TTL_MS) return principalCache.rows;
  const rows = await db.query.apiKeys.findMany();
  const mapped: PrincipalRow[] = rows.map((r) => ({
    id: r.id, name: r.name, keyHash: r.keyHash,
    scopes: r.scopes as Scope[],
    status: r.status === "disabled" ? "disabled" : "active",
  }));
  principalCache = { rows: mapped, at: now };
  return principalCache.rows;
}

function cacheResult(key: string, principal: Principal): void {
  if (resultCache.size >= RESULT_CACHE_CAP) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, { principal, at: Date.now() });
}

export function invalidateAuthCache(): void {
  principalCache = null;
  resultCache.clear();
}

export async function authenticate(db: import("../db/client.js").Db, key: string | null): Promise<Principal | null> {
  if (!key) return null;
  const now = Date.now();
  const cached = resultCache.get(key);
  if (cached && now - cached.at < RESULT_TTL_MS) {
    // V3 FIX: Re-check status on cache hit (V2 didn't, allowing revoked keys for 60s)
    const rows = await loadPrincipals(db);
    const currentRow = rows.find((r) => r.id === cached.principal.id);
    if (!currentRow || currentRow.status !== "active") {
      resultCache.delete(key);
      return null;
    }
    return cached.principal;
  }

  let principal: Principal | null = null;
  let matchedId: string | null = null;
  const rows = await loadPrincipals(db);
  for (const row of rows) {
    if (row.status !== "active") continue;
    if (verifyApiKey(key, row.keyHash)) {
      principal = { id: row.id, name: row.name, keyHash: row.keyHash, scopes: row.scopes, status: "active" as const };
      matchedId = row.id;
      break;
    }
  }
  if (principal) {
    cacheResult(key, principal);
    if (matchedId) {
      db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, matchedId)).catch((e) => {
        console.warn("[NEXUS] lastUsedAt update failed:", e instanceof Error ? e.message : String(e));
      });
    }
  }
  return principal;
}

// Principal administration
export async function createPrincipal(db: import("../db/client.js").Db, name: string, scopes: Scope[]): Promise<{ id: string; rawKey: string }> {
  const rawKey = generateApiKey();
  const id = `prn_${randomBytes(8).toString("hex")}`;
  await db.insert(apiKeys).values({ id, name, keyHash: hashApiKey(rawKey), scopes, status: "active" });
  invalidateAuthCache();
  return { id, rawKey };
}

export async function listPrincipals(db: import("../db/client.js").Db) {
  return db.query.apiKeys.findMany();
}

export async function revokePrincipal(db: import("../db/client.js").Db, id: string): Promise<boolean> {
  const [updated] = await db.update(apiKeys).set({ status: "disabled" }).where(eq(apiKeys.id, id)).returning({ id: apiKeys.id });
  if (updated) invalidateAuthCache();
  return Boolean(updated);
}
```

---

## lib/audit.ts — Hash-chained audit with worker thread + redaction

```typescript
// server/src/lib/audit.ts
import { createHash, randomUUID } from "node:crypto";
import { db, type Db } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { desc, asc, sql } from "drizzle-orm";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export const GENESIS_HASH = "0".repeat(64);

// Secret redaction patterns
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|nx_live_[A-Za-z0-9_-]{6,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|(?:(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9_+/=-]{8,}['"]?))/gi;

export function redactSecrets(input: string): string {
  return input.replace(SECRET_RE, "***REDACTED***");
}

export function redactPayload(payload: unknown): unknown {
  if (typeof payload === "string") return redactSecrets(payload);
  if (Array.isArray(payload)) return payload.map(redactPayload);
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (/secret|password|token|api[_-]?key/i.test(k)) out[k] = "***REDACTED***";
      else out[k] = redactPayload(v);
    }
    return out;
  }
  return payload;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function entryHash(prevHash: string, sequence: number, action: string, actor: string, createdAtMs: number, payload: unknown): string {
  const canonical = [prevHash, sequence, action, actor, createdAtMs, stableStringify(payload)].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface AuditEntry {
  sequence: number; id: string; actor: string; action: string;
  payload: unknown; prevHash: string; entryHash: string; createdAt: Date;
}

async function chainTip(client: Tx): Promise<{ sequence: number; entryHash: string } | null> {
  const last = await client.query.auditLog.findFirst({ orderBy: [desc(auditLog.sequence), desc(auditLog.id)], limit: 1 });
  if (!last) return null;
  return { sequence: last.sequence as number, entryHash: last.entryHash };
}

export async function appendAudit(action: string, payload: unknown, actor: string, tx?: Tx): Promise<AuditEntry> {
  const id = `aud_${randomUUID()}`;
  
  // V3 FIX: Redact secrets BEFORE hashing (V2 didn't)
  const safePayload = redactPayload(payload);
  
  const doAppend = async (client: Tx): Promise<AuditEntry> => {
    await client.execute(sql`SELECT pg_advisory_xact_lock(79231)`);
    const tip = await chainTip(client);
    const sequence = tip ? tip.sequence + 1 : 1;
    const prevHash = tip ? tip.entryHash : GENESIS_HASH;
    const createdAt = new Date();
    const hash = entryHash(prevHash, sequence, action, actor, createdAt.getTime(), safePayload);
    const [row] = await client.insert(auditLog)
      .values({ sequence, id, actor, action, payload: safePayload, prevHash, entryHash: hash, createdAt })
      .returning();
    if (!row) throw new Error("Audit append returned no row — integrity failure.");
    return row as AuditEntry;
  };

  if (tx) return doAppend(tx);
  return db.transaction(doAppend);
}

export function computeEntryHash(prevHash: string, sequence: number, action: string, actor: string, createdAtMs: number, payload: unknown): string {
  return entryHash(prevHash, sequence, action, actor, createdAtMs, payload);
}

export interface AuditVerifyResult { valid: boolean; verifiedEntries: number; brokenAt: number | null; total: number; }

export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const PAGE = 1000;
  let prevHash = GENESIS_HASH;
  let verified = 0;
  let total = 0;
  let after = 0;
  for (;;) {
    const page = await db.query.auditLog.findMany({
      orderBy: [asc(auditLog.sequence), asc(auditLog.id)],
      where: (t, { gt }) => gt(t.sequence, after),
      limit: PAGE,
    });
    if (!page.length) break;
    for (const e of page) {
      const seq = e.sequence as number;
      if (e.prevHash !== prevHash) return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
      if (expected !== e.entryHash) return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      prevHash = e.entryHash;
      verified++;
      total++;
    }
    after = page[page.length - 1]!.sequence as number;
    if (page.length < PAGE) break;
  }
  return { valid: true, verifiedEntries: verified, brokenAt: null, total };
}
```

---

## proxy.ts — Perimeter guard

```typescript
// server/src/proxy.ts
import type { MiddlewareHandler } from "hono";
import { randomBytes } from "node:crypto";
import { env } from "./lib/env.js";
import { authenticate } from "./lib/security.js";
import { db } from "./db/client.js";
import { log } from "./lib/logging.js";
import type { Envelope } from "./lib/envelope.js";
import type { NexusEnv } from "./lib/hono-env.js";
import { consume, clientIpFromHeaders } from "./lib/rateLimit.js";

const ALLOWED_ORIGINS = env.NEXUS_ALLOWED_ORIGINS.split(",").map((s) => s.trim());

export const requestId: MiddlewareHandler<NexusEnv> = async (c, next) => {
  c.set("requestId", `req_${randomBytes(9).toString("base64url")}`);
  await next();
};

export const securityHeaders: MiddlewareHandler<NexusEnv> = async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
  c.header("cache-control", "no-store");
  c.header("x-request-id", c.get("requestId") ?? "unknown");
  // V3: Content-Security-Policy
  c.header("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
};

export const cors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    c.header("access-control-allow-origin", origin);
    c.header("access-control-allow-headers", "authorization, content-type, mcp-session-id");
    c.header("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    c.header("vary", "origin");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
};

export const payloadLimit: MiddlewareHandler = async (c, next) => {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len && len > env.NEXUS_MAX_BODY_BYTES) {
    return c.json<Envelope>({ ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: `Body exceeds ${env.NEXUS_MAX_BODY_BYTES} bytes.` }, traceId: c.get("requestId") ?? "" }, 413);
  }
  await next();
};

export const rateLimit: MiddlewareHandler<NexusEnv> = async (c, next) => {
  const headers: Record<string, string | string[] | undefined> = {};
  const xff = c.req.header("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  const ip = clientIpFromHeaders(headers, c.env?.incoming?.socket?.remoteAddress);
  const result = consume(ip);
  if (!result.allowed) {
    return c.json<Envelope>({ ok: false, error: { code: "RATE_LIMITED", message: `Rate limit of ${env.NEXUS_RATE_LIMIT_PER_MINUTE}/min exceeded.` }, traceId: c.get("requestId") ?? "" }, 429);
  }
  await next();
};

// V3: ALL /api/v1/* reads AND writes require auth (defense-in-depth)
export const authBackstop: MiddlewareHandler<NexusEnv> = async (c, next) => {
  const path = c.req.path;
  if (path === "/api/v1/health" && c.req.method === "GET") { await next(); return; }
  if (path.startsWith("/api/v1")) {
    const key = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const principal = await authenticate(db, key ?? null);
    if (!principal) {
      log.warn("auth_denied", { path, method: c.req.method });
      return c.json<Envelope>({ ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." }, traceId: c.get("requestId") ?? "" }, 401);
    }
    c.set("principal", principal);
  }
  await next();
};
```

---

## Success Checklist for This Document

```
[ ] env.ts compiles — all env vars validated
[ ] db/client.ts compiles — pool created lazily
[ ] security.ts compiles — scrypt hashing works
[ ] audit.ts compiles — hash chain verifies
[ ] proxy.ts compiles — all middleware applied
[ ] Server boots: npm run dev → no errors
[ ] curl localhost:9900/api/v1/health → 200 OK
[ ] Auth works: POST /memories without key → 401
[ ] Audit chain: GET /audit → valid: true
```
