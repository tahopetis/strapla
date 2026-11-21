import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, createMember, signInWithSessionCookie } from './support/auth';

/**
 * Member lifecycle and the audit trail (@t2). The members screen is exercised
 * through its real forms: create, deactivate, activate, reset password and
 * revoke sessions, with a second signed-out browser context proving the new
 * password works and that a minted session stops working after revocation.
 * The audit test then filters for the deactivation it just made, opens the
 * before/after disclosure and checks the CSV export carries the same reason.
 *
 * Protections: the members screen never renders a deactivate control on your own
 * row ("this is you"). The server also refuses "You cannot deactivate your own
 * account." and "The last active account cannot be deactivated." (see
 * src/server/admin/actions.ts); neither refusal is reachable from the rendered
 * UI because your own row has no form and you always stay active when
 * deactivating someone else, so the UI-level protection is asserted here and the
 * last-active rule is asserted where the hub states it.
 */
const MEMBER = {
  name: 'Lifecycle Admin',
  email: 'lifecycle-admin@strapla.test',
  initialPassword: 'lifecycle password one',
  newPassword: 'lifecycle password two',
};

const AUDIT_TARGET = {
  name: 'Audit Target',
  email: 'audit-target@strapla.test',
  password: 'audit target password',
};

function baseURL(): string {
  return test.info().project.use.baseURL ?? 'http://127.0.0.1:3000';
}

/** Reloads the members screen and opens the row's Manage disclosure. */
async function openManager(page: Page, email: string): Promise<Locator> {
  await page.goto('/admin/members');
  const row = page.locator('tbody tr', { hasText: email });
  await row.locator('summary', { hasText: 'Manage' }).click();
  await expect(row.locator('details').first()).toHaveJSProperty('open', true);
  return row;
}

test('manages a member through create, deactivate, activate, password reset and session revoke @t2', async ({
  browser,
  page,
}) => {
  await page.goto('/admin/members');
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();

  const createForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create member' }) });
  await createForm.locator('input[name="name"]').fill(MEMBER.name);
  await createForm.locator('input[name="email"]').fill(MEMBER.email);
  await createForm.locator('input[name="password"]').fill(MEMBER.initialPassword);
  await page.getByRole('button', { name: 'Create member' }).click();
  await expect(page.getByRole('status')).toContainText(`Member ${MEMBER.name} created.`);

  let row = await openManager(page, MEMBER.email);
  await expect(row.getByText('active', { exact: true })).toBeVisible();
  // Every Manage form submits the same member id; read one to mint a session.
  const memberUserId = await row.locator('input[name="userId"]').first().inputValue();
  expect(memberUserId).toBeTruthy();

  await row.getByRole('button', { name: 'Deactivate member' }).click();
  const deactivateDialog = row.getByRole('dialog');
  await expect(deactivateDialog).toBeVisible();
  await deactivateDialog
    .locator('textarea[name="reason"]')
    .fill('Lifecycle test: deactivation.');
  await deactivateDialog.getByRole('button', { name: 'Deactivate member' }).click();
  await expect(page.getByRole('status')).toContainText(`Member ${MEMBER.name} deactivated.`);
  await expect(
    page.locator('tbody tr', { hasText: MEMBER.email }).getByText('deactivated', { exact: true }),
  ).toBeVisible();

  row = await openManager(page, MEMBER.email);
  const activateForm = row
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Activate member' }) });
  await activateForm.locator('textarea[name="reason"]').fill('Lifecycle test: reactivation.');
  await activateForm.getByRole('button', { name: 'Activate member' }).click();
  await expect(page.getByRole('status')).toContainText(`Member ${MEMBER.name} activated.`);
  await expect(
    page.locator('tbody tr', { hasText: MEMBER.email }).getByText('active', { exact: true }),
  ).toBeVisible();

  row = await openManager(page, MEMBER.email);
  const resetForm = row
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Reset password' }) });
  await resetForm.locator('input[name="password"]').fill(MEMBER.newPassword);
  await resetForm.locator('textarea[name="reason"]').fill('Lifecycle test: password reset.');
  await resetForm.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('status')).toContainText(`Password reset for ${MEMBER.email}.`);

  // The new password signs in from a signed-out context.
  const memberContext = await browser.newContext({
    baseURL: baseURL(),
    storageState: { cookies: [], origins: [] },
  });
  const memberPage = await memberContext.newPage();
  await memberPage.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(memberPage).toHaveURL(/\/login$/);
  await expect(memberPage.locator('input[name="email"]')).toBeVisible({ timeout: 15_000 });
  await memberPage.locator('input[name="email"]').fill(MEMBER.email);
  await memberPage.locator('input[name="password"]').fill(MEMBER.newPassword);
  await memberPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(memberPage).toHaveURL(/\/dashboard$/);
  await expect(memberPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

  // A minted session for the same member works until the sessions are revoked.
  await signInWithSessionCookie(memberContext, baseURL(), memberUserId);
  await memberPage.goto('/dashboard');
  await expect(memberPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

  row = await openManager(page, MEMBER.email);
  const revokeForm = row
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Revoke sessions' }) });
  await revokeForm.locator('textarea[name="reason"]').fill('Lifecycle test: session revoke.');
  await revokeForm.getByRole('button', { name: 'Revoke sessions' }).click();
  await expect(page.getByRole('status')).toContainText(`Sessions revoked for ${MEMBER.email}.`);

  await memberPage.goto('/dashboard');
  await expect(memberPage).toHaveURL(/\/login\?reason=ended/);
  await expect(memberPage.getByRole('status')).toContainText('Your session ended. Sign in again to continue.');
  await memberContext.close();
});

test('protects the signed-in administrator from deactivation @t2', async ({ page }) => {
  await page.goto('/admin/members');
  const ownRow = page.locator('tbody tr', { hasText: ADMIN.email });

  await expect(ownRow.getByText('this is you')).toBeVisible();
  await expect(ownRow.getByText('active', { exact: true })).toBeVisible();
  // The deactivate control is not rendered for your own account.
  await expect(ownRow.getByRole('button', { name: 'Deactivate member' })).toHaveCount(0);

  await page.goto('/admin');
  await expect(page.getByText('The last active account cannot be deactivated.')).toBeVisible();
});

test('filters the audit trail and exports the reason of a just-made change @t2', async ({ page }) => {
  const target = await createMember({
    name: AUDIT_TARGET.name,
    email: AUDIT_TARGET.email,
    password: AUDIT_TARGET.password,
  });
  const reason = 'Audit trail probe: deactivation reason.';

  await page.goto('/admin/members');
  const targetRow = page.locator('tbody tr', { hasText: target.email });
  await targetRow.locator('summary', { hasText: 'Manage' }).click();
  await targetRow.getByRole('button', { name: 'Deactivate member' }).click();
  const targetDialog = targetRow.getByRole('dialog');
  await targetDialog.locator('textarea[name="reason"]').fill(reason);
  await targetDialog.getByRole('button', { name: 'Deactivate member' }).click();
  await expect(page.getByRole('status')).toContainText(`Member ${target.name} deactivated.`);

  // q searches actor, entity, action and reason.
  await page.goto('/admin/audit');
  await page.locator('input[name="q"]').fill('Audit trail probe');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page).toHaveURL(/[?&]q=Audit/);
  await expect(page.locator('tbody tr', { hasText: reason })).toBeVisible();

  // entityType narrows to user entries; custom-field entries disappear.
  await page.goto('/admin/audit');
  await page.locator('select[name="entityType"]').selectOption('user');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page).toHaveURL(/entityType=user/);
  await expect(page.locator('tbody tr', { hasText: reason })).toBeVisible();
  await expect(page.locator('tbody').getByText('Custom field', { exact: true })).toHaveCount(0);

  // action narrows to the deactivation token.
  await page.goto('/admin/audit');
  await page.locator('select[name="action"]').selectOption('member_deactivate');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page).toHaveURL(/action=member_deactivate/);
  await expect(page.locator('tbody tr', { hasText: reason })).toBeVisible();
  await expect(page.locator('tbody').getByText('member_create', { exact: true })).toHaveCount(0);

  // actor narrows by the administrator who made the change.
  await page.goto('/admin/audit');
  await page
    .locator('select[name="actor"]')
    .selectOption({ label: 'Portfolio Owner (e2e-owner@strapla.test)' });
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page).toHaveURL(/actor=/);
  await expect(page.locator('tbody tr', { hasText: reason })).toBeVisible();

  // Before/after disclosure keeps the snapshot of the member that changed.
  await page.goto('/admin/audit?action=member_deactivate');
  const deactivationRow = page.locator('tbody tr', { hasText: reason });
  await deactivationRow.getByText('Show values').click();
  await expect(deactivationRow.getByText('Before', { exact: true })).toBeVisible();
  await expect(deactivationRow.getByText('After', { exact: true })).toBeVisible();
  await expect(deactivationRow.locator('pre', { hasText: '"isActive": true' })).toBeVisible();
  await expect(deactivationRow.locator('pre', { hasText: '"isActive": false' })).toBeVisible();

  // The CSV export applies the same filters and carries the just-made reason.
  const origin = new URL(page.url()).origin;
  const response = await page.request.get(`${origin}/admin/audit/export?action=member_deactivate`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  const csv = await response.text();
  expect(csv).toContain(reason);
  expect(csv).toContain(AUDIT_TARGET.email);
});
