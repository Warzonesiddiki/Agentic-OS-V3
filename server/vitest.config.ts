import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/integration'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
      thresholds: { branches: 60, functions: 60, lines: 60, statements: 60 },
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
