import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // control-plane.test.ts lives in src/lib/os (UIA's domain) and needs a DOM
    // environment; it is outside this frontend store/query suite's scope.
    exclude: ['src/lib/os/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
    // Stores talk to a (mocked) fetch; keep tests fast and isolated.
    pool: 'forks',
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
