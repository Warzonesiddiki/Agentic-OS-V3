/**
 * Shared drizzle-style in-memory mock for unit tests.
 *
 * Used as `vi.mock('../src/db/client.js', () => ({ db: makeDrizzleMock(store) }))`.
 * Supports the query chains used across the memory-* services:
 *   db.insert(t).values(row)                       -> stores row (keyed by id/agentId/memoryId)
 *   db.select().from(t).where(eq(col,val)).limit(n) -> matching rows
 *   db.select().from(t).orderBy(col)               -> all rows (sorted by name)
 *   db.update(t).set(patch).where(eq(col,val))[.returning()] -> updated row
 *   db.delete(t).where(eq(col,val))                -> removes row
 *
 * `extractEqId` pulls the matching id out of a drizzle `eq(...)` condition by
 * scanning the condition object for a string value present as a store key.
 */
import type { Row } from './drizzle-mock-types.ts';

function keyOf(row: Row): string | undefined {
  return (row.id ?? row.agentId ?? row.memoryId ?? row.clusterId) as string | undefined;
}

export function extractEqId(cond: unknown, store: Map<string, Row>): string | undefined {
  if (!cond || typeof cond !== 'object') return undefined;
  const c = cond as Record<string, unknown>;
  for (const v of Object.values(c)) {
    if (typeof v === 'string' && store.has(v)) return v;
    if (v && typeof v === 'object') {
      const inner = extractEqId(v, store);
      if (inner) return inner;
    }
  }
  return undefined;
}

export function makeDrizzleMock(store: Map<string, Row>) {
  const resolve = (id?: string) =>
    id && store.has(id) ? [store.get(id)!] : [...store.values()];

  return {
    insert: () => ({
      values: (row: Row) => {
        const k = keyOf(row);
        if (k) store.set(k, row);
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve(k ? [store.get(k)!] : [row]),
          }),
          returning: () => Promise.resolve(k ? [store.get(k)!] : [row]),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          const rows = resolve(extractEqId(cond, store));
          return {
            limit: () => Promise.resolve(rows),
            orderBy: () => Promise.resolve(rows),
          };
        },
        orderBy: () => Promise.resolve([...store.values()].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))),
      }),
    }),
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: (cond: unknown) => {
          const id = extractEqId(cond, store);
          const applyPatch = () => {
            if (id && store.has(id)) {
              const merged = { ...store.get(id)!, ...patch, ...(id ? { id } : {}) };
              store.set(id, merged);
              return merged;
            }
            return undefined;
          };
          const merged = applyPatch();
          return {
            returning: () => Promise.resolve(merged ? [merged] : []),
          };
        },
      }),
    }),
    delete: () => ({
      where: (cond: unknown) => {
        const id = extractEqId(cond, store);
        if (id) store.delete(id);
        return Promise.resolve(undefined);
      },
    }),
  };
}
