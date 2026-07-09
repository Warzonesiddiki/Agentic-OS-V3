import { eq, and, gte, desc, sql } from 'drizzle-orm';
function fieldName(op) {
  if (op && typeof op === 'object') {
    if (typeof op.name === 'string') return op.name;
    if (op.queryChunks) {
      const text = op.queryChunks.map((c) => (typeof c === 'string' ? c : c.value ? c.value.join('') : '')).join('');
      const m = text.match(/[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/);
      if (m) return m[1].split('.')[1];
      const m2 = text.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
      return m2 ? m2[0] : null;
    }
  }
  return null;
}
const node = eq(sql`audit_log.org_id`, 'o1');
console.log('chunks', JSON.stringify(node.queryChunks.map((c) => (c && c.queryChunks ? 'SQLCHUNK:' + JSON.stringify(c.queryChunks) : c && c.value ? c.value : c))));
console.log('fieldName', fieldName(node.queryChunks.find((c) => c && c.queryChunks)));
let field, value, op = '=';
for (const c of node.queryChunks) {
  if (c && typeof c === 'object' && c.name) field = c.name;
  else if (c && c.value) { const s = c.value.join(''); if (s.includes('>=')) op='>='; else if (s.includes('<=')) op='<='; else op='='; }
  else if (typeof c === 'string' || typeof c === 'number') value = c;
}
console.log('cmp', field, op, value);
