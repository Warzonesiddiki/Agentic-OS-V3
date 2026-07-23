import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for NEXUS 2.0.
 *
 * Prerequisites:
 *   1. Build the frontend: `pnpm build`
 *   2. Start the server: `pnpm dev` (or `node server/dist/index.js`)
 *   3. Run tests: `npx playwright test`
 *
 * The tests expect the dev server at http://localhost:1422.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:1422',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:1422',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
