import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
let src = readFileSync('./_probe.mjs', 'utf8');
// extract only the helper section up to makeFakeDb by evaluating a trimmed copy is messy; just re-declare minimal
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
function parseComparison(node) {
  const chunks = node.queryChunks || [];
  let field = null, value = undefined, op = '=';
  for (const c of chunks) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if (typeof c.name === 'string') field = c.name;
      else if (c.queryChunks) { const f = fieldName(c); if (f) field = f; }
    } else if (c && c.value && Array.isArray(c.value)) {
      const s = c.value.join('');
      if (s.includes('>=')) op='>='; else if (s.includes('<=')) op='<='; else if (s.includes('<>')||s.includes('!=')) op='<>'; else if (s.includes(' like ')) op='like'; else if (s.includes('=')) op='=';
    } else if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') value = c;
  }
  return field ? { field, op, value } : null;
}
const node = and(eq(sql`audit_log.org_id`, 'o1'), gte({ name: 'ts' }, 20));
console.log('AND chunks:', JSON.stringify(node.queryChunks.map((c) => (c && c.queryChunks ? 'SUB:'+JSON.stringify(c.queryChunks.map(x=>x&&x.queryChunks?'SQL':x&&x.value?x.value:x)) : c && c.value ? c.value : c))));
// emulate evalNode walk
function evalNode(n, row) {
  if (!n || !n.queryChunks) return true;
  const chunks = n.queryChunks;
  let result = null, pendingConn = 'and', saw = false;
  for (const c of chunks) {
    if (c && c.value && Array.isArray(c.value)) { const s=c.value.join(''); if(/or/i.test(s)) pendingConn='or'; else if(/and/i.test(s)) pendingConn='and'; continue; }
    if (c && c.queryChunks) { const v = evalNode(c, row); if(!saw){result=v;saw=true;} else result = pendingConn==='or'? result||v : result&&v; continue; }
  }
  if (!saw) { const cmp = parseComparison(n); if(!cmp) return true; const cell=row[cmp.field]; switch(cmp.op){case '=':return cell===cmp.value;case '>=':return cell>=cmp.value;case '<=':return cell<=cmp.value;case '<>':return cell!==cmp.value;case 'like':return String(cell).includes(String(cmp.value).replace(/%/g,''));default:return true;} }
  return result;
}
const row1 = { id:1, org_id:'o1', ts:10 };
const row2 = { id:2, org_id:'o1', ts:50 };
console.log('row1', evalNode(node, row1));
console.log('row2', evalNode(node, row2));
// inner eq(sql) alone
const innerEq = node.queryChunks.find((c)=>c&&c.queryChunks).queryChunks.find((x)=>x&&x.queryChunks);
console.log('innerEq chunks', JSON.stringify(innerEq.queryChunks.map(x=>x&&x.queryChunks?'SQLCHUNK':'x')));
console.log('parse innerEq', parseComparison(innerEq));
