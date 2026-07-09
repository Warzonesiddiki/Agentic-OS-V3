// Top-level system-performance profiler wrapper (Bastion-owned).
// Delegates to the server implementation: server/src/scripts/profile-system-performance.ts.
// Run with:  pnpm --filter server profile:perf
//   or:      npx tsx server/src/scripts/profile-system-performance.ts
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../server/src/scripts/profile-system-performance.ts');

const res = spawnSync('npx', ['tsx', target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(res.status ?? 1);