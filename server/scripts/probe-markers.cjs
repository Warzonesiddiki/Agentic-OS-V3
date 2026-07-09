const fs = require('fs');
const path = require('path');
const root = 'src';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
})(root);

const defect = /\b(TODO|FIXME|XXX|HACK)\b/;
const stubExcl = /(not a stub|no stub|stubbed|stubs will|stub &|stub\b.*removed|stub\)|stub,|stub\.)/i;
const stubMark = /\b(stub)\b/i;
let hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (defect.test(ln)) hits.push(f + ':' + (i + 1) + ' DEFECT ' + ln.trim());
    if (stubMark.test(ln) && !stubExcl.test(ln)) hits.push(f + ':' + (i + 1) + ' STUB ' + ln.trim());
  });
}
console.log('FILES', files.length);
console.log('HITS', hits.length);
hits.slice(0, 60).forEach((h) => console.log(h));
