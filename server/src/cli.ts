#!/usr/bin/env node
/**
 * nexus — command-line interface for NEXUS 2.0.
 *
 * A thin adapter over the same domain services as REST/MCP. Talk directly to
 * the Postgres-backed brain (no HTTP server required) for low-latency hook use.
 *
 *   nexus status                              brain + system summary
 *   nexus recall "<query>"                    token-budgeted recall
 *   nexus remember --type <t> --title "T" "body"
 *   nexus capture --file transcript.txt       distill a transcript
 *   nexus export > brain.json                 export the brain
 *   nexus import brain.json                   import (deduped)
 *   nexus audit                               verify the hash chain
 *   nexus doctor                              diagnostics
 *   nexus keygen                              generate a new API key (hash printed)
 *
 * Env: DATABASE_URL must point at a reachable Postgres.
 */
import { db, closeDb } from './db/client.js';
import { recall } from './services/recall.js';
import { createMemory, captureSession } from './services.js';
import { exportBrain, importBrain } from './services/brain.js';
import { verifyAuditChain } from './lib/audit.js';
import { dbReachable } from './setup.js';
import { hashApiKey, generateApiKey } from './lib/security.js';
import { llmConfigured, getEnv } from './lib/env.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { generateHermesConnector } from './connectors/hermes.js';
import { verifyIntegration } from './lib/verify.js';

// Commands that DON'T need the DB. Everything else triggers schema check.
// `connect` needs DB to create/retrieve a real API key (not a placeholder).
const DB_FREE = new Set(['help', 'keygen', 'mcp-config']);

type Args = { _: string[]; [key: string]: string | boolean | string[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fail(msg: string, code = 1): never {
  console.error(`nexus: ${msg}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help') {
    console.log(`NEXUS 2.0 CLI

  status                          brain + system summary
  recall "<query>" [--budget N]   token-budgeted recall
  remember --type <t> --title "T" "body"
  capture --file <path> [--project <name>]
  export                          export brain to stdout (JSON)
  import <file>                   import brain JSON (deduped)
  audit                           verify the hash chain
  doctor                          diagnostics
  keygen                          generate a new API key + hash
  mcp-config                      print an MCP client config snippet
  connect <agent> [--apply]       generate integration files for an agent
                                  agents: hermes, claude-code, cursor, cline, generic
  sync-workspace [--dir <path>]   sync memory conventions to IDE files
                                  (.cursorrules, CLAUDE.md, AGENTS.md)

  Hermes integration (one-time setup):
    nexus connect hermes --apply  →  writes .mcp.json + nexus-os-context.md
    nexus connect hermes --verify →  runs the integration test checklist`);
    process.exit(0);
  }

  // Only connect to DB for commands that need it.
  if (!DB_FREE.has(cmd)) {
    const { ensureSchema: setup } = await import('./setup.js');
    await setup();
  }

  switch (cmd) {
    case 'status': {
      const [mem, skl, prj, aud] = await Promise.all([
        db.query.memories.findMany(),
        db.query.skills.findMany(),
        db.query.projects.findMany(),
        verifyAuditChain(),
      ]);
      console.log(
        JSON.stringify(
          {
            nodeEnv: getEnv().NODE_ENV,
            llmMode: llmConfigured() ? 'configured' : 'lexical',
            counts: {
              memories: mem.length,
              skills: skl.length,
              projects: prj.length,
              audit: aud.total,
            },
            audit: { valid: aud.valid, verified: aud.verifiedEntries },
          },
          null,
          2
        )
      );
      break;
    }
    case 'recall': {
      const q = args._.slice(1).join(' ');
      if (!q) fail('missing query');
      const r = await recall(q, Number(args.budget ?? 1500), 'cli');
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case 'remember': {
      const title = String(args.title ?? '');
      const kind = String(args.type ?? 'semantic');
      const body = args._.slice(1).join(' ');
      if (!title || !body) fail('usage: remember --type <t> --title "T" "body"');
      const created = await createMemory(
        { kind, title, content: body, tags: [], importance: 0.6, source: 'cli', projectId: null },
        'cli'
      );
      const id =
        typeof created === 'object' &&
        created !== null &&
        'id' in created &&
        typeof (created as { id: unknown }).id === 'string'
          ? (created as { id: string }).id
          : 'unknown';
      console.log(JSON.stringify({ stored: true, id }));
      break;
    }
    case 'capture': {
      const file = args.file ? String(args.file) : null;
      if (!file) fail('usage: capture --file <path>');
      const transcript = readFileSync(resolve(file), 'utf8');
      const report = await captureSession(
        transcript,
        args.project ? String(args.project) : undefined,
        'cli'
      );
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case 'export': {
      const data = await exportBrain();
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'import': {
      const file = args._[1];
      if (!file) fail('usage: import <file>');
      const raw = JSON.parse(readFileSync(resolve(file), 'utf8'));
      const report = await importBrain(raw, 'cli');
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case 'audit': {
      const r = await verifyAuditChain();
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.valid ? 0 : 1);
      break;
    }
    case 'doctor': {
      const reachable = await dbReachable();
      const aud = await verifyAuditChain();
      const checks = [
        {
          name: 'database',
          level: reachable ? '🟢 ok' : '🔴 broken',
          detail: reachable ? 'reachable' : 'unreachable',
        },
        {
          name: 'audit chain',
          level: aud.valid ? '🟢 ok' : '🔴 broken',
          detail: `${aud.verifiedEntries} verified`,
        },
        {
          name: 'llm',
          level: llmConfigured() ? '🟢 ok' : '🟡 warn',
          detail: llmConfigured() ? 'configured' : 'lexical fallback',
        },
      ];
      for (const c of checks) console.log(`${c.level}  ${c.name} — ${c.detail}`);
      const broken = checks.filter((c) => c.level.includes('broken')).length;
      process.exit(broken ? 1 : 0);
      break;
    }
    case 'keygen': {
      const raw = generateApiKey();
      console.log(
        JSON.stringify(
          {
            key: raw,
            keyHash: hashApiKey(raw),
            note: 'Store the key; persist the keyHash in api_keys.',
          },
          null,
          2
        )
      );
      break;
    }
    case 'mcp-config': {
      const origin = getEnv().NEXUS_MCP_ORIGIN ?? 'http://localhost:9900';
      const { createPrincipal: createKey } = await import('./lib/security.js');
      const envKey = getEnv().NEXUS_API_KEY;
      const key =
        envKey || (await createKey(db, 'mcp-client', ['memory:read', 'memory:write'])).rawKey;
      if (!envKey) console.log(`Created new key for mcp-config: ${key}\n`);
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              nexus: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${key}` } },
            },
          },
          null,
          2
        )
      );
      break;
    }
    case 'connect': {
      const agent = args._[1] ?? '';
      const apply = Boolean(args.apply);
      const verify = Boolean(args.verify);
      const origin = getEnv().NEXUS_MCP_ORIGIN ?? 'http://localhost:9900';

      if (!agent) {
        console.log(`Available agents: hermes, claude-code, cursor, cline, generic
Usage: nexus connect <agent> [--apply] [--verify]`);
        process.exit(0);
      }

      // Resolve a REAL API key — never a placeholder.
      // 1. If NEXUS_API_KEY is set in .env, use it (it's already in the DB).
      // 2. Otherwise, create a new scoped principal in the DB and use THAT key.
      const { createPrincipal } = await import('./lib/security.js');
      const envKey = getEnv().NEXUS_API_KEY;
      let apiKey: string;
      if (envKey) {
        apiKey = envKey;
        console.log(`Using API key from .env (NEXUS_API_KEY)`);
      } else {
        const created = await createPrincipal(db, 'hermes', [
          'memory:read',
          'memory:write',
          'skill:read',
          'skill:write',
          'audit:read',
        ]);
        apiKey = created.rawKey;
        console.log(`✓ Created new API key for Hermes (id: ${created.id})`);
        console.log(`  Key: ${apiKey}`);
        console.log(`  Stored as hash in api_keys table — shown once here only.`);
      }

      if (agent === 'hermes') {
        if (verify) {
          // REAL verification — makes actual HTTP requests to the running server.
          console.log(`\nVerifying integration against ${origin}...\n`);
          const result = await verifyIntegration(origin, apiKey);
          for (const step of result.steps) {
            const icon = step.passed ? '✓' : '✕';
            console.log(`  ${icon} ${step.name}: ${step.description}`);
            console.log(`    ${step.detail} (${step.durationMs}ms)\n`);
          }
          console.log(
            result.allPassed
              ? `✅ All ${result.steps.length} checks passed (${result.durationMs}ms) — Hermes integration verified.`
              : `✕ ${result.steps.filter((s) => !s.passed).length}/${result.steps.length} checks FAILED.`
          );
          process.exit(result.allPassed ? 0 : 1);
          break;
        }

        const result = generateHermesConnector({ origin, apiKey });

        if (apply) {
          // Write REAL files with the REAL key.
          for (const f of result.files) {
            const outPath = resolve(process.cwd(), f.path);
            try {
              mkdirSync(dirname(outPath), { recursive: true });
              // Backup existing file before overwrite.
              try {
                const existing = readFileSync(outPath, 'utf8');
                if (existing.trim()) {
                  writeFileSync(`${outPath}.bak`, existing, 'utf8');
                  console.log(`  Backed up existing ${f.path} → ${f.path}.bak`);
                }
              } catch (readErr) {
                if (
                  readErr instanceof Error &&
                  'code' in readErr &&
                  (readErr as NodeJS.ErrnoException).code !== 'ENOENT'
                ) {
                  console.error(
                    `✕ cannot read existing ${f.path}: ${readErr instanceof Error ? readErr.message : String(readErr)}`
                  );
                  process.exit(1);
                }
              }
              writeFileSync(outPath, f.content, 'utf8');
              console.log(`✓ wrote ${f.path} (${f.content.length} bytes) — ${f.description}`);
            } catch (err) {
              console.error(
                `✕ failed to write ${f.path}: ${err instanceof Error ? err.message : String(err)}`
              );
              process.exit(1);
            }
          }
          console.log('\n' + result.instructions.join('\n'));
          console.log('\n✅ Hermes integration complete.');
          console.log('   The key in .mcp.json is real and stored hashed in the DB.');
          console.log('   Run `nexus connect hermes --verify` to test the connection.');
        } else {
          // Dry-run — show the REAL files with the REAL key to stdout.
          console.log(`\n=== Hermes Integration (dry-run — use --apply to write) ===\n`);
          for (const f of result.files) {
            console.log(`--- ${f.path} --- (${f.description})\n`);
            console.log(f.content);
            console.log('');
          }
          console.log(result.instructions.join('\n'));
        }
        break;
      }

      // Generic agents — .mcp.json with the REAL key.
      const genericConfig = JSON.stringify(
        {
          mcpServers: {
            nexus: { url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${apiKey}` } },
          },
        },
        null,
        2
      );
      if (apply) {
        writeFileSync(resolve(process.cwd(), '.mcp.json'), genericConfig, 'utf8');
        console.log(`✓ wrote .mcp.json (with real API key)`);
      } else {
        console.log(genericConfig);
      }
      break;
    }
    case 'sync-workspace': {
      const workspaceDir = String(args.dir ?? process.cwd());
      const { syncWorkspace } = await import('./services/workspace-sync.js');
      const result = await syncWorkspace(workspaceDir, 'cli');
      console.log(`✓ Synced ${result.conventionsInjected} conventions to:`);
      for (const f of result.filesWritten) console.log(`  - ${f}`);
      if (result.backupsCreated.length) {
        console.log(`\nBacked up existing files:`);
        for (const b of result.backupsCreated) console.log(`  - ${b}`);
      }
      break;
    }
    default:
      fail(`unknown command: ${cmd} (try 'help')`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('nexus:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
