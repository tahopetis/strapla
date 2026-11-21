import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { assertEmptyStates } from './support/empty-states';

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

interface Timing {
  name: string;
  ms: number;
}

/**
 * Task timings for the UAT sign-off (W8a). They are automated engineering
 * baselines from this journey — machine time on the CI runner, not the owner's
 * stopwatch — and are logged so the run log can be read and recorded.
 */
const timings: Timing[] = [];

function endTiming(name: string, startedAt: number): void {
  const ms = Math.round(performance.now() - startedAt);
  timings.push({ name, ms });
  console.log(`[timing] ${name}: ${ms} ms`);
}

test('builds and reconciles the FY2027 plan end to end @t1', async ({ page }) => {
  // Bounded rather than open-ended: CI runs this in about a minute, and the cap
  // stops one hung step from burning the whole job's budget. The post-close
  // settlement fixture adds a program, a two-year project and two allocations.
  test.setTimeout(240_000);
  // ---------------------------------------------------------------- setup
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Strapla — first-run setup' })).toBeVisible();
  await page.locator('input[name="name"]').fill(ADMIN.name);
  await page.locator('input[name="email"]').fill(ADMIN.email);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.locator('input[name="confirm"]').fill(ADMIN.password);
  // W5b acceptance: a slow save visibly disables the button and relabels it, so
  // a second click is impossible. Hold the action POST briefly to observe it.
  await page.route('**/setup', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    await route.continue();
  });
  const setupSubmit = page.locator('form button[type="submit"]');
  await setupSubmit.click();
  await expect(setupSubmit).toBeDisabled();
  await expect(setupSubmit).toHaveText('Creating…');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.unroute('**/setup');

  // T3: with no portfolio yet, every page renders its empty state. This is the
  // only moment those states exist; later tiers run against a full database.
  await assertEmptyStates(page);

  // W1a: activation lives in the page header's action group. Scoping to that
  // group proves placement instead of finding a form anywhere on the page.
  const pageHeaderActions = page.getByRole('group', { name: 'Page header actions' });

  const activateFromHeader = async (buttonName: string, reason: string) => {
    await expect(pageHeaderActions.getByText('draft', { exact: true })).toBeVisible();
    const form = pageHeaderActions.locator('form');
    await form.locator('textarea[name="reason"]').fill(reason);
    await form.getByRole('button', { name: buttonName }).click();
  };

  // W8a timing: first plan step starts after first-run setup (UAT-01 is not timed).
  const firstPlanStepStartedAt = performance.now();
  await page.goto('/plan/strategic');
  const planForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create plan' }) });
  await planForm.locator('input[name="name"]').fill('IT Strategic Plan 2026–2030');
  await planForm.locator('input[name="startFiscalYear"]').fill('2026');
  await planForm.locator('input[name="endFiscalYear"]').fill('2030');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText(/Strategic plan “IT Strategic Plan 2026–2030” created\./)).toBeVisible();

  // W1a: the status and the activation form are in the page header, not a
  // closed disclosure.
  await activateFromHeader('Activate plan', 'Approved by the directors.');
  await expect(page.getByText(/Strategic plan “IT Strategic Plan 2026–2030” activated\./)).toBeVisible();
  await expect(pageHeaderActions.getByText('active', { exact: true })).toBeVisible();
  endTiming('first-plan-step', firstPlanStepStartedAt);

  const initiativeForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });

  await initiativeForm.locator('input[name="code"]').fill('SI-01');
  await initiativeForm.locator('input[name="name"]').fill('Digital Workplace');
  await initiativeForm.locator('input[name="owner"]').fill('Head of IT');
  await initiativeForm.locator('input[name="envelopeAmount"]').fill('5000000000');
  await initiativeForm.locator('input[name="priorProgramBudgetUsed"]').fill('750000000');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText(/Strategic initiative SI-01 created\./)).toBeVisible();
  await expect(page.getByText('SI-01 · Digital Workplace')).toBeVisible();

  // -------------------------------------------- annual plan and annual program
  await page.goto('/plan/annual');
  await page.locator('select[name="fiscalYear"]').selectOption('2027');
  await page.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText(/Annual plan FY2027 created\./)).toBeVisible();

  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();

  // W1a: the annual plan activation is in the page header too.
  await activateFromHeader('Activate annual plan', 'FY2027 budget approved.');
  await expect(page.getByText(/Annual plan FY2027 activated\./)).toBeVisible();

  // W1a: the fiscal-year badge on the dashboard links to the annual plan page.
  await page.goto('/dashboard');
  const activeFiscalYear = page.getByRole('link', { name: 'FY2027 active annual plan' });
  await expect(activeFiscalYear).toBeVisible();
  await activeFiscalYear.click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();

  const programForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await programForm.locator('input[name="code"]').fill('PRG-2027-001');
  await programForm.locator('input[name="name"]').fill('Workplace Modernisation 2027');
  await programForm
    .locator('select[name="siId"]')
    .selectOption({ label: 'SI-01 · Digital Workplace' });
  await programForm.locator('input[name="capexBudget"]').fill('1200000000');
  await programForm.locator('input[name="opexBudget"]').fill('300000000');
  await page.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText(/Annual program PRG-2027-001 created\./)).toBeVisible();
  await expect(page.getByText('PRG-2027-001 · Workplace Modernisation 2027')).toBeVisible();

  // W1a: the program page's fiscal-year badge links to the annual plan it names.
  await page.getByRole('link', { name: 'Thread' }).first().click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'PRG-2027-001 · Workplace Modernisation 2027',
    }),
  ).toBeVisible();
  const programFiscalYear = page.getByRole('link', {
    name: 'FY2027 annual plan',
    exact: true,
  });
  await expect(programFiscalYear).toBeVisible();
  await expect(programFiscalYear).toHaveAttribute('href', /^\/plan\/annual\/[0-9a-f-]+$/);

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
  // W5b acceptance: one invalid field returns the form with every value intact,
  // the message under the offending input, and nothing created.
  await projectForm.locator('input[name="startFiscalYear"]').fill('1999');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(
    page.getByText('Start fiscal year must be between 2000 and 2100.'),
  ).toBeVisible();
  await expect(projectForm.locator('input[name="name"]')).toHaveValue('Device Refresh 2027');
  await expect(projectForm.locator('input[name="owner"]')).toHaveValue('IT Infrastructure Lead');
  await expect(projectForm.locator('input[name="startFiscalYear"]')).toHaveValue('1999');
  await expect(projectForm.locator('input[name="startFiscalYear"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(projectForm.locator('select[name="originatingProgramId"]')).toHaveValue(
    /^[0-9a-f-]{36}$/,
  );

  await projectForm.locator('input[name="startFiscalYear"]').fill('2027');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(/Project PRJ-2027-001 created\./)).toBeVisible();
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();

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
  await expect(page.getByText(/Ijin prinsip for PRJ-2027-001 saved\./)).toBeVisible();
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
  await expect(page.getByText(/Project year allocation FY2027 created\./)).toBeVisible();
  await expect(
    page.getByText('FY2027 · PRG-2027-001 · Workplace Modernisation 2027').first(),
  ).toBeVisible();

  // W1a: the allocation card's fiscal-year badge links to the annual plan.
  const allocationFiscalYear = page.getByRole('link', {
    name: 'FY2027 annual plan',
    exact: true,
  });
  await expect(allocationFiscalYear).toBeVisible();
  await expect(allocationFiscalYear).toHaveAttribute('href', /^\/plan\/annual\/[0-9a-f-]+$/);

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
  await expect(page.getByText(/Commitment PO-2027-001 recorded\./)).toBeVisible();

  // W8a timing: one spend entry recorded against the allocation.
  const spendEntryStartedAt = performance.now();
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
  await expect(page.getByText(/Spend entry INV-2027-0001 recorded\./)).toBeVisible();
  await expect(page.getByText('partially settled')).toBeVisible();
  endTiming('spend-entry', spendEntryStartedAt);

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

  // ------------------------- post-close settlement fixture (#98)
  // A dedicated FY2027 program and a project spanning FY2027–FY2028, so the
  // execution journey can record an FY2028 payment that settles a commitment
  // from the closed FY2027. It has its own program so the PRG-2027-001 card
  // and the close carry-over totals stay exactly as asserted above.
  const postCloseProgramForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await postCloseProgramForm.locator('input[name="code"]').fill('POST-CLOSE-PRG-27');
  await postCloseProgramForm
    .locator('input[name="name"]')
    .fill('Post-close settlement programme');
  await postCloseProgramForm
    .locator('select[name="siId"]')
    .selectOption({ label: 'SI-01 · Digital Workplace' });
  // a budget the FY2027 allocation fits under; the figures are not asserted elsewhere
  await postCloseProgramForm.locator('input[name="capexBudget"]').fill('100000000');
  await postCloseProgramForm.locator('input[name="opexBudget"]').fill('0');
  await page.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText(/Annual program POST-CLOSE-PRG-27 created\./)).toBeVisible();

  await page.goto('/plan/projects');
  const postCloseProjectForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await postCloseProjectForm
    .locator('select[name="originatingProgramId"]')
    .selectOption({
      label: 'POST-CLOSE-PRG-27 · Post-close settlement programme (FY2027, SI-01)',
    });
  await postCloseProjectForm.locator('input[name="code"]').fill('POST-CLOSE-PRJ-1');
  await postCloseProjectForm.locator('input[name="name"]').fill('Post-close settlement project');
  await postCloseProjectForm.locator('input[name="owner"]').fill('IT Infrastructure Lead');
  await postCloseProjectForm.locator('input[name="startFiscalYear"]').fill('2027');
  await postCloseProjectForm.locator('input[name="endFiscalYear"]').fill('2028');
  await postCloseProjectForm
    .locator('input[name="allocatedBudgetFullLife"]')
    .fill('150000000');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(/Project POST-CLOSE-PRJ-1 created\./)).toBeVisible();

  await page
    .locator('tbody tr', { hasText: 'Post-close settlement project' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'POST-CLOSE-PRJ-1 · Post-close settlement project' }),
  ).toBeVisible();
  const postCloseAllocationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await postCloseAllocationForm
    .locator('select[name="annualProgramId"]')
    .selectOption({
      label: 'FY2027 · POST-CLOSE-PRG-27 · Post-close settlement programme',
    });
  await postCloseAllocationForm.locator('input[name="allocationCapex"]').fill('80000000');
  await postCloseAllocationForm.locator('input[name="allocationOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(/Project year allocation FY2027 created\./)).toBeVisible();

  const postCloseCard = page
    .locator('section')
    .filter({ hasText: 'FY2027 · POST-CLOSE-PRG-27 · Post-close settlement programme' });
  await postCloseCard.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(
    page.getByRole('heading', { name: 'FY2027 allocation · POST-CLOSE-PRG-27' }),
  ).toBeVisible();
  // the commitment stays open until an FY2028 payment settles it after the close
  const postCloseCommitmentForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await postCloseCommitmentForm.locator('select[name="component"]').selectOption('capex');
  await postCloseCommitmentForm.locator('input[name="amount"]').fill('30000000');
  await postCloseCommitmentForm.locator('input[name="commitmentDate"]').fill('2027-09-10');
  await postCloseCommitmentForm.locator('input[name="reference"]').fill('POST-CLOSE-PO-27');
  await page.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText(/Commitment POST-CLOSE-PO-27 recorded\./)).toBeVisible();

  // back to the annual plan for the recurring ops item below
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2027' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();

  // ------------------------------------------------------------ recurring ops
  const recurringForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add recurring ops item' }) });
  await recurringForm.locator('input[name="name"]').fill('Leased lines 2027');
  await recurringForm.locator('select[name="categoryId"]').selectOption({ label: 'Connectivity' });
  await recurringForm.locator('input[name="opexBudget"]').fill('240000000');
  await page.getByRole('button', { name: 'Add recurring ops item' }).click();
  await expect(page.getByText(/Recurring ops item “Leased lines 2027” created\./)).toBeVisible();
  await expect(page.getByText('Leased lines 2027').first()).toBeVisible();

  // -------------------------------------------------- opening balances view
  // W8a timing: open the reconciliation view and load its control totals.
  const reconciliationStartedAt = performance.now();
  await page.goto('/plan/opening-balances');
  await expect(page.getByRole('heading', { name: 'Opening balances', exact: true })).toBeVisible();
  await expect(page.getByText('Initiatives — envelope reconciliation')).toBeVisible();
  await expect(page.getByText('Annual programs — carry-in')).toBeVisible();
  await expect(page.getByText('Control totals and sign-off')).toBeVisible();
  await expect(page.getByText('PRG-2027-001').first()).toBeVisible();
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();
  await expect(page.getByText('Rp 750.000.000').first()).toBeVisible();
  endTiming('reconciliation', reconciliationStartedAt);

  // ------------------------------- W9: an administrator adds a project field
  // The field is created before the opening load, so the registry supplies it as
  // an importable column and the imported value can be checked end to end below.
  await page.goto('/admin/custom-fields');
  await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible();
  const projectFieldCard = page.locator('section').filter({ hasText: 'Procurement method' });
  // the December field list is seeded into the registry by the migration
  await expect(projectFieldCard.getByText('Procurement method').first()).toBeVisible();

  await projectFieldCard.getByText('Add a field').click();
  const addFieldForm = projectFieldCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add field' }) });
  await addFieldForm.locator('input[name="name"]').fill('Delivery note');
  await addFieldForm.locator('select[name="type"]').selectOption('text');
  await addFieldForm.locator('textarea[name="description"]').fill('How the delivery is staged.');
  await addFieldForm.locator('input[name="example"]').fill('Phased rollout');
  await addFieldForm.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByText(/Custom field “Delivery note” added\./)).toBeVisible();
  await expect(page.getByText('Delivery note').first()).toBeVisible();

  // #73: an administrator controls the order the fields appear in
  const activeProjectFields = projectFieldCard.getByRole('list', { name: 'Active fields' });
  const deliveryFieldRow = activeProjectFields
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  await deliveryFieldRow.getByRole('button', { name: 'Move up' }).click();
  await expect(page.getByText(/“Delivery note” moved up\./)).toBeVisible();
  await expect(activeProjectFields.locator('li').first()).toContainText('Delivery note');
  // the position is persisted, not just a render-order change
  await page.reload();
  await expect(
    projectFieldCard.getByRole('list', { name: 'Active fields' }).locator('li').first(),
  ).toContainText('Delivery note');
  // put the creation order back so the import template example below is stable
  await projectFieldCard
    .getByRole('list', { name: 'Active fields' })
    .locator('li')
    .first()
    .getByRole('button', { name: 'Move down' })
    .click();
  await expect(page.getByText(/“Delivery note” moved down\./)).toBeVisible();

  // ---------------------------------------- opening-balance import (W3b)
  await page.goto('/plan/opening-balances/import');
  await expect(page.getByRole('heading', { name: 'Opening-balance import' })).toBeVisible();

  // The generated template carries the app-owned columns and the registry fields.
  const importOrigin = new URL(page.url()).origin;
  const templateResponse = await page.request.get(
    `${importOrigin}/plan/opening-balances/import/template?dataSet=projects&format=csv`,
  );
  expect(templateResponse.ok()).toBeTruthy();
  const templateCsv = await templateResponse.text();
  expect(templateCsv).toContain('Procurement method');
  expect(templateCsv).toContain('Delivery note');
  // #76: the administrator's example becomes the template's example for the column.
  expect(templateCsv).toContain('Phased rollout');

  // malformed file: row-level errors by line, nothing written
  await page.locator('select[name="dataSet"]').selectOption('projects');
  await page.locator('input[name="file"]').setInputFiles('e2e/fixtures/opening-import/projects-invalid.csv');
  await page.locator('input[name="reference"]').fill('E2E-OPENING-IMPORT');
  await page.getByRole('button', { name: 'Validate file' }).click();
  await expect(page.getByText(/problem\(s\); nothing was written/)).toBeVisible();
  await expect(page.getByText(/line 2 · /).first()).toBeVisible();

  const importDataSet = async (label: string, file: string) => {
    await page.goto('/plan/opening-balances/import');
    await page.locator('select[name="dataSet"]').selectOption({ label });
    await page.locator('input[name="file"]').setInputFiles(file);
    await page.locator('input[name="reference"]').fill('E2E-OPENING-IMPORT');
    await page.getByRole('button', { name: 'Validate file' }).click();
    await expect(page.getByText(/row\(s\) validated, nothing written yet/)).toBeVisible();
    await page.getByRole('button', { name: 'Validate and load' }).click();
    await expect(page.getByText(/Imported \d+ .*record\(s\) from/)).toBeVisible();
  };

  // The XLSX import is only reachable before the close: the import always targets
  // the first in-app year, which is FY2027 here. The workbook is built with the
  // same declared columns the CSV template carries, so the upload, the Excel
  // parser and the one-transaction load are all exercised.
  const importXlsx = async (label: string, rows: string[][]): Promise<void> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    for (const row of rows) sheet.addRow(row);
    const payload = Buffer.from(await workbook.xlsx.writeBuffer());
    await page.goto('/plan/opening-balances/import');
    await page.locator('select[name="dataSet"]').selectOption({ label });
    await page.locator('input[name="file"]').setInputFiles({
      name: 'strategic-initiatives.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: payload,
    });
    await page.locator('input[name="reference"]').fill('E2E-OPENING-IMPORT');
    await page.getByRole('button', { name: 'Validate file' }).click();
    await expect(page.getByText(/row\(s\) validated, nothing written yet/)).toBeVisible();
    await page.getByRole('button', { name: 'Validate and load' }).click();
    await expect(page.getByText(/Imported \d+ .*record\(s\) from/)).toBeVisible();
  };

  await importXlsx('Strategic initiatives', [
    [
      'Code',
      'Name',
      'Owner',
      'Objective',
      'Envelope amount (Rp)',
      'Prior program budget consumed (Rp)',
      'Notes',
    ],
    [
      'SI-91',
      'Imported initiative one',
      'Head of Importing',
      'Exercise the opening import.',
      '1000000000',
      '100000000',
      '',
    ],
    [
      'SI-92',
      'Imported initiative two',
      'Head of Importing',
      'Exercise the opening import.',
      '500000000',
      '25000000',
      '',
    ],
  ]);
  await importDataSet('Annual programs', 'e2e/fixtures/opening-import/annual-programs.csv');

  // W8a timing: the 25-project workbook validated and loaded end to end.
  const openingImportStartedAt = performance.now();
  await importDataSet('Projects', 'e2e/fixtures/opening-import/projects-25.csv');
  endTiming('opening-import', openingImportStartedAt);

  // W9: the owner-added columns landed on the imported record, in its audit
  // snapshot and in the panel that reads custom_field_values.
  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Imported project 01' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  await expect(page.getByRole('heading', { name: /Imported project 01/ })).toBeVisible();
  await expect(page.getByText('Additional fields')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Staged delivery (imported)' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Open tender' })).toBeVisible();

  const importedHistory = page.locator('section').filter({ hasText: 'Change history' });
  const importedCreateEntry = importedHistory.locator('tbody tr').first();
  await importedCreateEntry.locator('summary').click();
  await expect(importedCreateEntry.locator('pre', { hasText: 'customFields' })).toBeVisible();
  await expect(
    importedCreateEntry.locator('pre', { hasText: 'Staged delivery (imported)' }),
  ).toBeVisible();

  // back to the reconciliation view for the control totals and the sign-off
  await page.goto('/plan/opening-balances');
  await expect(page.getByText('Control totals and sign-off')).toBeVisible();

  // control totals and the one-time sign-off
  const controlValues = {
    controlEnvelope: '0',
    controlPriorProgramBudgetUsed: '0',
    controlProgramBudgets: '0',
    controlProgramCarryIn: '0',
    controlProjectOpeningAllocated: '0',
    controlProjectOpeningCommitted: '0',
    controlProjectOpeningSpent: '0',
    controlProjectFullLifeAllocated: '0',
  };
  const controlForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save control totals' }) });
  for (const [name, value] of Object.entries(controlValues)) {
    await controlForm.locator(`input[name="${name}"]`).fill(value);
  }
  await controlForm.locator('input[name="reason"]').fill('E2E control totals.');
  await page.getByRole('button', { name: 'Save control totals' }).click();
  await expect(page.getByText(/Control totals saved for the FY2026 opening balances/)).toBeVisible();

  // A control total may differ from the in-app records: the difference is shown
  // and the sign-off records the reason instead of blocking the save.
  await expect(page.getByText('difference', { exact: true }).first()).toBeVisible();

  const signOffForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Sign off opening balances' }) });
  await signOffForm.locator('input[name="reason"]').fill('E2E opening balances sign-off.');
  await page.getByRole('button', { name: 'Sign off opening balances' }).click();
  await expect(page.getByText(/Opening balances for FY2026 signed off\./)).toBeVisible();
  await expect(page.getByText('signed off', { exact: true })).toBeVisible();
  // Sign-off is final: the control-total form is replaced by the read-only notice.
  await expect(page.getByRole('button', { name: 'Save control totals' })).toHaveCount(0);
  await expect(page.getByText(/The control totals are read-only/)).toBeVisible();

  // ------------------------------------------------------ custom fields (#46)
  // The registry now holds the seeded Procurement method and the Delivery note
  // field created before the opening load (W9); the values below are edited on
  // the manually created project.
  await page.goto('/admin/custom-fields');
  await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible();
  await expect(page.getByText('Delivery note').first()).toBeVisible();

  // the fields render on the create/edit form and the values show on the record
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  const projectEditDetails = page.locator('details').filter({ hasText: 'Edit project' });
  await projectEditDetails.locator('summary').click();
  const projectEditForm = projectEditDetails.locator('form');
  await projectEditForm.getByLabel('Procurement method').fill('Open tender');
  await projectEditForm.getByLabel('Delivery note').fill('Phased rollout');
  await projectEditForm.locator('textarea[name="reason"]').fill('Record the procurement detail.');
  await projectEditForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Project PRJ-2027-001 updated\./)).toBeVisible();
  await expect(page.getByText('Additional fields')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Open tender' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Phased rollout' })).toBeVisible();

  // the values ride along in the audit snapshot for the update
  const changeHistory = page.locator('section').filter({ hasText: 'Change history' });
  // the before/after JSON sits behind a per-row disclosure; the newest row is the update
  const latestHistory = changeHistory.locator('tbody tr').first();
  await latestHistory.locator('summary').click();
  await expect(latestHistory.locator('pre', { hasText: 'customFields' })).toBeVisible();
  await expect(latestHistory.locator('pre', { hasText: 'Phased rollout' })).toBeVisible();

  // the report shows the extra columns, filters by them, and the export selects columns
  await page.goto('/reports/project-register');
  await expect(
    page.getByRole('columnheader', { name: 'Delivery note', exact: true }),
  ).toBeVisible();
  // W9: the imported owner-column value is part of the report, not only the panel
  await expect(page.getByRole('cell', { name: 'Staged delivery (imported)' })).toBeVisible();
  await page.locator('select[name="cf"]').selectOption({ label: 'Delivery note' });
  await page.locator('input[name="cv"]').fill('phased');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();
  await expect(
    page.getByText('Totals cover the whole report, not only the filtered rows.'),
  ).toBeVisible();

  // a second field's filter stacks with the first, combined with AND (#74)
  await page.locator('select[name="cf"]').selectOption({ label: 'Procurement method' });
  await page.locator('input[name="cv"]').fill('open');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(2);
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();
  // the imported project matches the procurement filter but not the delivery one
  await expect(page.getByText('Imported project 01')).toHaveCount(0);
  // the URL carries both pairs, so a reload rebuilds the same AND view
  await page.reload();
  await expect(page.getByText('PRJ-2027-001').first()).toBeVisible();
  await expect(page.getByText('Imported project 01')).toHaveCount(0);
  // removing one filter widens the rows without losing the other filter
  await page.locator('a[aria-label^="Remove filter"]').first().click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(page.getByText('Imported project 01').first()).toBeVisible();
  // clear all drops the remaining filter and restores every row
  await page.getByRole('link', { name: 'Clear all' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(0);
  await expect(page.getByText('Imported project 01').first()).toBeVisible();
  await page.locator('select[name="cf"]').selectOption({ label: 'Delivery note' });
  await page.locator('input[name="cv"]').fill('no such value');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByText('PRJ-2027-001')).toHaveCount(0);

  const reportOrigin = new URL(page.url()).origin;
  const csvWithColumns = await page.request.get(
    `${reportOrigin}/reports/export/project-register?format=csv`,
  );
  expect(await csvWithColumns.text()).toContain('Delivery note');
  expect(await csvWithColumns.text()).toContain('Phased rollout');
  const csvWithoutColumns = await page.request.get(
    `${reportOrigin}/reports/export/project-register?format=csv&columns=`,
  );
  expect(await csvWithoutColumns.text()).not.toContain('Delivery note');

  // removing the field archives it, frees the name and drops it from forms and reports
  await page.goto('/admin/custom-fields');
  const activeDeliveryField = projectFieldCard
    .getByRole('list', { name: 'Active fields' })
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  // #76: the row shows the stable machine key, the example and the live usage count.
  await expect(activeDeliveryField.getByText('key: deliveryNote', { exact: true })).toBeVisible();
  await expect(
    activeDeliveryField.getByText('Example: Phased rollout', { exact: true }),
  ).toBeVisible();
  // two records hold a value: the imported project and the manually edited one.
  await expect(activeDeliveryField.getByText('Used by 2 records', { exact: true })).toBeVisible();
  await activeDeliveryField.getByRole('button', { name: 'Remove field' }).click();
  const removeFieldDialog = activeDeliveryField.getByRole('dialog');
  await expect(removeFieldDialog).toBeVisible();
  // #76: the confirmation repeats how many records hold a value.
  await expect(removeFieldDialog.getByText(/Used by 2 records/)).toBeVisible();
  await removeFieldDialog.locator('textarea[name="reason"]').fill('No longer needed.');
  await removeFieldDialog.getByRole('button', { name: 'Remove field' }).click();
  await expect(page.getByText(/Custom field “Delivery note” removed\./)).toBeVisible();
  // the archived row is an li too, so the removal is proven against the active list
  await expect(
    page.getByRole('list', { name: 'Active fields' }).getByText('Delivery note'),
  ).toHaveCount(0);

  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  await expect(projectEditForm.getByLabel('Delivery note')).toHaveCount(0);
  await page.goto('/reports/project-register');
  await expect(page.getByText('Delivery note')).toHaveCount(0);

  // --------------------------------------------- archived fields (#72)
  // Removing archives the field instead of deleting it: the archived row keeps
  // the metadata and the count of records that still hold a value, and a
  // restore puts the definition and the old values back everywhere.
  await page.goto('/admin/custom-fields');
  await expect(page.getByRole('heading', { name: 'Custom fields', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archived fields', exact: true })).toBeVisible();
  const archivedFieldRow = projectFieldCard
    .getByRole('list', { name: 'Archived fields' })
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  await expect(archivedFieldRow).toHaveCount(1);
  await expect(archivedFieldRow.getByText('Delivery note', { exact: true })).toBeVisible();
  await expect(archivedFieldRow.getByText('key: deliveryNote', { exact: true })).toBeVisible();
  await expect(archivedFieldRow.getByText('Text', { exact: true })).toBeVisible();
  await expect(archivedFieldRow.getByText(/Archived .+ — No longer needed\./)).toBeVisible();
  // exactly the two records that held a value: the imported project and the
  // manually edited one
  await expect(archivedFieldRow.getByText('2 records with a value')).toBeVisible();

  // restoring with a reason brings the field back from the archived list
  await archivedFieldRow.getByRole('button', { name: 'Restore field' }).click();
  const restoreFieldDialog = page.getByRole('dialog');
  await expect(restoreFieldDialog).toBeVisible();
  await restoreFieldDialog.locator('textarea[name="reason"]').fill('Needed again.');
  await restoreFieldDialog.getByRole('button', { name: 'Restore field' }).click();
  await expect(page.getByText(/Custom field “Delivery note” restored\./)).toBeVisible();
  // no archived row remains, and the active list carries the field again
  await expect(projectFieldCard.getByRole('list', { name: 'Archived fields' })).toHaveCount(0);
  await expect(
    projectFieldCard
      .getByRole('list', { name: 'Active fields' })
      .getByText('Delivery note', { exact: true }),
  ).toBeVisible();

  // the restored field and the value recorded before the removal are visible again
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  await expect(page.getByText('Additional fields')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Phased rollout' })).toBeVisible();
  await expect(projectEditForm.getByLabel('Delivery note')).toHaveValue('Phased rollout');

  await page.goto('/reports/project-register');
  await expect(
    page.getByRole('columnheader', { name: 'Delivery note', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Phased rollout' })).toBeVisible();
  // the export carries the restored column and value again
  const restoredReportOrigin = new URL(page.url()).origin;
  const restoredCsv = await page.request.get(
    `${restoredReportOrigin}/reports/export/project-register?format=csv`,
  );
  expect(await restoredCsv.text()).toContain('Delivery note');
  expect(await restoredCsv.text()).toContain('Phased rollout');

  // remove it again, then let a new active field reuse the freed name: the
  // active conflict blocks the restore of the archived one
  await page.goto('/admin/custom-fields');
  const restoredDeliveryField = page
    .getByRole('list', { name: 'Active fields' })
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  await restoredDeliveryField.getByRole('button', { name: 'Remove field' }).click();
  const secondRemoveDialog = restoredDeliveryField.getByRole('dialog');
  await expect(secondRemoveDialog).toBeVisible();
  await secondRemoveDialog.locator('textarea[name="reason"]').fill('Second removal.');
  await secondRemoveDialog.getByRole('button', { name: 'Remove field' }).click();
  await expect(page.getByText(/Custom field “Delivery note” removed\./)).toBeVisible();

  await projectFieldCard.getByText('Add a field').click();
  await addFieldForm.locator('input[name="name"]').fill('Delivery note');
  await addFieldForm.locator('select[name="type"]').selectOption('text');
  await addFieldForm
    .locator('textarea[name="description"]')
    .fill('Recreated while the old field is archived.');
  await addFieldForm.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByText(/Custom field “Delivery note” added\./)).toBeVisible();

  const archivedAgain = projectFieldCard
    .getByRole('list', { name: 'Archived fields' })
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  await expect(archivedAgain.getByText(/Archived .+ — Second removal\./)).toBeVisible();
  await archivedAgain.getByRole('button', { name: 'Restore field' }).click();
  const restoreConflictDialog = page.getByRole('dialog');
  await expect(restoreConflictDialog).toBeVisible();
  await restoreConflictDialog.locator('textarea[name="reason"]').fill('Recreated conflict.');
  await restoreConflictDialog.getByRole('button', { name: 'Restore field' }).click();
  // both the name and the key collide; the name conflict is the message shown
  await expect(
    restoreConflictDialog.getByText(
      'Cannot restore “Delivery note”: the Project already has an active field with that name (“Delivery note”).',
    ),
  ).toBeVisible();
  await restoreConflictDialog.getByRole('button', { name: 'Cancel' }).click();
  // the refused restore left the archived field exactly where it was
  await expect(archivedAgain.getByText('key: deliveryNote', { exact: true })).toBeVisible();

  // Rename the recreated field: the name is free again but the key is not (a
  // key survives renames), which proves the key half of the guard.
  const recreatedField = page
    .getByRole('list', { name: 'Active fields' })
    .locator('li')
    .filter({ hasText: 'Delivery note' });
  await recreatedField.getByText('Edit field').click();
  const recreatedFieldForm = recreatedField
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save field' }) });
  await recreatedFieldForm.locator('input[name="name"]').fill('Delivery note (renamed)');
  await recreatedFieldForm.locator('textarea[name="reason"]').fill('Free the old name.');
  await recreatedFieldForm.getByRole('button', { name: 'Save field' }).click();
  await expect(page.getByText(/Custom field “Delivery note \(renamed\)” updated\./)).toBeVisible();

  await archivedAgain.getByRole('button', { name: 'Restore field' }).click();
  const keyConflictDialog = page.getByRole('dialog');
  await expect(keyConflictDialog).toBeVisible();
  await keyConflictDialog.locator('textarea[name="reason"]').fill('Key conflict now.');
  await keyConflictDialog.getByRole('button', { name: 'Restore field' }).click();
  await expect(
    keyConflictDialog.getByText(
      'Cannot restore “Delivery note”: the key “deliveryNote” is already used by the active field “Delivery note (renamed)” on Project.',
    ),
  ).toBeVisible();
  await keyConflictDialog.getByRole('button', { name: 'Cancel' }).click();
  // the refused restore left the archived field exactly where it was
  await expect(archivedAgain.getByText('key: deliveryNote', { exact: true })).toBeVisible();

  // the successful restore is audited with its reason, under a readable label (#76);
  // the filter values keep the machine tokens, so an existing link still works.
  await page.goto('/admin/audit?action=custom_field_restore');
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();
  // An <option> in a closed <select> is hidden to Playwright, so assert its text.
  await expect(
    page.locator('select[name="action"] option[value="custom_field_restore"]'),
  ).toHaveText('Custom field restored');
  await expect(
    page.locator('select[name="entityType"] option[value="custom_field"]'),
  ).toHaveText('Custom field');
  await expect(
    page
      .locator('tbody tr')
      .filter({ hasText: 'Custom field restored' })
      .filter({ hasText: 'Needed again.' })
      .first(),
  ).toBeVisible();

  // #71: a field on a newly covered record type works end to end
  await page.goto('/admin/custom-fields');
  const addEntityField = async (entityLabel: string, name: string, description: string) => {
    const card = page.locator('section').filter({ hasText: entityLabel });
    await card.getByText('Add a field').click();
    const form = card
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add field' }) });
    await form.locator('input[name="name"]').fill(name);
    await form.locator('select[name="type"]').selectOption('text');
    await form.locator('textarea[name="description"]').fill(description);
    await form.getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText(`Custom field “${name}” added.`)).toBeVisible();
  };
  await addEntityField('Ijin prinsip', 'Approval note', 'What the directors approved.');
  await addEntityField('Project year allocation', 'Allocation note', 'Note kept on this year.');
  await addEntityField('Commitment entry', 'Commitment note', 'Note kept on this commitment.');
  await addEntityField('Spend entry', 'Spend note', 'Note kept on this spend entry.');

  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Device Refresh 2027' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  const ijinCard = page.locator('section').filter({ hasText: 'Ijin prinsip' });
  await ijinCard.locator('summary', { hasText: 'Update ijin prinsip' }).click();
  const updateIjinForm = ijinCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Update ijin prinsip' }) });
  await updateIjinForm.getByLabel('Approval note').fill('Approved for phased delivery.');
  await updateIjinForm.locator('textarea[name="reason"]').fill('Record the approval note.');
  await updateIjinForm.getByRole('button', { name: 'Update ijin prinsip' }).click();
  await expect(page.getByText(/Ijin prinsip for PRJ-2027-001 saved\./)).toBeVisible();
  await expect(
    ijinCard.locator('dd', { hasText: 'Approved for phased delivery.' }),
  ).toBeVisible();

  // the definition and the value survive a reload, and the record form prefills
  await page.reload();
  await expect(
    ijinCard.locator('dd', { hasText: 'Approved for phased delivery.' }),
  ).toBeVisible();
  await ijinCard.locator('summary', { hasText: 'Update ijin prinsip' }).click();
  await expect(ijinCard.getByLabel('Approval note')).toHaveValue(
    'Approved for phased delivery.',
  );
  await page.goto('/admin/audit?entityType=ijin_prinsip');
  const ijinAuditRow = page.locator('tbody tr').filter({ hasText: 'Record the approval note.' });
  await ijinAuditRow.getByText('Show values').click();
  await expect(ijinAuditRow.locator('pre', { hasText: 'Approval note' })).toBeVisible();

  // project year allocation: enter, panel and audit on its own edit form
  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Device Refresh 2027' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  const allocationCard = page.locator('section').filter({ hasText: 'FY2027 · PRG-2027-001' });
  await allocationCard.locator('summary', { hasText: 'Edit allocation' }).click();
  const allocationEditForm = allocationCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await allocationEditForm.getByLabel('Allocation note').fill('Delivered in two tranches.');
  await allocationEditForm.locator('textarea[name="reason"]').fill('Record the allocation note.');
  await allocationEditForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Project year allocation FY2027 updated\./)).toBeVisible();
  await expect(
    allocationCard.locator('dd', { hasText: 'Delivered in two tranches.' }),
  ).toBeVisible();
  await page.goto('/admin/audit?entityType=project_year_allocation');
  const allocationAuditRow = page
    .locator('tbody tr')
    .filter({ hasText: 'Record the allocation note.' });
  await allocationAuditRow.getByText('Show values').click();
  await expect(
    allocationAuditRow.locator('pre', { hasText: 'Allocation note' }),
  ).toBeVisible();

  // commitment and spend: enter, panel and audit on their inline edit forms
  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Device Refresh 2027' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /FY2027 allocation/ })).toBeVisible();

  const commitmentEntries = page.locator('section').filter({ hasText: 'Commitment entries' });
  const commitmentRow = commitmentEntries.locator('tbody tr').filter({ hasText: 'PO-2027-001' });
  await commitmentRow.locator('summary', { hasText: 'Manage' }).click();
  const commitmentEditForm = commitmentRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save commitment' }) });
  await commitmentEditForm.getByLabel('Commitment note').fill('Covers the first milestone.');
  await commitmentEditForm.locator('textarea[name="reason"]').fill('Record the commitment note.');
  await commitmentEditForm.getByRole('button', { name: 'Save commitment' }).click();
  await expect(page.getByText(/Commitment PO-2027-001 updated\./)).toBeVisible();
  await expect(commitmentEntries.getByText('Covers the first milestone.')).toBeVisible();
  await page.goto('/admin/audit?entityType=commitment_entry');
  const commitmentAuditRow = page
    .locator('tbody tr')
    .filter({ hasText: 'Record the commitment note.' });
  await commitmentAuditRow.getByText('Show values').click();
  await expect(
    commitmentAuditRow.locator('pre', { hasText: 'Commitment note' }),
  ).toBeVisible();

  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Device Refresh 2027' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /FY2027 allocation/ })).toBeVisible();
  const spendEntries = page.locator('section').filter({ hasText: 'Spend entries' });
  const spendRow = spendEntries.locator('tbody tr').filter({ hasText: 'INV-2027-0001' });
  await spendRow.locator('summary', { hasText: 'Manage' }).click();
  const spendEditForm = spendRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save spend' }) });
  await spendEditForm.getByLabel('Spend note').fill('Invoice settled against the PO.');
  await spendEditForm.locator('textarea[name="reason"]').fill('Record the spend note.');
  await spendEditForm.getByRole('button', { name: 'Save spend' }).click();
  await expect(page.getByText(/Spend entry INV-2027-0001 updated\./)).toBeVisible();
  await expect(spendEntries.getByText('Invoice settled against the PO.')).toBeVisible();
  await page.goto('/admin/audit?entityType=spend_entry');
  const spendAuditRow = page.locator('tbody tr').filter({ hasText: 'Record the spend note.' });
  await spendAuditRow.getByText('Show values').click();
  await expect(spendAuditRow.locator('pre', { hasText: 'Spend note' })).toBeVisible();

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

  // #75: the report remembers the chosen custom columns for the signed-in user.
  // The recreated field was renamed above, so the surviving active field is the
  // renamed one; the archived original is out of every report.
  await page.goto('/reports/project-register');
  // The checkboxes live in the closed "Extra columns" disclosure, so open it first.
  await page.getByText('Extra columns').click();
  const deliveryColumn = page.getByRole('checkbox', {
    name: 'Delivery note (renamed)',
    exact: true,
  });
  const deliveryColumnId = await deliveryColumn.getAttribute('value');
  expect(deliveryColumnId).toBeTruthy();
  await deliveryColumn.uncheck();
  await page.getByRole('button', { name: 'Save selection' }).click();
  await expect(page.getByText(/Selection saved/)).toBeVisible();
  // saving applies the selection to the current view immediately
  await expect(
    page.getByRole('columnheader', { name: 'Delivery note (renamed)', exact: true }),
  ).toHaveCount(0);
  // returning to the report without a columns parameter keeps the saved subset
  await page.goto('/reports/project-register');
  await expect(
    page.getByRole('columnheader', { name: 'Delivery note (renamed)', exact: true }),
  ).toHaveCount(0);
  // an explicit columns link still wins for a shareable view
  await page.goto(`/reports/project-register?columns=${deliveryColumnId}`);
  await expect(
    page.getByRole('columnheader', { name: 'Delivery note (renamed)', exact: true }),
  ).toBeVisible();

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
  await expect(page.getByText(/Member Second Admin created\./)).toBeVisible();
  await expect(page.getByText('second-admin@strapla.test')).toBeVisible();

  const memberRow = page.locator('tbody tr', { hasText: 'second-admin@strapla.test' });
  await memberRow.locator('summary', { hasText: 'Manage' }).click();
  await memberRow.getByRole('button', { name: 'Deactivate member' }).click();
  const deactivateDialog = memberRow.getByRole('dialog');
  await expect(deactivateDialog).toBeVisible();
  await deactivateDialog.locator('textarea[name="reason"]').fill('Testing the deactivation flow.');
  await deactivateDialog.getByRole('button', { name: 'Deactivate member' }).click();
  await expect(page.getByText(/Member Second Admin deactivated\./)).toBeVisible();

  await page.goto('/admin/audit?entityType=user');
  await expect(page.locator('tbody').getByText('member_create').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('member_deactivate').first()).toBeVisible();

  // W1a: both activations record the unchanged status_change entry with its reason.
  await page.goto('/admin/audit?entityType=strategic_plan');
  await expect(page.locator('tbody').getByText('status_change').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('Approved by the directors.').first()).toBeVisible();

  await page.goto('/admin/audit?entityType=annual_plan');
  await expect(page.locator('tbody').getByText('status_change').first()).toBeVisible();
  await expect(page.locator('tbody').getByText('FY2027 budget approved.').first()).toBeVisible();

  // ------------------------------------------------ full annual cycle (M4/M5)
  await page.goto('/plan/annual');
  const annualForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
  await annualForm.locator('select[name="fiscalYear"]').selectOption('2028');
  await page.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText(/Annual plan FY2028 created\./)).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'FY2028' })).toBeVisible();

  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'FY2028 annual plan' })).toBeVisible();
  // FY2028 becomes the open year: FY2027 closes below, and the later tiers write
  // their own programs, projects and allocations into this year.
  await activateFromHeader('Activate annual plan', 'FY2028 provisional budget approved.');
  await expect(page.getByText(/Annual plan FY2028 activated\./)).toBeVisible();
  const continuationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await continuationForm.locator('input[name="name"]').fill('Workplace Modernisation 2028');
  await continuationForm.locator('select[name="siId"]').selectOption({ label: 'SI-01 · Digital Workplace' });
  await continuationForm
    .locator('select[name="prevProgramId"]')
    .selectOption({ label: 'PRG-2027-001 · Workplace Modernisation 2027 (FY2027, SI-01)' });
  await page.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText(/Annual program .* created\./)).toBeVisible();
  await expect(page.getByText('Continues program').first()).toBeVisible();

  // The FY2028 leg of the post-close project: its second allocation, still
  // before the FY2027 close below (the open-year allocation is created while
  // FY2028 exists so the closed year and the open year are both fixtures).
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Post-close settlement project' })
    .getByRole('link', { name: 'Open' })
    .click();
  const openYearAllocationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await openYearAllocationForm
    .locator('select[name="annualProgramId"]')
    .selectOption({
      label: 'FY2028 · PRG-2028-001 · Workplace Modernisation 2028',
    });
  await openYearAllocationForm.locator('input[name="allocationCapex"]').fill('70000000');
  await openYearAllocationForm.locator('input[name="allocationOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(/Project year allocation FY2028 created\./)).toBeVisible();

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
  await expect(page.getByText(/Fiscal year FY2027 closed and carry-over recorded\./)).toBeVisible();
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

  // The t2 and t3 projects reuse this signed-in state instead of replaying setup.
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });

  console.log(`[timings] ${JSON.stringify(timings)}`);
});
