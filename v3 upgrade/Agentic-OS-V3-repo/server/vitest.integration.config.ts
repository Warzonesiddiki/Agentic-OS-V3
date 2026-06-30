import { defineConfig } from "vitest/config";

// Integration config: runs ONLY the DB-gated suite, and REQUIRES a reachable
// Postgres. It must never report green by silently running zero assertions —
// if DATABASE_URL is missing or unreachable, the suite fails loudly.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
