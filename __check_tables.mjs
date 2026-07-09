import Database from 'better-sqlite3';
const d = new Database('./agentic-os.db');
const rows = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(rows.map(r => r.name).sort().join('\n'));
d.close();
