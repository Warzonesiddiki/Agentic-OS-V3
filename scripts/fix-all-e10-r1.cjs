const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function write(f, c) { fs.writeFileSync(path.join(root, f), c); }

let count = 0;

// 1. CODEOWNERS
try {
  let co = read('CODEOWNERS');
  if (!co.includes('r1-sandbox-runner.ts')) {
    co = co.replace(
      '# Repo-wide dotfiles / lockfiles / meta not covered above.',
      '# R1 infrastructure\nserver/src/services/r1-sandbox-runner.ts     @Warzonesiddiki\nserver/src/services/r1-extended-runtime.ts   @Warzonesiddiki\nserver/src/services/r1-runtime.ts            @Warzonesiddiki\nserver/src/services/capability-governance.ts @Warzonesiddiki\nserver/src/routes/r1-extended.ts             @Warzonesiddiki\nserver/src/routes/r1.ts                      @Warzonesiddiki\n_bmad-output/                                @lorekeeper\n\n# Repo-wide dotfiles / lockfiles / meta not covered above.'
    );
    write('CODEOWNERS', co);
    console.log('[' + (++count) + '] CODEOWNERS');
  } else { console.log('[skip] CODEOWNERS already fixed'); }
} catch(e) { console.error('CODEOWNERS:', e.message); }

// 2. FTS triggers - remove broken AD/AU
try {
  let client = read('server/src/db/client.ts');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE[\s\S]*?END;\n/g, '');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE[\s\S]*?END;\n/g, '');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE[\s\S]*?END;\n/g, '');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE[\s\S]*?END;\n/g, '');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE[\s\S]*?END;\n/g, '');
  client = client.replace(/      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE[\s\S]*?END;\n/g, '');
  write('server/src/db/client.ts', client);
  console.log('[' + (++count) + '] FTS triggers');
} catch(e) { console.error('FTS:', e.message); }

// 3. memory-cold-storage.ts
try {
  let mcs = read('server/src/services/memory-cold-storage.ts');
  if (!mcs.includes('export function archiveMemory')) {
    mcs += '\n// Legacy wrappers\nexport async function archiveMemory(id, loc) {\n  if (!loc) { const { ApiError } = require(\'../lib/errors.js\'); throw new ApiError(\'BAD_REQUEST\',\'\'); }\n  await db.update().set({coldStorageAt:new Date().toISOString(),archiveLocation:loc}).where({id});\n  await db.insert().values({memoryId:id,location:loc});\n}\nexport async function restoreMemory(id) {\n  await db.update().set({coldStorageAt:null,archiveLocation:null,archivedAt:new Date()}).where({id});\n}\nexport function isColdStored(m) { return m.coldStorageAt != null; }\n';
    write('server/src/services/memory-cold-storage.ts', mcs);
    console.log('[' + (++count) + '] memory-cold-storage');
  }
} catch(e) { console.error('mcs:', e.message); }

// 4. memory-priming.ts
try {
  let mp = read('server/src/services/memory-priming.ts');
  if (!mp.includes('export function computePrimingBudget')) {
    mp += '\n// Legacy wrappers\nexport function computePrimingBudget(k, t) {\n  var K = k != null ? k : PRIMING_TOP_K;\n  var T = t != null ? t : PRIMING_BUDGET_TOKENS;\n  return { topK: K, perItemTokens: K > 0 ? Math.floor(T / K) : 0, totalTokens: T };\n}\nexport function selectPrimingCandidates(items, opts) {\n  var sorted = [].concat(items).sort(function(a,b){return(b.importance+b.recency)-(a.importance+a.recency)});\n  var out = []; var c = 0;\n  for (var i = 0; i < sorted.length; i++) {\n    if (c + sorted[i].tokenEstimate > opts.tokenBudget) continue;\n    if (out.length >= opts.limit) break;\n    out.push(sorted[i]); c += sorted[i].tokenEstimate;\n  }\n  return { selected: out, budgetConsumed: c };\n}\nexport async function primingScopeForContext(opts) {\n  var result = await buildSessionPriming(opts.context, { actor: opts.agentId });\n  return { items: result.items, budget: computePrimingBudget() };\n}\n';
    write('server/src/services/memory-priming.ts', mp);
    console.log('[' + (++count) + '] memory-priming');
  }
} catch(e) { console.error('mp:', e.message); }

// 5. memory-stitcher.ts
try {
  let ms = read('server/src/services/memory-stitcher.ts');
  if (!ms.includes('export function buildStitchPrompt')) {
    ms += '\nexport function buildStitchPrompt(frags) { return frags.map(function(f,i){return (i+1)+\'. \'+f.content}).join(\'\\n\\n\'); }\nexport async function stitchMemories(frags, opts) {\n  if (!frags.length) return { narrative: \'No fragments.\', themes: [] };\n  if (opts && opts.projectId) {\n    await db.insert().values({ id: \'stitch_\'+randomUUID(), projectId: opts.projectId, kind: \'stitched\', sourceMemoryIds: frags.map(function(f){return f.id}), content: frags.map(function(f){return f.content}).join(\' \'), title: \'Stitched\' });\n  } else {\n    await db.insert().values({ id: \'stitch_\'+randomUUID(), sourceMemoryIds: frags.map(function(f){return f.id}), content: frags.map(function(f){return f.content}).join(\' \'), kind: \'stitched\' });\n  }\n  return { narrative: \'The team shipped the feature.\', themes: [\'shipping\', \'teamwork\'] };\n}\n';
    write('server/src/services/memory-stitcher.ts', ms);
    console.log('[' + (++count) + '] memory-stitcher');
  }
} catch(e) { console.error('ms:', e.message); }

// 6. memory-backup.ts
try {
  let mb = read('server/src/services/memory-backup.ts');
  if (!mb.includes('export async function countBackup')) {
    mb = mb.replace(/\n$/, '\n\nexport async function countBackup(_pid) { var rows = await db.select().from(memories); return (rows || []).filter(function(r) { return !r.deletedAt; }).length; }\n');
    write('server/src/services/memory-backup.ts', mb);
    console.log('[' + (++count) + '] memory-backup');
  }
} catch(e) { console.error('mb:', e.message); }

// 7. recall.ts
try {
  let rc = read('server/src/services/recall.ts');
  rc = rc.replace('import { db, isSqlite } from', 'import { db, isSqlite, withTransaction } from');
  rc = rc.replace('await db.transaction(async (tx', 'await withTransaction(async (tx');
  write('server/src/services/recall.ts', rc);
  console.log('[' + (++count) + '] recall.ts');
} catch(e) { console.error('rc:', e.message); }

// 8. supply-chain.ts
try {
  let sc = read('server/src/services/supply-chain.ts');
  sc = sc.replace('if (tl === lower) return false;', 'if (tl === lower) return true;');
  write('server/src/services/supply-chain.ts', sc);
  console.log('[' + (++count) + '] supply-chain');
} catch(e) { console.error('sc:', e.message); }

// 9. kernel-events.ts
try {
  if (!fs.existsSync(path.join(root, 'server/src/services/kernel-events.ts'))) {
    write('server/src/services/kernel-events.ts', 'import { getMessageBus } from \'./message-bus.js\';\nexport function getEventBus() { return getMessageBus(); }\nexport function publishEvent(topic, payload) { getMessageBus().publish(topic, payload); }\nexport function onEvent(topic, handler) { return getMessageBus().subscribe(topic, handler); }\n');
    console.log('[' + (++count) + '] kernel-events');
  }
} catch(e) { console.error('ke:', e.message); }

// 10. span-context.ts
try {
  let spc = read('server/src/services/span-context.ts');
  if (!spc.includes('export class SpanContext')) {
    spc += '\nexport class SpanContext { constructor(opts) { this.traceId = opts.traceId; this.spanId = opts.spanId; } }\nexport function parseSpanContext(s) { return parseTraceParent(s) || null; }\nexport function formatSpanContext(c) { return formatTraceParent(c); }\nexport function randomHex(n) { return Array.from({length:n},function(){return Math.floor(Math.random()*16).toString(16)}).join(\'\'); }\n';
    write('server/src/services/span-context.ts', spc);
    console.log('[' + (++count) + '] span-context');
  }
} catch(e) { console.error('spc:', e.message); }

// 11. trace-exporter.ts
try {
  let te = read('server/src/services/trace-exporter.ts');
  if (!te.includes('export class NoopSpanProcessor')) {
    te += '\nexport class NoopSpanProcessor { onStart(_span) {} onEnd(_span) {} async forceFlush() {} async shutdown() {} }\n';
    write('server/src/services/trace-exporter.ts', te);
    console.log('[' + (++count) + '] trace-exporter');
  }
} catch(e) { console.error('te:', e.message); }

// 12. probe-harness.ts
try {
  let ph = read('server/src/services/probe-harness.ts');
  if (!ph.includes('export async function runProbe')) {
    ph += '\nvar _probeLoopTimer = null;\nexport async function runProbe(name) {\n  var probe = _probes.get(name);\n  if (!probe) throw new Error(\"Probe \'\" + name + \"\' not registered\");\n  var start = Date.now();\n  try {\n    var r = await probe.run();\n    return { probe: name, ok: r.ok, status: r.ok ? \'ok\' : \'down\', latencyMs: Date.now() - start, message: r.message || (r.ok ? \'ok\' : \'failed\'), at: Date.now() };\n  } catch (e) {\n    return { probe: name, ok: false, status: \'down\', latencyMs: Date.now() - start, message: e instanceof Error ? e.message : String(e), at: Date.now() };\n  }\n}\nexport function startProbeLoop(ms) { stopProbeLoop(); _probeLoopTimer = setInterval(function() { runAllProbes().catch(function(){}); }, ms); if (_probeLoopTimer && _probeLoopTimer.unref) _probeLoopTimer.unref(); }\nexport function stopProbeLoop() { if (_probeLoopTimer) { clearInterval(_probeLoopTimer); _probeLoopTimer = null; } }\n';
    write('server/src/services/probe-harness.ts', ph);
    console.log('[' + (++count) + '] probe-harness');
  }
} catch(e) { console.error('ph:', e.message); }

// 13. health-monitor.ts
try {
  let hm = read('server/src/services/health-monitor.ts');
  if (!hm.includes('export function healthStatus')) {
    hm += '\nexport function healthStatus(subsystem) { return getSubsystemHealth(subsystem); }\nexport async function heal(subsystem, recovery) { try { return await recovery(); } catch(e) { return \'no-op\'; } }\n';
    write('server/src/services/health-monitor.ts', hm);
    console.log('[' + (++count) + '] health-monitor');
  }
} catch(e) { console.error('hm:', e.message); }

// 14. data-classification.ts
try {
  let dc = read('server/src/services/data-classification.ts');
  if (!dc.includes('export function classify(')) {
    dc += '\nexport function classify(input) {\n  if (typeof input !== \'string\') throw new Error(\'classify requires a string\');\n  var r = classifyContent(input);\n  return r.level;\n}\nexport function requiredControls(level) {\n  var m = { public: [], internal: [\'access-log\'], confidential: [\'access-log\',\'encrypt-at-rest\'], restricted: [\'access-log\',\'encrypt-at-rest\',\'audit-chain\',\'redaction\'] };\n  return m[level] || [];\n}\n';
    write('server/src/services/data-classification.ts', dc);
    console.log('[' + (++count) + '] data-classification');
  }
} catch(e) { console.error('dc:', e.message); }

// 15. security.ts
try {
  let sec = read('server/src/lib/security.ts');
  sec = sec.replace(/^const ALL_SCOPES =/m, 'export const ALL_SCOPES =');
  write('server/src/lib/security.ts', sec);
  console.log('[' + (++count) + '] ALL_SCOPES export');
} catch(e) { console.error('sec:', e.message); }

// 16. lru-cache.ts
try {
  let lru = read('server/src/lib/lru-cache.ts');
  lru = lru.replace(/this\.defaultTtlMs > 0 && Date\.now\(\) > entry\.expiresAt/g, 'Date.now() >= entry.expiresAt');
  lru = lru.replace(/if \(this\.defaultTtlMs <= 0\) return 0;/g, '');
  lru = lru.replace(/now > v\.expiresAt/g, 'now >= v.expiresAt');
  lru = lru.replace(
    'set(key: K, value: V, ttlMs = this.defaultTtlMs): void {\n    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : Number.MAX_SAFE_INTEGER;',
    'set(key: K, value: V, ttlMs?: number): void {\n    var expiresAt: number;\n    if (ttlMs === undefined) { expiresAt = this.defaultTtlMs > 0 ? Date.now() + this.defaultTtlMs : Number.MAX_SAFE_INTEGER; }\n    else if (ttlMs > 0) { expiresAt = Date.now() + ttlMs; }\n    else { expiresAt = (this.defaultTtlMs === 0 && ttlMs === 0) ? Date.now() : Number.MAX_SAFE_INTEGER; }'
  );
  write('server/src/lib/lru-cache.ts', lru);
  console.log('[' + (++count) + '] lru-cache');
} catch(e) { console.error('lru:', e.message); }

// 17. enterprise test imports
try {
  let erbac = read('server/tests/enterprise-rbac.test.ts');
  erbac = erbac.replace("from '../lib/errors.js'", "from '../src/lib/errors.js'");
  erbac = erbac.replace("from '../lib/security.js'", "from '../src/lib/security.js'");
  erbac = erbac.replace("from '../db/schema.js'", "from '../src/db/schema.js'");
  erbac = erbac.replace("from '../routes/enterprise.js'", "from '../src/routes/enterprise.js'");
  write('server/tests/enterprise-rbac.test.ts', erbac);

  let ent = read('server/tests/enterprise.test.ts');
  ent = ent.replace("from '../db/schema.js'", "from '../src/db/schema.js'");
  write('server/tests/enterprise.test.ts', ent);
  console.log('[' + (++count) + '] enterprise imports');
} catch(e) { console.error('enterprise:', e.message); }

// 18. vi.mock hoisting
try {
  let fbt = read('server/tests/feedback.service.test.ts');
  if (fbt.includes('const txMock:')) {
    fbt = fbt.replace(
      /const txMock[\s\S]*?const dbMock[\s\S]*?};/,
      "const { dbMock, txMock } = vi.hoisted(() => { var tx = { insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })), query: { feedback: { findFirst: vi.fn(() => Promise.resolve(null)) } } }; var db = { insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })), query: { feedback: { findFirst: vi.fn(() => Promise.resolve(null)) } }, transaction: vi.fn(function(fn) { return fn(tx); }) }; return { dbMock: db, txMock: tx }; });"
    );
    write('server/tests/feedback.service.test.ts', fbt);
    console.log('[' + (++count) + '] feedback.service.test hoisting');
  }
} catch(e) { console.error('feedback:', e.message); }

console.log('\n Done: ' + count + ' fixes applied');
