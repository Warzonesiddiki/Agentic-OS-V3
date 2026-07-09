/**
 * Shared drizzle-style in-memory mock for unit tests.
 *
 * Vitest's `vi.mock('../src/db/client.js', () => ({ db: makeDrizzleMock(store) }))`
 * uses this. It supports the query chains used across the memory-* services:
 *   db.insert(t).values(row)                       -> stores row (keyed by row.id)
 *   db.select().from(t).where(eq(col,id)).limit(n) -> matching rows
 *   db.select().from(t).orderBy(col)               -> all rows
 *   db.update(t).set(patch).where(eq(col,id)).returning() -> updated row
 *   db.delete(t).where(eq(col,id))                 -> removes row
 *
 * `extractEqId` pulls the id out of a drizzle `eq(column, value)` condition by
 * scanning the condition object for a string value present in the store.
 */
import type { Row } from './drizzle-mock-types.js';

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
        if (row && row.id) store.set(row.id, row);
        return { returning: () => Promise.resolve([row]) };
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
        orderBy: () => Promise.resolve([...store.values()]),
      }),
    }),
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: (cond: unknown) => {
          // Apply the patch eagerly (some callers omit .returning()).
          const id = extractEqId(cond, store);
          const applyPatch = () => {
            if (id && store.has(id)) {
              const merged = { ...store.get(id)!, ...patch, id };
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
