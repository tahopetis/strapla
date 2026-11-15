import { expect, test } from '@playwright/test';

/**
 * Resilience boundaries: an ended session is explained on the sign-in screen,
 * and an unknown URL lands on the styled 404 rather than the framework default.
 *
 * Both tests are independent of the planning data: the invalid-cookie case only
 * needs the sessions table to exist (CI migrates a fresh database), and the 404
 * case needs no database access at all.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

test('an ended session lands on sign-in with an explanation', async ({ context, page }) => {
  await context.addCookies([
    { name: 'strapla_session', value: 'e2e-invalid-session', url: BASE_URL },
  ]);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await expect(page.getByRole('status')).toContainText('Your session ended');
});

test('an unknown URL shows the styled 404 page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
});
