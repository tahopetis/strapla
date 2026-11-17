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
  // Generous cap so the suite also passes on slow development boxes; CI runs it in seconds.
  test.setTimeout(600_000);
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

  // ------------------------------------------------ project year allocation (M2)
  const allocationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await allocationForm.locator('select[name="annualProgramId"]').selectOption({
    label: 'FY2027 · PRG-2027-001 · Workplace Modernisation 2027',
  });
  await allocationForm.locator('input[name="allocationCapex"]').fill('500000000');
  await allocationForm.locator('input[name="allocationOpex"]').fill('100000000');
  await page.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText('Project year allocation saved.')).toBeVisible();
  await expect(
    page.getByText('FY2027 · PRG-2027-001 · Workplace Modernisation 2027').first(),
  ).toBeVisible();

  // ---------------------------------------- commitments, spend and settlement (M3)
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /FY2027 allocation/ })).toBeVisible();

  const commitmentForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await commitmentForm.locator('select[name="component"]').selectOption('capex');
  await commitmentForm.locator('input[name="amount"]').fill('100000000');
  await commitmentForm.locator('input[name="commitmentDate"]').fill('2027-08-15');
  await commitmentForm.locator('input[name="reference"]').fill('PO-2027-001');
  await page.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText('Commitment recorded.')).toBeVisible();

  const spendForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('60000000');
  await spendForm.locator('input[name="spentOn"]').fill('2027-09-01');
  await spendForm.locator('input[name="vendor"]').fill('PT Vendor Nusantara');
  await spendForm.locator('input[name="reference"]').fill('INV-2027-0001');
  await spendForm.locator('input[name^="settle_"]').first().fill('60000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText('Spend entry recorded.')).toBeVisible();
  await expect(page.getByText('partially settled')).toBeVisible();

  // ---------------------------------------- program card reflects the allocation
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();
  const programCard = page
    .locator('section')
    .filter({ hasText: 'PRG-2027-001 · Workplace Modernisation 2027' })
    .last();
  await expect(programCard.getByText('Capex allocated')).toBeVisible();
  await expect(programCard.getByText('Rp 500.000.000')).toBeVisible();
  await expect(programCard.getByText('Rp 700.000.000')).toBeVisible();

  // ------------------------------------------------------------ recurring ops
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

  // ------------------------------------------------------ reports and exports
  await page.goto('/reports');
  await expect(page.getByText('SI five-year view', { exact: true }).first()).toBeVisible();

  await page.goto('/reports/si-five-year');
  await expect(page.getByRole('heading', { name: 'SI five-year view' })).toBeVisible();
  await expect(page.getByText('Portfolio total')).toBeVisible();

  await page.goto('/reports/annual-plan');
  await expect(page.getByRole('heading', { name: 'Annual plan by SI and program' })).toBeVisible();

  await page.goto('/reports/project-register');
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();

  await page.goto('/reports/budget-vs-actual');
  await expect(page.getByRole('heading', { name: 'Budget versus actual' })).toBeVisible();

  const origin = new URL(page.url()).origin;
  const csv = await page.request.get(`${origin}/reports/export/si-five-year?format=csv`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('SI code');

  const xlsx = await page.request.get(`${origin}/reports/export/project-register?format=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');

  // ------------------------------------------------------ administration (M2.5)
  await page.goto('/admin/members');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  const createMember = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create member' }) });
  await createMember.locator('input[name="name"]').fill('Second Admin');
  await createMember.locator('input[name="email"]').fill('second-admin@strapla.test');
  await createMember.locator('input[name="password"]').fill('another strong password');
  await page.getByRole('button', { name: 'Create member' }).click();
  await expect(page.getByText('Member created.')).toBeVisible();
  await expect(page.getByText('second-admin@strapla.test')).toBeVisible();

  const memberRow = page.locator('tbody tr', { hasText: 'second-admin@strapla.test' });
  await memberRow.locator('summary', { hasText: 'Manage' }).click();
  const deactivateForm = memberRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Deactivate member' }) });
  await deactivateForm.locator('textarea[name="reason"]').fill('Testing the deactivation flow.');
  await deactivateForm.getByRole('button', { name: 'Deactivate member' }).click();
  await expect(page.getByText('Member deactivated.')).toBeVisible();

  await page.goto('/admin/audit?entityType=user');
  await expect(page.locator('tbody').getByText('member_create').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('member_deactivate').first()).toBeVisible();

  // ------------------------------------------------ full annual cycle (M4/M5)
  await page.goto('/plan/annual');
  const annualForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
  await annualForm.locator('select[name="fiscalYear"]').selectOption('2028');
  await page.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText('Annual plan created.')).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'FY2028' })).toBeVisible();

  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2028 annual plan' })).toBeVisible();
  const continuationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await continuationForm.locator('input[name="name"]').fill('Workplace Modernisation 2028');
  await continuationForm.locator('select[name="siId"]').selectOption({ label: 'SI-01 · Digital Workplace' });
  await continuationForm
    .locator('select[name="prevProgramId"]')
    .selectOption({ label: 'PRG-2027-001 · Workplace Modernisation 2027 (FY2027, SI-01)' });
  await page.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText('Annual program created.')).toBeVisible();
  await expect(page.getByText('Continues program').first()).toBeVisible();

  // close FY2027 with a program carry-over
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: 'Close FY2027' })).toBeVisible();
  const closeProgramRow = page.locator('tbody tr', { hasText: 'PRG-2027-001' }).first();
  // every carry field must be filled in explicitly (0 for none), so zero carry-over is deliberate
  const carryInputs = page.locator('input[name^="carry_"]');
  for (let index = 0; index < (await carryInputs.count()); index += 1) {
    await carryInputs.nth(index).fill('0');
  }
  await closeProgramRow.locator('input[name$="_capex"]').fill('100000000');
  await expect(
    page.getByRole('region', { name: 'Carry-over totals preview' }),
  ).toContainText('Rp 100.000.000');
  await page.locator('input[name="reference"]').fill('E2E-CLOSE-FY2027');

  // a wrong typed confirmation is blocked by the form and nothing is submitted
  await page.locator('input[name="confirmation"]').fill('CLOSE FY2026');
  await page.getByRole('button', { name: /Close FY2027 and carry over/ }).click();
  // The browser blocks the submit, so no server round trip resets the reference field.
  await expect(page.locator('input[name="reference"]')).toHaveValue('E2E-CLOSE-FY2027');

  await page.locator('input[name="confirmation"]').fill('CLOSE FY2027');
  await page.getByRole('button', { name: /Close FY2027 and carry over/ }).click();
  await expect(page.getByText('Fiscal year closed and carry-over recorded.')).toBeVisible();
  await page.goto('/plan/annual');
  await expect(page.locator('tbody tr', { hasText: 'FY2027' }).getByText('closed')).toBeVisible();

  // carry-in landed on the FY2028 continuation program and the thread is visible
  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2028 annual plan' })).toBeVisible();
  await expect(page.getByText('Rp 100.000.000').first()).toBeVisible();
  await page.goto('/plan/annual');
  await expect(page.getByRole('heading', { name: 'Program threads' })).toBeVisible();
  await expect(page.getByText('FY2028 PRG-2028-001').first()).toBeVisible();

  // ------------------------------------------------------ in-app help guide
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help & user guide' })).toBeVisible();
  await expect(page.getByText('Is there a default username or password?')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Help' })).toBeVisible();

  // ------------------------------------------------------ plan is persisted
  await page.goto('/plan/strategic');
  await expect(page.getByText('SI-01 · Digital Workplace')).toBeVisible();
});
