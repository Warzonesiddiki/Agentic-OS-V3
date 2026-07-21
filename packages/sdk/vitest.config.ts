import { defineConfig } from 'vitest/config';

/**
 * SDK vitest config.
 * Scoped to the SDK's own `src/**` so `pnpm --filter @agentic-os/sdk test`
 * does not inherit the frontend dashboard config (which pulls in a DOM
 * setup file). These are pure Node unit/contract tests — no browser shims.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
