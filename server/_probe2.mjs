import { eq, and } from 'drizzle-orm';
const orgsT = { name: 'orgs', id: { name: 'id' }, name2: { name: 'name' } };
const node = and(eq(orgsT.id, 'a'), eq(orgsT.name2, 'A'));
console.log(JSON.stringify(node.queryChunks.map((c) => (c && c.queryChunks ? 'SUB' : c && c.value ? c.value : c))));
// flatten sub check
const chunks = node.queryChunks;
const subs = chunks.filter((c) => c && typeof c === 'object' && c.queryChunks);
console.log('subs', subs.length);
console.log('conds', JSON.stringify(evalNodeProbe(node, { id: 'b', name: 'B' })));
function evalNodeProbe(n, row) {
  const ch = n.queryChunks;
  const text = ch.map((c) => (typeof c === 'string' ? c : c && c.value ? c.value.join('') : '')).join('');
  if (/\b and \b/.test(text) || /\bor\b/.test(text)) {
    const s = ch.filter((c) => c && typeof c === 'object' && c.queryChunks);
    const conns = ch.map((c) => (c && c.value ? c.value.join('') : '')).filter((s) => /and|or/.test(s));
    let r = evalNodeProbe(s[0], row);
    for (let i = 1; i < s.length; i++) {
      const conn = conns[i - 1] || '';
      const nx = evalNodeProbe(s[i], row);
      r = /or/.test(conn) ? r || nx : r && nx;
    }
    return r;
  }
  // comparison
  let field, value, op = '=';
  for (const c of ch) {
    if (c && typeof c === 'object' && c.name) field = c.name;
    else if (c && c.value) { const s = c.value.join(''); if (s.includes('>=')) op='>='; else if (s.includes('<=')) op='<='; else op='='; }
    else if (typeof c === 'string' || typeof c === 'number') value = c;
  }
  return row[field] === value;
}
