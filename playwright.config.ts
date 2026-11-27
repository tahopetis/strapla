import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * End-to-end tests run against a fresh database (see .github/workflows/ci.yml
 * and .github/workflows/regression.yml). Locally: create an empty database, run
 * `pnpm db:migrate`, then `pnpm e2e`.
 *
 * The suite is serial on purpose: the database allows one active strategic plan
 * and one annual plan per fiscal year, and the journey establishes that shared
 * foundation. Later specs append their own uniquely named records to it.
 *
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a system Chromium instead of the
 * Playwright-managed browser.
 */
const authFile = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  globalSetup: './e2e/support/global-setup.ts',
  projects: [
    {
      // The full plan journey. It creates the administrator, the portfolio and
      // the FY2027 plan, then saves the signed-in state the later tiers reuse.
      name: 'foundation',
      testMatch: /plan-happy-path\.spec\.ts/,
    },
    {
      // Every mutation and rule the foundation only touches on the happy path.
      name: 't2',
      testMatch:
        /(auth|voids|edits|execution|closed-year|corrections|close|opening-balances|revisions|admin|reports|flags)\.spec\.ts/,
      dependencies: ['foundation'],
      use: { storageState: authFile },
    },
    {
      // Read-only sweep, unauthenticated boundaries and the resilience cases.
      name: 't3',
      testMatch: /(sweep|resilience)\.spec\.ts/,
      dependencies: ['foundation'],
      use: { storageState: authFile },
    },
    {
      // The succession journey (#109): final close, archive, create the
      // successor, activate it and operate its first annual plan, then reopen
      // the archived plan read-only. It is declared last and depends on every
      // earlier tier because it replaces the shared foundation plan — a suite
      // that ran after it would have no active plan left to work on.
      name: 'succession',
      testMatch: /succession\.spec\.ts/,
      dependencies: ['t2', 't3'],
      use: { storageState: authFile },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
