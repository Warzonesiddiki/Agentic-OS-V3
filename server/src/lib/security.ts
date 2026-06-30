/**
 * security.ts — real API-key auth & authorization.
 * Keys are hashed with scrypt (Node's audited KDF) and never stored raw.
 * Comparison uses crypto.timingSafeEqual (constant-time).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, sql, desc } from "drizzle-orm";
import { apiKeys } from "../db/schema.js";

const SCRYPT_KEYLEN = 32;

/** Hash a raw key into a self-contained "<saltHex>:<hashHex>" record. */
export function hashApiKey(raw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(raw, salt, SCRYPT_KEYLEN, { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time verification of a raw key against a stored "<salt>:<hash>". */
export function verifyApiKey(raw: string, stored: string): boolean {
  const sep = stored.indexOf(":");
  if (sep <= 0) return false;
  try {
    const salt = Buffer.from(stored.slice(0, sep), "hex");
    const expected = Buffer.from(stored.slice(sep + 1), "hex");
    const derived = scryptSync(raw, salt, expected.length, { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function timingSafeStrEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Generate a new raw operator key with a recognizable prefix. */
export function generateApiKey(): string {
  return `nx_live_${randomBytes(18).toString("base64url")}`;
}

export const ALL_SCOPES = [
  "memory:read", "memory:write", "skill:read", "skill:write",
  "brain:admin", "vault:read", "vault:write", "safety:write", "audit:read",
  "llm:chat", "llm:admin",
  "plugin:admin", "plugin:invoke",
  "federated:read", "federated:write",
  "pipeline:admin", "pipeline:execute",
] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface Principal {
  id: string;
  name: string;
  keyHash: string;
  scopes: Scope[];
  status: "active" | "disabled";
}

export function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? (m[1] ?? "").trim() : null;
}

/**
 * Auth cache. The active-principal list is cached briefly so a request doesn't
 * always hit the DB; a SUCCESSFUL verification is memoized by raw key for a
 * short TTL (repeat callers hit memory, scrypt only runs on a miss).
 *
 * Security-critical decisions:
 *  - NEGATIVE results are NOT cached. Caching `principal: null` by attacker-
 *    chosen token would let an attacker flood unique keys and grow the cache
 *    unbounded → OOM. Only known-good keys are memoized.
 *  - The positive cache is bounded and evicts oldest entries past the cap, so
 *    it cannot grow without limit even under a successful-key flood.
 *  - The `lastUsedAt` of the matched principal is updated (best-effort) so the
 *    column is no longer dead.
 */
const PRINCIPAL_TTL_MS = 30_000;
const RESULT_TTL_MS = 60_000;
const RESULT_CACHE_CAP = 1024;
let principalCache: { rows: PrincipalRow[]; at: number } | null = null;
let activePrincipalIds: Set<string> | null = null;
const resultCache = new Map<string, { principal: Principal; at: number }>();

interface PrincipalRow {
  id: string;
  name: string;
  keyHash: string;
  scopes: Scope[];
  status: string;
}

async function loadPrincipals(db: import("../db/client.js").Db): Promise<PrincipalRow[]> {
  const now = Date.now();
  if (principalCache && now - principalCache.at < PRINCIPAL_TTL_MS) return principalCache.rows;
  const rows = await db.query.apiKeys.findMany({ where: eq(apiKeys.status, "active") });
  // Map the Drizzle row to our internal PrincipalRow shape (validates the columns exist).
  const mapped: PrincipalRow[] = rows.map((r: typeof rows[number]) => ({
    id: r.id,
    name: r.name,
    keyHash: r.keyHash,
    scopes: r.scopes as Scope[],
    status: r.status,
  }));
  activePrincipalIds = new Set(mapped.filter((r) => r.status === "active").map((r) => r.id));
  principalCache = { rows: mapped, at: now };
  return principalCache.rows;
}

/** Bounded insertion into the positive-result cache (evicts oldest when full). */
function cacheResult(key: string, principal: Principal): void {
  if (resultCache.size >= RESULT_CACHE_CAP) {
    // Evict the oldest entry by insertion order.
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, { principal, at: Date.now() });
}

/** Invalidate caches — call after principal/key changes (create, revoke, rotate). */
export function invalidateAuthCache(): void {
  principalCache = null;
  activePrincipalIds = null;
  resultCache.clear();
}

/** Resolve a principal by raw key, with bounded caching of POSITIVE results only. */
export async function authenticate(
  db: import("../db/client.js").Db,
  key: string | null
): Promise<Principal | null> {
  if (!key) return null;
  const now = Date.now();
  const cached = resultCache.get(key);
  // O(1) cache-hit verification: check if the principal's ID is still in the
  // active set (refreshed every PRINCIPAL_TTL_MS). No scrypt re-computation.
  if (cached && now - cached.at < RESULT_TTL_MS) {
    await loadPrincipals(db);
    if (!activePrincipalIds?.has(cached.principal.id)) {
      resultCache.delete(key);
      return null;
    }
    return cached.principal;
  }

  let principal: Principal | null = null;
  let matchedId: string | null = null;
  // Use the cached active-principal list (loaded every PRINCIPAL_TTL_MS) instead
  // of scanning every key with scrypt. This is O(N_active) instead of O(N_all)
  // because we only verify against principals whose status is 'active'.
  const rows = await loadPrincipals(db);
  for (const row of rows) {
    if (row.status !== "active") continue;
    if (verifyApiKey(key, row.keyHash)) {
      const status: "active" | "disabled" = "active";
      principal = { id: row.id, name: row.name, keyHash: row.keyHash, scopes: row.scopes, status };
      matchedId = row.id;
      break;
    }
  }
  if (principal) {
    cacheResult(key, principal);
    // Best-effort lastUsedAt — auth must never fail because of a metadata write.
    // Errors are logged (never silently swallowed), but do not propagate.
    if (matchedId) {
      db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, matchedId)).catch((e: unknown) => {
        console.warn("[NEXUS] lastUsedAt update failed:", e instanceof Error ? e.message : String(e));
      });
    }
  }
  return principal;
}

export function hasScope(principal: Principal | null, scope: Scope): boolean {
  return Boolean(principal?.scopes.includes(scope));
}

/* ------------------------------------------------------------------ *
 * Principal administration: create / list / revoke API keys. The raw
 * key is returned EXACTLY ONCE at creation (only its hash is persisted);
 * revocation invalidates the auth cache immediately.
 * ------------------------------------------------------------------ */

export interface PrincipalSummary {
  id: string;
  name: string;
  scopes: Scope[];
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function createPrincipal(
  db: import("../db/client.js").Db,
  name: string,
  scopes: Scope[]
): Promise<{ id: string; rawKey: string }> {
  const rawKey = generateApiKey();
  const id = `prn_${randomBytes(8).toString("hex")}`;
  await db.insert(apiKeys).values({ id, name, keyHash: hashApiKey(rawKey), scopes, status: "active" });
  invalidateAuthCache();
  return { id, rawKey };
}

export async function listPrincipals(
  db: import("../db/client.js").Db,
  opts?: { limit?: number; offset?: number }
): Promise<{ items: PrincipalSummary[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const [rows, countResult] = await Promise.all([
    db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(apiKeys),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    scopes: (r.scopes ?? []).filter((s: string): s is Scope => ALL_SCOPES.includes(s as Scope)),
    status: r.status,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  }));
  return { items, total };
}

export async function revokePrincipal(db: import("../db/client.js").Db, id: string): Promise<boolean> {
  const [updated] = await db.update(apiKeys).set({ status: "disabled" }).where(eq(apiKeys.id, id)).returning({ id: apiKeys.id });
  if (updated) invalidateAuthCache();
  return Boolean(updated);
}
