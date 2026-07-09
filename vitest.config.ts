import { defineConfig } from 'vitest/config';

/**
 * Frontend (dashboard) vitest config.
 *
 * Scoped to `src/**` only so `npx vitest run` at the repo root exercises the
 * browser-dashboard store/query suite WITHOUT dragging in the server or
 * packages workspaces (which have their own vitest configs and need Postgres).
 *
 * Node environment + an inline localStorage/document/window shim
 * (src/test/setup.ts) because the stores persist to localStorage and we cannot
 * install jsdom/happy-dom in this runtime.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    // Stores talk to a (mocked) fetch; keep tests fast and isolated.
    pool: 'forks',
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
