import { eq, and, gte, lte, desc, sql, or } from 'drizzle-orm';

// ---- in-memory fake Drizzle interpreter ----
function fieldName(op) {
  if (op && typeof op === 'object') {
    if (typeof op.name === 'string') return op.name;
    if (op.queryChunks) {
      const text = op.queryChunks.map((c) => (typeof c === 'string' ? c : c.value ? c.value.join('') : '')).join('');
      const m = text.match(/[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (m) return m[1];
      const m2 = text.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
      return m2 ? m2[0] : null;
    }
  }
  return null;
}

function literalOf(op) {
  if (op && typeof op === 'object' && op.queryChunks) return null;
  return op;
}

function parseComparison(node) {
  const chunks = node.queryChunks || [];
  let field = null;
  let value = undefined;
  let op = '=';
  for (const c of chunks) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if (typeof c.name === 'string') field = c.name;
      else if (c.queryChunks) {
        const f = fieldName(c);
        if (f) field = f;
      }
    } else if (c && c.value && Array.isArray(c.value)) {
      const s = c.value.join('');
      if (s.includes('>=')) op = '>=';
      else if (s.includes('<=')) op = '<=';
      else if (s.includes('<>') || s.includes('!=')) op = '<>';
      else if (s.includes(' like ')) op = 'like';
      else if (s.includes('=')) op = '=';
    } else if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
      value = c;
    }
  }
  return field ? { field, op, value } : null;
}

function isConditionObj(c) {
  return c && c.queryChunks && c.queryChunks.some((x) => x && x.value && Array.isArray(x.value) && /[=<>]/.test(x.value.join('')));
}
function evalNode(node, row) {
  if (!node || !node.queryChunks) return true;
  const chunks = node.queryChunks;
  const subCond = chunks.filter(isConditionObj);
  const connectors = chunks.filter((c) => c && c.value && /and|or/i.test(c.value.join('')));
  if (subCond.length >= 2 && connectors.length >= 1) {
    let result = null;
    let pendingConn = 'and';
    let saw = false;
    for (const c of chunks) {
      if (c && c.value && Array.isArray(c.value)) {
        const s = c.value.join('');
        if (/or/i.test(s)) pendingConn = 'or';
        else if (/and/i.test(s)) pendingConn = 'and';
        continue;
      }
      if (c && c.queryChunks && isConditionObj(c)) {
        const v = evalNode(c, row);
        if (!saw) {
          result = v;
          saw = true;
        } else {
          result = pendingConn === 'or' ? result || v : result && v;
        }
      }
    }
    return result;
  }
  if (subCond.length === 1 && connectors.length === 0) {
    return evalNode(subCond[0], row);
  }
  const cmp = parseComparison(node);
  if (!cmp) return true;
  const cell = row[cmp.field];
  switch (cmp.op) {
    case '=':
      return cell === cmp.value;
    case '>=':
      return cell >= cmp.value;
    case '<=':
      return cell <= cmp.value;
    case '<>':
      return cell !== cmp.value;
    case 'like':
      return String(cell).includes(String(cmp.value).replace(/%/g, ''));
    default:
      return true;
  }
}

// ---- fake db ----
function makeFakeDb() {
  const store = new Map(); // tableName -> rows[]
  function tblName(t) {
    return t && t.name ? t.name : String(t);
  }
  function ensure(t) {
    const n = tblName(t);
    if (!store.has(n)) store.set(n, []);
    return store.get(n);
  }
  function builder(table) {
    let whereCond = null;
    let orderCol = null;
    let orderDir = 'asc';
    const api = {
      from(t) {
        table = t;
        return api;
      },
      where(cond) {
        whereCond = cond;
        return api;
      },
      orderBy(c) {
        if (c && c.queryChunks) {
          orderCol = fieldName(c);
          const text = c.queryChunks.map((x) => (x && x.value ? x.value.join('') : '')).join('');
          orderDir = /desc/i.test(text) ? 'desc' : 'asc';
        } else if (c && c.name) {
          orderCol = c.name;
        }
        return api;
      },
      then(resolve) {
        let rows = ensure(table).slice();
        if (whereCond) rows = rows.filter((r) => evalNode(whereCond, r));
        if (orderCol) rows.sort((a, b) => (orderDir === 'desc' ? b[orderCol] - a[orderCol] || String(b[orderCol]).localeCompare(String(a[orderCol])) : a[orderCol] - b[orderCol] || String(a[orderCol]).localeCompare(String(b[orderCol]))));
        return Promise.resolve(rows).then(resolve);
      },
      async execute() {
        return api.then((r) => r);
      },
    };
    return api;
  }
  const db = {
    _store: store,
    select() {
      return builder(null);
    },
    insert(table) {
      const t = tblName(table);
      return {
        values(row) {
          const rows = Array.isArray(row) ? row : [row];
          const dest = ensure(t);
          for (const r of rows) dest.push({ ...r });
          return {
            returning() {
              return Promise.resolve(rows.map((r) => ({ ...r })));
            },
            onConflictDoNothing() {
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    update(table) {
      const t = tblName(table);
      let setObj = {};
      let cond = null;
      return {
        set(o) {
          setObj = o;
          return this;
        },
        where(c) {
          cond = c;
          return this;
        },
        returning() {
          const dest = ensure(t);
          const matched = dest.filter((r) => evalNode(cond, r));
          for (const m of matched) Object.assign(m, setObj);
          return Promise.resolve(matched.map((r) => ({ ...r })));
        },
        async execute() {
          const dest = ensure(t);
          const matched = dest.filter((r) => evalNode(cond, r));
          for (const m of matched) Object.assign(m, setObj);
          return matched;
        },
      };
    },
    delete(table) {
      const t = tblName(table);
      let cond = null;
      return {
        where(c) {
          cond = c;
          return this;
        },
        async execute() {
          const dest = ensure(t);
          const keep = dest.filter((r) => !evalNode(cond, r));
          store.set(t, keep);
          return keep.length;
        },
      };
    },
  };
  return db;
}

// ---- unit validate the interpreter ----
const db = makeFakeDb();
const orgsT = { name: 'orgs', id: { name: 'id' } };
await db.insert(orgsT).values({ id: 'a', name: 'A' }).returning();
await db.insert(orgsT).values({ id: 'b', name: 'B' }).returning();
const all = await db.select().from(orgsT);
console.log('ALL', all.length, all.map((r) => r.id).join(','));
const aOnly = await db.select().from(orgsT).where(eq(orgsT.id, 'a'));
console.log('EQ a', aOnly.map((r) => r.id).join(','));
const andQ = await db.select().from(orgsT).where(and(eq(orgsT.id, 'a'), eq(orgsT.name, 'A')));
console.log('AND', andQ.map((r) => r.id).join(','));
// gte + desc + sql
const tsT = { name: 'audit_log' };
await db.insert(tsT).values({ id: 1, org_id: 'o1', ts: 10 }).returning();
await db.insert(tsT).values({ id: 2, org_id: 'o1', ts: 50 }).returning();
await db.insert(tsT).values({ id: 3, org_id: 'o2', ts: 30 }).returning();
const gteQ = await db.select().from(tsT).where(and(eq(sql`audit_log.org_id`, 'o1'), gte({ name: 'ts' }, 20)));
console.log('GTE+SQL', gteQ.map((r) => r.id).join(','));
const descQ = await db.select().from(tsT).where(eq(sql`audit_log.org_id`, 'o1')).orderBy(desc({ name: 'ts' }));
console.log('DESC', descQ.map((r) => r.id).join(','));
await db.update(orgsT).set({ name: 'A2' }).where(eq(orgsT.id, 'a'));
const afterUpd = await db.select().from(orgsT).where(eq(orgsT.id, 'a'));
console.log('UPD', afterUpd[0].name);
await db.delete(orgsT).where(eq(orgsT.id, 'b'));
console.log('AFTER DEL', (await db.select().from(orgsT)).map((r) => r.id).join(','));
console.log('OK');
