import { eq, and } from 'drizzle-orm';
const orgsT = { name: 'orgs', id: { name: 'id' }, nameCol: { name: 'name' } };
const top = and(eq(orgsT.id, 'a'), eq(orgsT.nameCol, 'A'));
const chunks = top.queryChunks;
console.log('top len', chunks.length);
for (const c of chunks) {
  if (c && c.queryChunks) {
    console.log('  COND', JSON.stringify(c.queryChunks.map((x) => (x && x.queryChunks ? 'NEST' : x && x.value ? x.value : x))));
  } else if (c && c.value) {
    console.log('  CONN', c.value);
  } else {
    console.log('  LIT', JSON.stringify(c));
  }
}
// Now test evalNode as in probe
function fieldName(op){if(op&&typeof op==='object'){if(typeof op.name==='string')return op.name;if(op.queryChunks){const t=op.queryChunks.map(x=>typeof x==='string'?x:x.value?x.value.join(''):'').join('');const m=t.match(/[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)/);if(m)return m[1];const m2=t.match(/[a-zA-Z_][a-zA-Z0-9_]*/);return m2?m2[0]:null;}}return null;}
function parseComparison(node){const ch=node.queryChunks||[];let field=null,value=undefined,op='=';for(const c of ch){if(c&&typeof c==='object'&&!Array.isArray(c)){if(typeof c.name==='string')field=c.name;else if(c.queryChunks){const f=fieldName(c);if(f)field=f;}}else if(c&&c.value&&Array.isArray(c.value)){const s=c.value.join('');if(s.includes('>='))op='>=';else if(s.includes('<='))op='<=';else if(s.includes('<>')||s.includes('!='))op='<>';else if(s.includes(' like '))op='like';else if(s.includes('='))op='=';}else if(typeof c==='string'||typeof c==='number'||typeof c==='boolean')value=c;}return field?{field,op,value}:null;}
function isConditionObj(c){return c&&c.queryChunks&&c.queryChunks.some(x=>x&&x.value&&Array.isArray(x.value)&&/[=<>]/.test(x.value.join('')));}
function evalNode(n,row){if(!n||!n.queryChunks)return true;const ch=n.queryChunks;const sub=ch.filter(isConditionObj);const conn=ch.filter(c=>c&&c.value&&/and|or/i.test(c.value.join('')));console.log('ENTER sub',sub.length,'conn',conn.length, JSON.stringify(ch.map(c=>c&&c.queryChunks?'C':'v')));if(sub.length>=2&&conn.length>=1){let r=null,pc='and',saw=false;for(const c of ch){if(c&&c.value&&Array.isArray(c.value)){const s=c.value.join('');if(/or/i.test(s))pc='or';else if(/and/i.test(s))pc='and';continue;}if(c&&c.queryChunks&&isConditionObj(c)){const v=evalNode(c,row);console.log('  operand v=',v);if(!saw){r=v;saw=true;}else r=pc==='or'?r||v:r&&v;}}console.log('AND result',r);return r;}if(sub.length===1&&conn.length===0)return evalNode(sub[0],row);const cmp=parseComparison(n);if(!cmp)return true;const cell=row[cmp.field];switch(cmp.op){case '=':return cell===cmp.value;case '>=':return cell>=cmp.value;case '<=':return cell<=cmp.value;case '<>':return cell!==cmp.value;case 'like':return String(cell).includes(String(cmp.value).replace(/%/g,''));default:return true;}}
co