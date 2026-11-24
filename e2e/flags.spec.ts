import { expect, test, type Page } from '@playwright/test';
import { createProgramFixture } from './support/programs';

/**
 * Funding flags (src/domain/funding.ts, src/domain/plan.ts, ADR-0003 §6) on the
 * pages that render them: the project page's pricing card, the project register
 * and the annual-plan program card, the strategic plan's envelope check and the
 * SI five-year report.
 *
 * Every family is proved with data crafted through the UI inside the open
 * FY2028 annual plan, under a dedicated strategic initiative and program so the
 * assertions are scoped to records this file creates. Flags are advisory
 * (BR-17): each save below succeeds while the corresponding flag is already
 * showing, which is asserted through the action's own flash message.
 *
 * Rule keys are the ones the domain uses:
 * - BR-2  envelope: prior program budget consumed + effective program budgets
 *         <= the component's envelope (`envelopeCheck`); the strategic page
 *         says "Over envelope", the SI five-year report renders the component
 *         badge "over capex envelope" / "over opex envelope".
 * - BR-7  allocation above the program's available budget
 *         (`programBudgetPosition`); the program card says "over-allocated".
 * - BR-8  lifetime commitments (opening + in-app) above the contract value
 *         (`projectFundingFlags`), rendered on the project page as
 *         "commitments over contract (BR-8)" and in the project register
 *         report as `commitments_over_contract`.
 * - BR-9  final deal price above the ijin prinsip approved budget
 *         -> project page label "over approved budget (BR-9)".
 * - BR-18 final deal price above the submitted price
 *         -> project page label "above submitted price (BR-18)".
 * - BR-11 current-year spend above the fiscal-year commitments
 *         (`spendExceedsFiscalYearCommitment`) -> allocation page badge.
 * - allocations above the project's full-life allocated budget
 *   (`project_allocations_over_full_life`).
 */

const FY = 2028;
const OWNER = 'E2E Flags Owner';

async function addInitiative(
  page: Page,
  input: { code: string; name: string; envelopeCapex: string; envelopeOpex: string },
): Promise<void> {
  await page.goto('/plan/strategic');
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });
  await form.locator('input[name="code"]').fill(input.code);
  await form.locator('input[name="name"]').fill(input.name);
  await form.locator('input[name="owner"]').fill(OWNER);
  await form.locator('input[name="envelopeCapex"]').fill(input.envelopeCapex);
  await form.locator('input[name="envelopeOpex"]').fill(input.envelopeOpex);
  await form.locator('input[name="priorCapex"]').fill('0');
  await form.locator('input[name="priorOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(
    page.getByText(`Strategic initiative ${input.code} created.`),
  ).toBeVisible();
}

async function openAnnualPlan(page: Page): Promise<void> {
  await page.goto('/plan/annual');
  await page
    .locator('tbody tr', { hasText: `FY${FY}` })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: `FY${FY} annual plan` }),
  ).toBeVisible();
}

async function addProgram(
  page: Page,
  input: { code: string; name: string; siLabel: string; capexBudget: string },
): Promise<void> {
  await openAnnualPlan(page);
  await createProgramFixture({
    fiscalYear: FY,
    siCode: input.siLabel.split(' · ')[0] ?? 'SI-01',
    code: input.code,
    name: input.name,
    capex: Number(input.capexBudget),
    opex: 0,
  });
  await page.reload();
  await expect(page.getByText(`${input.code} · ${input.name}`).first()).toBeVisible();
}

async function createProject(
  page: Page,
  input: {
    programLabel: string;
    name: string;
    fullLife: string;
    submittedPrice: string;
    finalDealPrice: string;
  },
): Promise<void> {
  await page.goto('/plan/projects');
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await form.locator('select[name="originatingProgramId"]').selectOption({
    label: input.programLabel,
  });
  await form.locator('input[name="name"]').fill(input.name);
  await form.locator('input[name="owner"]').fill(OWNER);
  await form.locator('input[name="startFiscalYear"]').fill(String(FY));
  await form.locator('input[name="endFiscalYear"]').fill(String(FY));
  await form.locator('input[name="allocatedBudgetFullLife"]').fill(input.fullLife);
  await form.locator('input[name="submittedPrice"]').fill(input.submittedPrice);
  await form.locator('input[name="finalDealPrice"]').fill(input.finalDealPrice);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(
    page.getByText(`Project PRJ-${FY}-`),
  ).toBeVisible();
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.goto('/plan/projects');
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page.locator('tbody tr', { hasText: name }).getByRole('link', { name: 'Open' }).click(),
  ]);
  await expect(
    page.getByRole('heading', { level: 1, name: `· ${name}` }),
  ).toBeVisible();
}

test('flags an over-allocated program, over-committed contract and envelope overrun @t2', async ({
  page,
}) => {
  // A dedicated initiative with a small capex envelope: the FY2028 program below
  // costs more than the capex envelope, so BR-2 is proved on this row only.
  await addInitiative(page, {
    code: 'SI-7701',
    name: 'Flags envelope initiative',
    envelopeCapex: '100000000',
    envelopeOpex: '0',
  });
  await addProgram(page, {
    code: 'PRG-2028-7701',
    name: 'Flags envelope program 2028',
    siLabel: 'SI-7701 · Flags envelope initiative',
    capexBudget: '150000000',
  });

  // BR-2 on the strategic plan page (the check the funding page documents).
  await page.goto('/plan/strategic');
  const initiativeCard = page
    .locator('section')
    .filter({ hasText: 'SI-7701 · Flags envelope initiative' });
  await expect(initiativeCard.getByText('Over envelope', { exact: true })).toBeVisible();
  await expect(initiativeCard.getByText('-Rp 50.000.000', { exact: true })).toBeVisible();

  // The same envelope overrun is a row badge in the SI five-year report.
  await page.goto('/reports/si-five-year');
  const envelopeRow = page.locator('tbody tr').filter({ hasText: 'SI-7701' });
  await expect(envelopeRow.getByText('over capex envelope', { exact: true })).toBeVisible();

  // Project in the open year, under the program created above.
  await createProject(page, {
    programLabel: 'PRG-2028-7701 · Flags envelope program 2028 (FY2028, SI-7701)',
    name: 'Allocation flags probe 2028',
    fullLife: '1000000000',
    submittedPrice: '950000000',
    finalDealPrice: '900000000',
  });
  await openProject(page, 'Allocation flags probe 2028');

  // The allocation is larger than the program's available budget (BR-7) and
  // larger than the project's full-life allocated budget. The save succeeds:
  // flags never block entry (BR-17).
  const allocationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await allocationForm.locator('select[name="annualProgramId"]').selectOption({
    label: `FY${FY} · PRG-2028-7701 · Flags envelope program 2028`,
  });
  await allocationForm.locator('input[name="allocationCapex"]').fill('1100000000');
  await allocationForm.locator('input[name="allocationOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(/Project year allocation FY2028 created\./)).toBeVisible();
  await expect(
    page.getByText('allocations over full-life allocated', { exact: true }),
  ).toBeVisible();

  // BR-7 on the annual plan page: the program card flags both components'
  // unallocated money and shows the negative remainder.
  await openAnnualPlan(page);
  const programCard = page
    .locator('section')
    .filter({ hasText: 'PRG-2028-7701 · Flags envelope program 2028' });
  await expect(programCard.getByText('over-allocated', { exact: true })).toBeVisible();
  await expect(programCard.getByText('-Rp 950.000.000', { exact: true })).toBeVisible();

  // Execution: a spend above the fiscal-year commitment (BR-11) and then enough
  // commitments to exceed the contract value (BR-8 in the register).
  await openProject(page, 'Allocation flags probe 2028');
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(page.getByRole('heading', { name: /FY2028 allocation/ })).toBeVisible();

  const commitmentForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await commitmentForm.locator('select[name="component"]').selectOption('capex');
  await commitmentForm.locator('input[name="amount"]').fill('50000000');
  await commitmentForm.locator('input[name="commitmentDate"]').fill('2028-02-01');
  await commitmentForm.locator('input[name="reference"]').fill('PO-2028-E2E-1');
  await page.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText(/Commitment PO-2028-E2E-1 recorded\./)).toBeVisible();

  const spendForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('60000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-03-01');
  await spendForm.locator('input[name="vendor"]').fill('PT E2E Vendor');
  await spendForm.locator('input[name="reference"]').fill('INV-2028-E2E-1');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText(/Spend entry INV-2028-E2E-1 recorded\./)).toBeVisible();
  await expect(
    page.getByText('capex spend above commitment (BR-11)', { exact: true }),
  ).toBeVisible();

  const secondCommitment = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await secondCommitment.locator('select[name="component"]').selectOption('capex');
  await secondCommitment.locator('input[name="amount"]').fill('900000000');
  await secondCommitment.locator('input[name="commitmentDate"]').fill('2028-04-01');
  await secondCommitment.locator('input[name="reference"]').fill('PO-2028-E2E-2');
  await page.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText(/Commitment PO-2028-E2E-2 recorded\./)).toBeVisible();

  // BR-8 on the project page (#101): its lifetime figure now includes in-app
  // commitments, 50.000.000 + 900.000.000 = 950.000.000 against the 900.000.000
  // contract value, so the flag appears on the surface where commitments are
  // recorded (ADR-0003 §6).
  await openProject(page, 'Allocation flags probe 2028');
  const projectLifetime = page
    .getByText('Lifetime commitments (opening + in-app)', { exact: true })
    .locator('..')
    .locator('dd');
  await expect(projectLifetime).toHaveText('Rp 950.000.000');
  await expect(page.getByText('commitments over contract (BR-8)', { exact: true })).toBeVisible();
  const projectLifetimeText = (await projectLifetime.innerText()).trim();

  // The register's flag engine counts the same in-app commitments (BR-8), plus
  // the full-life overrun, and reports the same lifetime figure: the project
  // page and the register must not disagree (#101).
  await page.goto('/reports/project-register');
  const registerRow = page.locator('tbody tr').filter({ hasText: 'Allocation flags probe 2028' });
  const registerHeaders = await page.locator('thead th').allTextContents();
  const lifetimeColumn = registerHeaders.indexOf('Lifetime commitments');
  expect(lifetimeColumn).toBeGreaterThanOrEqual(0);
  await expect(registerRow.locator('td').nth(lifetimeColumn)).toHaveText(projectLifetimeText);
  await expect(registerRow.getByText('commitments_over_contract', { exact: true })).toBeVisible();
  await expect(
    registerRow.getByText('project_allocations_over_full_life', { exact: true }),
  ).toBeVisible();
});

test('flags a deal price above the approved and submitted figures @t2', async ({ page }) => {
  // A second, deliberately healthy envelope/program: only the pricing flags fire.
  await addInitiative(page, {
    code: 'SI-7702',
    name: 'Flags pricing initiative',
    envelopeCapex: '1000000000',
    envelopeOpex: '0',
  });
  await addProgram(page, {
    code: 'PRG-2028-7702',
    name: 'Flags pricing program 2028',
    siLabel: 'SI-7702 · Flags pricing initiative',
    capexBudget: '100000000',
  });

  await createProject(page, {
    programLabel: 'PRG-2028-7702 · Flags pricing program 2028 (FY2028, SI-7702)',
    name: 'Pricing flags probe 2028',
    fullLife: '800000000',
    submittedPrice: '400000000',
    finalDealPrice: '900000000',
  });
  await openProject(page, 'Pricing flags probe 2028');

  // The ijin prinsip is saved even though it is below the final deal price, so
  // the flag cannot block the save (BR-17); the flash is the save's own proof.
  const ijinForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record ijin prinsip' }) });
  await ijinForm.locator('input[name="documentNumber"]').fill('IP-2028-E2E-9');
  await ijinForm.locator('input[name="documentDate"]').fill('2028-01-15');
  await ijinForm.locator('input[name="approvedAmount"]').fill('500000000');
  await ijinForm.locator('input[name="approver"]').fill('Board of Directors');
  await page.getByRole('button', { name: 'Record ijin prinsip' }).click();
  await expect(page.getByText(/Ijin prinsip for PRJ-2028-\d+ saved\./)).toBeVisible();
  await expect(page.getByText('recorded', { exact: true }).first()).toBeVisible();

  // BR-9 (900 > 500 approved) and BR-18 (900 > 400 submitted) on the project
  // page, which renders the human-readable labels.
  await expect(page.getByText('over approved budget (BR-9)', { exact: true })).toBeVisible();
  await expect(page.getByText('above submitted price (BR-18)', { exact: true })).toBeVisible();

  // The in-app project register summarises the same two flags.
  await page.goto('/plan/projects');
  const registerRow = page.locator('tbody tr').filter({ hasText: 'Pricing flags probe 2028' });
  await expect(registerRow.getByText('over approved', { exact: true })).toBeVisible();
  await expect(registerRow.getByText('above submitted', { exact: true })).toBeVisible();

  // The report register renders the domain flag codes.
  await page.goto('/reports/project-register');
  const reportRow = page.locator('tbody tr').filter({ hasText: 'Pricing flags probe 2028' });
  await expect(reportRow.getByText('over_approved_budget', { exact: true })).toBeVisible();
  await expect(reportRow.getByText('above_submitted_price', { exact: true })).toBeVisible();
});
