import { expect, test } from '@playwright/test';

/**
 * M1 happy path (charter §7 W-0..W-3 and the plan module): first-run setup,
 * strategic plan and SIs, annual plan and program, project with ijin prinsip,
 * recurring ops, and the opening-balances reconciliation view.
 *
 * Runs against a fresh database: CI supplies one, locally create an empty
 * database and run `pnpm db:migrate` first. Labels wrap their inputs together
 * with hints, so form fields are addressed by name within their form.
 */

const ADMIN = {
  name: 'Portfolio Owner',
  email: 'e2e-owner@strapla.test',
  password: 'correct horse battery staple',
};

test('builds and reconciles the FY2027 plan end to end', async ({ page }) => {
  test.setTimeout(300_000);
  // ---------------------------------------------------------------- setup
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Strapla — first-run setup' })).toBeVisible();
  await page.locator('input[name="name"]').fill(ADMIN.name);
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.locator('input[name="confirm"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create administrator' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // ------------------------------------------------- strategic plan and SIs
  await page.goto('/plan/strategic');
  const planForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create plan' }) });
  await planForm.locator('input[name="name"]').fill('IT Strategic Plan 2026–2030');
  await planForm.locator('input[name="startFiscalYear"]').fill('2026');
  await planForm.locator('input[name="endFiscalYear"]').fill('2030');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText('Strategic plan created.')).toBeVisible();

  const activatePlan = page.locator('details').filter({ hasText: 'Activate plan' });
  await activatePlan.locator('summary').click();
  await activatePlan.locator('textarea[name="reason"]').fill('Approved by the directors.');
  await activatePlan.getByRole('button', { name: 'Activate plan' }).click();
  await expect(page.getByText('Strategic plan activated.')).toBeVisible();

  const initiativeForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });

  await initiativeForm.locator('input[name="code"]').fill('SI-01');
  await initiativeForm.locator('input[name="name"]').fill('Digital Workplace');
  await initiativeForm.locator('input[name="owner"]').fill('Head of IT');
  await initiativeForm.locator('input[name="envelopeAmount"]').fill('5000000000');
  await initiativeForm.locator('input[name="priorProgramBudgetUsed"]').fill('750000000');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText('Strategic initiative created.')).toBeVisible();
  await expect(page.getByText('SI-01 · Digital Workplace')).toBeVisible();

  // -------------------------------------------- annual plan and annual program
  await page.goto('/plan/annual');
  await page.locator('select[name="fiscalYear"]').selectOption('2027');
  await page.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText('Annual plan created.')).toBeVisible();

  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();

  const activateAnnualPlan = page.locator('details').filter({ hasText: 'Activate annual plan' });
  await activateAnnualPlan.locator('summary').click();
  await activateAnnualPlan.locator('textarea[name="reason"]').fill('FY2027 budget approved.');
  await activateAnnualPlan.getByRole('button', { name: 'Activate annual plan' }).click();
  await expect(page.getByText('Annual plan activated.')).toBeVisible();

  const programForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await programForm.locator('input[name="code"]').fill('PRG-2027-001');
  await programForm.locator('input[name="name"]').fill('Workplace Modernisation 2027');
  await programForm
    .locator('select[name="siId"]')
    .selectOption({ label: 'SI-01 · Digital Workplace' });
  await programForm.locator('input[name="capexBudget"]').fill('1200000000');
  await programForm.locator('input[name="opexBudget"]').fill('300000000');
  await page.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText('Annual program created.')).toBeVisible();
  await expect(page.getByText('PRG-2027-001 · Workplace Modernisation 2027')).toBeVisible();

  // ---------------------------------------------------------------- project
  await page.goto('/plan/projects');
  const projectForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await projectForm
    .locator('select[name="originatingProgramId"]')
    .selectOption({ label: 'PRG-2027-001 · Workplace Modernisation 2027 (FY2027, SI-01)' });
  await projectForm.locator('input[name="name"]').fill('Device Refresh 2027');
  await projectForm.locator('input[name="owner"]').fill('IT Infrastructure Lead');
  await projectForm.locator('input[name="startFiscalYear"]').fill('2027');
  await projectForm.locator('input[name="endFiscalYear"]').fill('2027');
  await projectForm.locator('input[name="allocatedBudgetFullLife"]').fill('1000000000');
  await projectForm.locator('input[name="submittedPrice"]').fill('950000000');
  await projectForm.locator('input[name="finalDealPrice"]').fill('900000000');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project created.')).toBeVisible();
  await expect(page.getByText('PRJ-2027-001')).toBeVisible();

  // ijin prinsip with the BR-9 over-approved flag
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page.locator('tbody tr', { hasText: 'Device Refresh 2027' }).getByRole('link', { name: 'Open' }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  const ijinForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record ijin prinsip' }) });
  await ijinForm.locator('input[name="documentNumber"]').fill('IP-2027-017');
  await ijinForm.locator('input[name="documentDate"]').fill('2026-11-15');
  await ijinForm.locator('input[name="approvedAmount"]').fill('800000000');
  await ijinForm.locator('input[name="approver"]').fill('Board of Directors');
  await page.getByRole('button', { name: 'Record ijin prinsip' }).click();
  await expect(page.getByText('Ijin prinsip saved.')).toBeVisible();
  await expect(page.getByText('over approved budget (BR-9)')).toBeVisible();

  // ------------------------------------------------------------ recurring ops
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  const recurringForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add recurring ops item' }) });
  await recurringForm.locator('input[name="name"]').fill('Leased lines 2027');
  await recurringForm.locator('select[name="categoryId"]').selectOption({ label: 'Connectivity' });
  await recurringForm.locator('input[name="opexBudget"]').fill('240000000');
  await page.getByRole('button', { name: 'Add recurring ops item' }).click();
  await expect(page.getByText('Recurring ops item created.')).toBeVisible();
  await expect(page.getByText('Leased lines 2027')).toBeVisible();

  // -------------------------------------------------- opening balances view
  await page.goto('/plan/opening-balances');
  await expect(page.getByRole('heading', { name: 'Opening balances', exact: true })).toBeVisible();
  await expect(page.getByText('Initiatives — envelope reconciliation')).toBeVisible();
  await expect(page.getByText('Annual programs — carry-in')).toBeVisible();
  await expect(page.getByText('Reconciliation totals')).toBeVisible();
  await expect(page.getByText('PRG-2027-001').first()).toBeVisible();
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();
  await expect(page.getByText('Rp 750.000.000').first()).toBeVisible();

  // ------------------------------------------------------ plan is persisted
  await page.goto('/plan/strategic');
  await expect(page.getByText('SI-01 · Digital Workplace')).toBeVisible();
});
