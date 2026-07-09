const { createRequire } = require('module');
const require_ = createRequire(__filename);
const Database = require_('better-sqlite3');
const d = new Database('./agentic-os.db');
const r = d.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='memories'").get();
console.log('memories table exists:', r.c > 0);
const all = d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('all tables:', all.map(t => t.name).join(', '));
d.close();
