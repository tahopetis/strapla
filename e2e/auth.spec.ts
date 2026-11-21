import { expect, test } from '@playwright/test';
import { ADMIN, createMember, signInWithSessionCookie } from './support/auth';

/**
 * Authentication boundaries (@t2): the sign-in form, a wrong password, a
 * deactivated member at the form and with a minted session, sign-out from the
 * app shell, and /setup once the database already has an administrator.
 *
 * The file starts from a blank storage state so every test is a real signed-out
 * visitor. The sign-out test signs in through the form itself instead of reusing
 * the foundation's saved cookie: revoking that shared session would sign out the
 * rest of the t2/t3 suite.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** The project baseURL, for the contexts this file creates itself. */
function baseURL(): string {
  return test.info().project.use.baseURL ?? 'http://127.0.0.1:3000';
}

test('signs the administrator in through the form @t2', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.locator('header').getByText(ADMIN.name)).toBeVisible();
});

test('rejects a wrong password without signing in @t2', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill('not the right password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);
  // Still signed out: the protected shell sends the visitor back to sign-in.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('refuses a deactivated member at the form @t2', async ({ page }) => {
  const member = await createMember({
    name: 'Deactivated Member',
    email: 'deactivated-member@strapla.test',
    password: 'deactivated member password',
    isActive: false,
  });

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(member.email);
  await page.locator('input[name="password"]').fill(member.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);
});

test('ends a deactivated member’s minted session @t2', async ({ context, page }) => {
  const member = await createMember({
    name: 'Deactivated Session',
    email: 'deactivated-session@strapla.test',
    password: 'deactivated session password',
    isActive: false,
  });
  await signInWithSessionCookie(context, baseURL(), member.userId);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login\?reason=ended/);
  await expect(page.getByRole('status')).toContainText(
    'Your session ended. Sign in again to continue.',
  );
});

test('signs out from the app shell @t2', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('redirects /setup to sign-in after first-run setup @t2', async ({ page }) => {
  await page.goto('/setup');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Strapla', exact: true })).toBeVisible();
});
