import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests by default (pure, no DB). Integration tests live in
    // tests/integration/ and are run explicitly via `npm run test:integration`.
    include: ["tests/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
