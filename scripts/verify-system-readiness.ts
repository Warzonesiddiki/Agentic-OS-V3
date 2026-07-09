// Top-level production-readiness wrapper (Bastion-owned).
// Delegates to the server implementation: server/src/scripts/verify-system-readiness.ts.
// Run with:  pnpm --filter server verify:readiness
//   or:      npx tsx server/src/scripts/verify-system-readiness.ts
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../server/src/scripts/verify-system-readiness.ts');

const res = spawnSync('npx', ['tsx', target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(res.status ?? 1);