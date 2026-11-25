import { expect, test, type Page } from '@playwright/test';
import { rp } from './support/money';
import { createProgramFixture } from './support/programs';

/**
 * Edits (tier T2): the audited update paths for an annual program, a recurring
 * ops item, a project year allocation, a commitment entry and a spend entry —
 * including the guards that freeze a settled spend: its component and its
 * settlement classification.
 *
 * Prerequisite: the foundation journey has run (FY2027 closed, FY2028 active,
 * SI-01 and PRG-2028-001 exist). Every record here is created new in FY2028
 * with an EDITS- code inside its own test, so the cases do not depend on each
 * other or on rows created by another spec. Amounts stay in the low millions so
 * the extra data never pushes an SI envelope or a program budget over.
 */

const FY = 2028;

interface ProgramRef {
  code: string;
  name: string;
}

interface ProjectRef {
  code: string;
  name: string;
}

const openAnnualPlan = async (page: Page): Promise<void> => {
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: `FY${FY}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${FY} annual plan` })).toBeVisible();
};

const createProgram = async (
  page: Page,
  input: ProgramRef & { capex: string; opex: string },
): Promise<void> => {
  await createProgramFixture({
    fiscalYear: FY,
    siCode: 'SI-01',
    code: input.code,
    name: input.name,
    capex: Number(input.capex),
    opex: Number(input.opex),
  });
  await page.reload();
  await expect(page.getByText(`${input.code} · ${input.name}`).first()).toBeVisible();
};

const createProject = async (page: Page, program: ProgramRef, project: ProjectRef): Promise<void> => {
  await page.goto('/plan/projects');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await form
    .locator('select[name="originatingProgramId"]')
    .selectOption({ label: `${program.code} · ${program.name} (FY${FY}, SI-01)` });
  await form.locator('input[name="code"]').fill(project.code);
  await form.locator('input[name="name"]').fill(project.name);
  await form.locator('input[name="startFiscalYear"]').fill(String(FY));
  await form.locator('input[name="endFiscalYear"]').fill(String(FY));
  await form.locator('input[name="allocatedBudgetFullLife"]').fill('50000000');
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(`Project ${project.code} created.`)).toBeVisible();
};

const openProject = async (page: Page, project: ProjectRef): Promise<void> => {
  await page.goto('/plan/projects');
  await page.locator('tbody tr', { hasText: project.name }).getByRole('link', { name: 'Open' }).click();
  await expect(
    page.getByRole('heading', { name: `${project.code} · ${project.name}` }),
  ).toBeVisible();
};

const addAllocation = async (
  page: Page,
  program: ProgramRef,
  amounts: { capex: string; opex: string },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await form
    .locator('select[name="annualProgramId"]')
    .selectOption({ label: `FY${FY} · ${program.code} · ${program.name}` });
  await form.locator('input[name="allocationCapex"]').fill(amounts.capex);
  await form.locator('input[name="allocationOpex"]').fill(amounts.opex);
  await form.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(`Project year allocation FY${FY} created.`)).toBeVisible();
};

const openAllocation = async (page: Page, program: ProgramRef): Promise<void> => {
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(
    page.getByRole('heading', { name: `FY${FY} allocation · ${program.code}` }),
  ).toBeVisible();
};

/** Builds a project in an FY2028 program with one FY2028 allocation. */
const buildAllocation = async (
  page: Page,
  fixture: { program: ProgramRef; project: ProjectRef },
  amounts: { capex: string; opex: string },
): Promise<void> => {
  await openAnnualPlan(page);
  await createProgram(page, { ...fixture.program, capex: '20000000', opex: '5000000' });
  await createProject(page, fixture.program, fixture.project);
  await openProject(page, fixture.project);
  await addAllocation(page, fixture.program, amounts);
};

/** The dd that follows one dt, inside the card whose title contains `cardTitle`. */
const cardValue = (page: Page, cardTitle: string, dtLabel: string) =>
  page
    .locator('section')
    .filter({ hasText: cardTitle })
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: dtLabel }) })
    .locator('dd');

const recordCommitment = async (
  page: Page,
  input: { amount: string; date: string; reference: string },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await form.locator('select[name="component"]').selectOption('capex');
  await form.locator('input[name="amount"]').fill(input.amount);
  await form.locator('input[name="commitmentDate"]').fill(input.date);
  await form.locator('input[name="reference"]').fill(input.reference);
  await form.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText(`Commitment ${input.reference} recorded.`)).toBeVisible();
};

test('edits a program in the open fiscal year @t2', async ({ page }) => {
  await openAnnualPlan(page);
  await createProgram(page, {
    code: 'EDITS-PRG-1',
    name: 'Edits program',
    capex: '20000000',
    opex: '5000000',
  });

  const card = page.locator('section').filter({ hasText: 'EDITS-PRG-1 · Edits program' });
  await expect(card).toBeVisible();
  await expect(cardValue(page, 'EDITS-PRG-1 · Edits program', 'Capex allocated')).toHaveText(rp(0));

  await card.locator('summary', { hasText: 'Edit program' }).click();
  const form = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  // Activation freezes the budget inputs; a budget change is a revision now.
  await expect(
    form.locator('input[name="capexBudget"]:not([type="hidden"])'),
  ).toHaveCount(0);
  await expect(card.getByText(/Budgets are frozen while the plan is active/)).toBeVisible();
  await form.locator('input[name="name"]').fill('Edits program (revised)');
  await form.locator('textarea[name="reason"]').fill('Name corrected by the edit test.');
  await form.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Annual program EDITS-PRG-1 updated.')).toBeVisible();
  // the new name is the card title; the budget is unchanged because it is frozen
  await expect(
    page.getByRole('heading', { name: 'EDITS-PRG-1 · Edits program (revised)' }),
  ).toBeVisible();
  await expect(
    cardValue(
      page,
      'EDITS-PRG-1 · Edits program (revised)',
      'Capex available (effective budget + carry-in)',
    ),
  ).toHaveText(rp(20000000));
});

test('edits a recurring ops item in the open fiscal year @t2', async ({ page }) => {
  await openAnnualPlan(page);
  const createForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add recurring ops item' }) });
  await createForm.locator('input[name="name"]').fill('Edits leased line');
  await createForm.locator('select[name="categoryId"]').selectOption({ label: 'Connectivity' });
  await createForm.locator('input[name="opexBudget"]').fill('24000000');
  await page.getByRole('button', { name: 'Add recurring ops item' }).click();
  await expect(page.getByText('Recurring ops item “Edits leased line” created.')).toBeVisible();

  const card = page.locator('section').filter({ hasText: 'Edits leased line' });
  await card.locator('summary', { hasText: 'Edit item' }).click();
  const form = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await form.locator('input[name="name"]').fill('Edits leased line (revised)');
  await form.locator('input[name="opexBudget"]').fill('30000000');
  await form.locator('input[name="owner"]').fill('Connectivity Lead');
  await form.locator('textarea[name="reason"]').fill('Revised by the edit test.');
  await form.getByRole('button', { name: 'Save changes' }).click();

  await expect(
    page.getByText('Recurring ops item “Edits leased line (revised)” updated.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edits leased line (revised)' })).toBeVisible();
  // Available = opex budget + carry-in (0 here)
  await expect(cardValue(page, 'Edits leased line (revised)', 'Available')).toHaveText(rp(30000000));
  await expect(page.getByText('Owner: Connectivity Lead')).toBeVisible();
});

test('updates a year allocation and reflects it on the project and execution summary @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'EDITS-PRG-2', name: 'Edits allocation program' },
    project: { code: 'EDITS-PRJ-2', name: 'Edits allocation project' },
  };
  await buildAllocation(page, fixture, { capex: '10000000', opex: '2000000' });

  const allocationCard = `FY${FY} · ${fixture.program.code} · ${fixture.program.name}`;
  await expect(cardValue(page, allocationCard, 'Capex allocation')).toHaveText(rp(10000000));
  await expect(cardValue(page, allocationCard, 'Capex remaining')).toHaveText(rp(10000000));

  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: allocationCard }) });
  await card.locator('summary', { hasText: 'Edit allocation' }).click();
  const form = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await form.locator('input[name="allocationCapex"]').fill('15000000');
  await form.locator('input[name="allocationOpex"]').fill('2500000');
  await form.locator('textarea[name="notes"]').fill('Raised by the edit test.');
  await form.locator('textarea[name="reason"]').fill('Raised by the edit test.');
  await form.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText(`Project year allocation FY${FY} updated.`)).toBeVisible();
  await expect(cardValue(page, allocationCard, 'Capex allocation')).toHaveText(rp(15000000));
  await expect(cardValue(page, allocationCard, 'Capex remaining')).toHaveText(rp(15000000));
  await expect(cardValue(page, allocationCard, 'Opex allocation')).toHaveText(rp(2500000));

  // the allocation execution page reads the same figures
  await openAllocation(page, fixture.program);
  await expect(
    cardValue(page, 'Allocation and execution', 'Capex allocation + carry-in'),
  ).toHaveText(rp(15000000));
  await expect(cardValue(page, 'Allocation and execution', 'Capex remaining')).toHaveText(
    rp(15000000),
  );
  await expect(
    cardValue(page, 'Allocation and execution', 'Opex allocation + carry-in'),
  ).toHaveText(rp(2500000));
});

test('refuses a commitment edit below the settled amount, then allows raising it @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'EDITS-PRG-3', name: 'Edits commitment program' },
    project: { code: 'EDITS-PRJ-3', name: 'Edits commitment project' },
  };
  await buildAllocation(page, fixture, { capex: '20000000', opex: '0' });
  await openAllocation(page, fixture.program);

  await recordCommitment(page, { amount: '10000000', date: '2028-03-01', reference: 'EDITS-PO-1' });
  const commitmentRow = page.locator('tbody tr', { hasText: 'EDITS-PO-1' });
  await expect(commitmentRow.getByText('open', { exact: true })).toBeVisible();
  await expect(commitmentRow.getByText(rp(0))).toBeVisible();

  // settle 6,000,000 of the commitment with a spend entry
  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('6000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-04-01');
  await spendForm.locator('input[name="reference"]').fill('EDITS-SP-1');
  await spendForm.locator('input[name^="settle_"]').first().fill('6000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText('Spend entry EDITS-SP-1 recorded.')).toBeVisible();

  await expect(commitmentRow.getByText('partially settled')).toBeVisible();
  await expect(commitmentRow.getByText(rp(4000000))).toBeVisible();

  // reducing the commitment below what is already settled is refused
  await commitmentRow.locator('summary', { hasText: 'Manage' }).click();
  const editForm = commitmentRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save commitment' }) });
  await editForm.locator('input[name="amount"]').fill('5000000');
  await editForm.locator('textarea[name="reason"]').fill('Try to reduce below the settlement.');
  await editForm.getByRole('button', { name: 'Save commitment' }).click();
  await expect(
    commitmentRow.getByText(
      `The commitment cannot be reduced below the already settled amount (${rp(6000000)}).`,
    ),
  ).toBeVisible();
  await expect(commitmentRow.getByText(rp(10000000))).toBeVisible();

  // raising it is allowed and the open amount follows
  await editForm.locator('input[name="amount"]').fill('12000000');
  await editForm.locator('textarea[name="reason"]').fill('Raised after the refusal.');
  await editForm.getByRole('button', { name: 'Save commitment' }).click();
  await expect(page.getByText('Commitment EDITS-PO-1 updated.')).toBeVisible();
  await expect(
    cardValue(page, 'Allocation and execution', 'Capex commitments (open)'),
  ).toHaveText(`${rp(12000000)} (open ${rp(6000000)})`);
  await expect(
    page.locator('tbody tr', { hasText: 'EDITS-PO-1' }).getByText('partially settled'),
  ).toBeVisible();
});

test('changes an unsettled spend component, then freezes it and the classification @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'EDITS-PRG-4', name: 'Edits spend program' },
    project: { code: 'EDITS-PRJ-4', name: 'Edits spend project' },
  };
  await buildAllocation(page, fixture, { capex: '20000000', opex: '0' });
  await openAllocation(page, fixture.program);

  await recordCommitment(page, { amount: '4000000', date: '2028-05-01', reference: 'EDITS-PO-2' });
  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });

  // a spend that settles the whole commitment
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('4000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-06-01');
  await spendForm.locator('input[name="vendor"]').fill('PT Edits Vendor');
  await spendForm.locator('input[name="reference"]').fill('EDITS-SP-2');
  await spendForm.locator('input[name^="settle_"]').first().fill('4000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText('Spend entry EDITS-SP-2 recorded.')).toBeVisible();
  await expect(
    page.locator('tbody tr', { hasText: 'EDITS-PO-2' }).getByText('settled', { exact: true }),
  ).toBeVisible();

  // a second spend with no settlement: its component is still editable
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('1000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-06-02');
  await spendForm.locator('input[name="vendor"]').fill('PT Edits Vendor');
  await spendForm.locator('input[name="reference"]').fill('EDITS-SP-3');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText('Spend entry EDITS-SP-3 recorded.')).toBeVisible();

  // #100: the component of an unsettled spend is persisted and shown
  const unsettledRow = page.locator('tbody tr', { hasText: 'EDITS-SP-3' });
  await unsettledRow.locator('summary', { hasText: 'Manage' }).click();
  const unsettledEditForm = unsettledRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save spend' }) });
  await unsettledEditForm.locator('select[name="component"]').selectOption('opex');
  await unsettledEditForm.locator('textarea[name="reason"]').fill('Switch the spend to opex.');
  await unsettledEditForm.getByRole('button', { name: 'Save spend' }).click();
  await expect(page.getByText('Spend entry EDITS-SP-3 updated.')).toBeVisible();
  await expect(
    page.locator('tbody tr', { hasText: 'EDITS-SP-3' }).getByText('opex', { exact: true }),
  ).toBeVisible();

  // once a spend has settlements the component is frozen and the form says why
  const settledRow = page.locator('tbody tr', { hasText: 'EDITS-SP-2' });
  await settledRow.locator('summary', { hasText: 'Manage' }).click();
  const settledEditForm = settledRow
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save spend' }) });
  await expect(settledEditForm.locator('select[name="component"]')).toHaveCount(0);
  await expect(settledEditForm.locator('input[name="component"]')).toHaveValue('capex');
  await expect(
    settledRow.getByText(
      'Component is fixed once the spend has settlements; void and re-enter to change it.',
    ),
  ).toBeVisible();

  // a direct update that tries to change the frozen component is refused, not ignored
  await settledEditForm.locator('input[name="component"]').evaluate((input) => {
    (input as HTMLInputElement).value = 'opex';
  });
  await settledEditForm.locator('textarea[name="reason"]').fill('Try to move a settled spend to opex.');
  await settledEditForm.getByRole('button', { name: 'Save spend' }).click();
  await expect(
    settledRow.getByText('Void the spend entry and re-enter it to change its component.'),
  ).toBeVisible();
  await expect(settledEditForm.locator('input[name="component"]')).toHaveValue('capex');

  // the settlement classification is frozen once the entry settled something
  await settledEditForm.locator('select[name="settlementKind"]').selectOption('prior_year_opening');
  await settledEditForm.locator('textarea[name="reason"]').fill('Try to reclassify a settled spend.');
  await settledEditForm.getByRole('button', { name: 'Save spend' }).click();
  await expect(
    settledRow.getByText(
      'Void the spend entry and re-enter it to change its settlement classification.',
    ),
  ).toBeVisible();

  // the vendor and the description are still editable
  await settledEditForm.locator('select[name="settlementKind"]').selectOption('current');
  await settledEditForm.locator('input[name="vendor"]').fill('PT Edits Vendor (revised)');
  await settledEditForm.locator('textarea[name="description"]').fill('Revised by the edit test.');
  await settledEditForm.locator('textarea[name="reason"]').fill('Corrected the vendor.');
  await settledEditForm.getByRole('button', { name: 'Save spend' }).click();
  await expect(page.getByText('Spend entry EDITS-SP-2 updated.')).toBeVisible();
  await expect(
    page.locator('tbody tr', { hasText: 'EDITS-SP-2' }).getByText('PT Edits Vendor (revised)'),
  ).toBeVisible();

  // the audit entry for the unsettled edit records the component change
  await page.goto('/admin/audit?entityType=spend_entry');
  const auditRow = page
    .locator('tbody tr')
    .filter({ hasText: 'Switch the spend to opex.' })
    .first();
  await auditRow.getByText('Show values').click();
  await expect(auditRow.locator('pre').nth(1)).toContainText('"component": "opex"');
});
