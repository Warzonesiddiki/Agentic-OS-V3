/**
 * Local vitest config used ONLY by SecD's security-audit test in this sandbox shell.
 *
 * The default server/vitest.config.ts attaches `src/setup.ts` as a global setup file,
 * which eagerly imports `db/client.js` -> the `better-sqlite3` native binding. That
 * binding cannot load in this agent shell (Node-ABI mismatch — a KNOWN ENV constraint;
 * execution is deferred to the aionr runner via `pnpm run validate`).
 *
 * This config runs the audit suite WITHOUT the global DB setup, because the audited
 * units (requireScope / requireScopeThroughKillSwitch / hasScope / MCP resource sandbox)
 * are DB-free and mock `db/client.js` at the module level. It is NOT a replacement for
 * the project's real vitest config — it exists purely to let the audit run locally here.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/security-audit-scope-killswitch-mcp.test.ts'],
    setupFiles: [],
    globals: true,
    pool: 'threads',
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/auth-context.ts', 'src/lib/security.ts', 'src/services/mcp-registry.ts'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});
