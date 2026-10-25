import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * End-to-end tests run against a fresh database (see .github/workflows/ci.yml).
 * Locally: create an empty database, run `pnpm db:migrate`, then `pnpm e2e`.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a system Chromium instead of the
 * Playwright-managed browser.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
