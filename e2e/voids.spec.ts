import { expect, test, type Locator, type Page } from '@playwright/test';
import { rp } from './support/money';
import { createProgramFixture } from './support/programs';

/**
 * Voids (tier T2): void and cancel with a reason for the strategic initiative,
 * the annual program, the project, the project year allocation, the commitment,
 * the spend entry and the recurring ops item — including the refusals that
 * protect records other records depend on, and the audit row each void leaves.
 *
 * Prerequisite: the foundation journey has run (FY2027 closed, FY2028 active,
 * SI-01 and PRG-2028-001 exist). Every record is created new in FY2028 inside
 * its own test with a VOID- code, so the tests do not depend on each other.
 * Amounts stay small so no SI envelope or program budget is pushed over.
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
  input: ProgramRef & { capex?: string; opex?: string },
): Promise<void> => {
  await createProgramFixture({
    fiscalYear: FY,
    siCode: 'SI-01',
    code: input.code,
    name: input.name,
    capex: Number(input.capex ?? '20000000'),
    opex: Number(input.opex ?? '0'),
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

const buildAllocation = async (
  page: Page,
  fixture: { program: ProgramRef; project: ProjectRef },
  amounts: { capex: string; opex: string },
): Promise<void> => {
  await openAnnualPlan(page);
  await createProgram(page, fixture.program);
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

/** The dd that follows one dt, inside one already-scoped section. */
const valueIn = (section: Locator, dtLabel: string) =>
  section.locator('dl > div').filter({ hasText: dtLabel }).locator('dd');

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

const recordSpend = async (
  page: Page,
  input: { amount: string; reference: string; settle?: string },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await form.locator('select[name="component"]').selectOption('capex');
  await form.locator('input[name="amount"]').fill(input.amount);
  await form.locator('input[name="spentOn"]').fill('2028-07-01');
  await form.locator('input[name="reference"]').fill(input.reference);
  if (input.settle !== undefined) {
    await form.locator('input[name^="settle_"]').first().fill(input.settle);
  }
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(page.getByText(`Spend entry ${input.reference} recorded.`)).toBeVisible();
};

test('voids a strategic initiative and refuses one that has programs @t2', async ({ page }) => {
  await page.goto('/plan/strategic');
  const createForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add initiative' }) });
  await createForm.locator('input[name="code"]').fill('VOID-SI-1');
  await createForm.locator('input[name="name"]').fill('Void initiative');
  await createForm.locator('input[name="owner"]').fill('Head of Tests');
  await createForm.locator('input[name="envelopeCapex"]').fill('100000000');
  await createForm.locator('input[name="envelopeOpex"]').fill('0');
  await createForm.locator('input[name="priorCapex"]').fill('0');
  await createForm.locator('input[name="priorOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText('Strategic initiative VOID-SI-1 created.')).toBeVisible();

  const card = page.locator('section').filter({ hasText: 'VOID-SI-1 · Void initiative' });
  await card.getByRole('button', { name: 'Void initiative' }).click();
  const dialog = card.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Void this initiative?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('Created only to be voided.');
  await dialog.getByRole('button', { name: 'Void initiative' }).click();
  await expect(page.getByText('Strategic initiative VOID-SI-1 voided.')).toBeVisible();
  await expect(page.getByText('VOID-SI-1 · Void initiative')).toHaveCount(0);

  // the void is audited with its reason
  await page.goto('/admin/audit?entityType=strategic_initiative');
  const auditRow = page.locator('tbody tr').filter({ hasText: 'Created only to be voided.' }).first();
  await expect(auditRow).toBeVisible();
  await expect(auditRow.getByRole('cell', { name: 'void', exact: true })).toBeVisible();

  // SI-01 carries programs, so it cannot be voided (the renewal guard)
  await page.goto('/plan/strategic');
  const siCard = page.locator('section').filter({ hasText: 'SI-01 · Digital Workplace' });
  await siCard.getByRole('button', { name: 'Void initiative' }).click();
  const refused = siCard.getByRole('dialog');
  await refused.locator('textarea[name="reason"]').fill('Should be refused.');
  await refused.getByRole('button', { name: 'Void initiative' }).click();
  await expect(
    refused.getByText('This initiative has annual programs. Void its programs first.'),
  ).toBeVisible();
  await refused.getByRole('button', { name: 'Cancel' }).click();
  await expect(refused).toBeHidden();
  await expect(page.getByText('SI-01 · Digital Workplace')).toBeVisible();
});

test('voids a program with no projects and refuses one with projects @t2', async ({ page }) => {
  await openAnnualPlan(page);
  await createProgram(page, { code: 'VOID-PRG-1', name: 'Void program' });

  const card = page.locator('section').filter({ hasText: 'VOID-PRG-1 · Void program' });
  await card.getByRole('button', { name: 'Void program' }).click();
  const dialog = card.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Void this program?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('Empty program, voided.');
  await dialog.getByRole('button', { name: 'Void program' }).click();
  await expect(page.getByText('Annual program VOID-PRG-1 voided.')).toBeVisible();
  await expect(page.getByText('VOID-PRG-1 · Void program')).toHaveCount(0);

  // a program that has projects is protected
  const guardedProgram = { code: 'VOID-PRG-2', name: 'Void program with projects' };
  await createProgram(page, guardedProgram);
  await createProject(page, guardedProgram, { code: 'VOID-PRJ-2', name: 'Void program project' });
  await openAnnualPlan(page);

  const guardedCard = page.locator('section').filter({
    hasText: 'VOID-PRG-2 · Void program with projects',
  });
  await guardedCard.getByRole('button', { name: 'Void program' }).click();
  const refused = guardedCard.getByRole('dialog');
  await refused.locator('textarea[name="reason"]').fill('Should be refused.');
  await refused.getByRole('button', { name: 'Void program' }).click();
  await expect(refused.getByText('This program has projects and cannot be voided.')).toBeVisible();
  await refused.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('VOID-PRG-2 · Void program with projects')).toBeVisible();
});

test('cancels a project with a reason and audits it @t2', async ({ page }) => {
  const program = { code: 'VOID-PRG-3', name: 'Void cancel program' };
  const project = { code: 'VOID-PRJ-3', name: 'Void cancelled project' };
  await openAnnualPlan(page);
  await createProgram(page, program);
  await createProject(page, program, project);
  await openProject(page, project);

  await page.getByRole('button', { name: 'Cancel project' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Cancel this project?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('Cancelled by the void test.');
  await dialog.getByRole('button', { name: 'Cancel project' }).click();
  await expect(page.getByText('Project VOID-PRJ-3 cancelled.')).toBeVisible();

  // cancelled and read-only: the reason is shown and every write form is gone
  await expect(page.getByText('Cancelled: Cancelled by the void test.')).toBeVisible();
  await expect(page.getByText('cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel project' })).toHaveCount(0);
  await expect(page.getByText('Edit project')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add allocation' })).toHaveCount(0);

  // the register flags the cancelled project
  await page.goto('/plan/projects');
  await expect(
    page.locator('tbody tr', { hasText: 'VOID-PRJ-3' }).getByText('cancelled', { exact: true }),
  ).toBeVisible();

  // the cancellation is audited as a void with its reason
  await page.goto('/admin/audit?entityType=project');
  const auditRow = page.locator('tbody tr').filter({ hasText: 'Cancelled by the void test.' }).first();
  await expect(auditRow).toBeVisible();
  await expect(auditRow.getByRole('cell', { name: 'void', exact: true })).toBeVisible();
});

test('voids an allocation and re-creates the same fiscal year (restore path) @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'VOID-PRG-4', name: 'Void allocation program' },
    project: { code: 'VOID-PRJ-4', name: 'Void allocation project' },
  };
  await buildAllocation(page, fixture, { capex: '10000000', opex: '0' });

  // before the void the program counts the allocation
  await openAnnualPlan(page);
  const programCard = page.locator('section').filter({
    hasText: 'VOID-PRG-4 · Void allocation program',
  });
  await expect(valueIn(programCard, 'Capex allocated')).toHaveText(rp(10000000));
  await expect(valueIn(programCard, 'Capex unallocated')).toHaveText(rp(10000000));

  await openProject(page, fixture.project);
  const allocationTitle = `FY${FY} · VOID-PRG-4 · Void allocation program`;
  // the "Add annual allocation" select carries the same label as an <option>, so
  // the card is located by its heading instead of by text
  const allocationCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: allocationTitle }) });
  await allocationCard.getByRole('button', { name: 'Void allocation' }).click();
  const dialog = allocationCard.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Void this project year allocation?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('Voided to test the restore path.');
  await dialog.getByRole('button', { name: 'Void allocation' }).click();
  await expect(page.getByText(`Project year allocation FY${FY} voided.`)).toBeVisible();

  // the voided allocation leaves the project and the money is released
  await expect(page.getByRole('heading', { name: allocationTitle })).toHaveCount(0);
  const pricing = page.locator('section').filter({ hasText: 'Full-life figures and pricing chain' });
  await expect(valueIn(pricing, 'Total annual allocations')).toHaveText(rp(0));

  // the allocation is refunded to the program budget
  await openAnnualPlan(page);
  await expect(valueIn(programCard, 'Capex allocated')).toHaveText(rp(0));
  await expect(valueIn(programCard, 'Capex unallocated')).toHaveText(rp(20000000));

  // the same fiscal year can be allocated again (createAllocation restores the row)
  await openProject(page, fixture.project);
  await addAllocation(page, fixture.program, { capex: '10000000', opex: '0' });
  await expect(page.getByRole('heading', { name: allocationTitle })).toBeVisible();
  await expect(valueIn(pricing, 'Total annual allocations')).toHaveText(rp(10000000));

  await page.goto('/admin/audit?entityType=project_year_allocation');
  // the re-creation is an audited `restore` of the voided row, not a `create`
  await expect(
    page
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: 'restore', exact: true }) })
      .first(),
  ).toBeVisible();
});

test('refuses to void a commitment with settlements and voids an unsettled one @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'VOID-PRG-6', name: 'Void commitment program' },
    project: { code: 'VOID-PRJ-6', name: 'Void commitment project' },
  };
  await buildAllocation(page, fixture, { capex: '20000000', opex: '0' });
  await openAllocation(page, fixture.program);

  await recordCommitment(page, { amount: '10000000', date: '2028-03-01', reference: 'VOID-PO-1' });
  await recordSpend(page, { amount: '4000000', reference: 'VOID-SP-1', settle: '4000000' });

  const settledRow = page.locator('tbody tr', { hasText: 'VOID-PO-1' });
  await expect(settledRow.getByText('partially settled')).toBeVisible();
  await settledRow.locator('summary', { hasText: 'Manage' }).click();
  await settledRow.getByRole('button', { name: 'Void commitment' }).click();
  const refused = settledRow.getByRole('dialog');
  await refused.locator('textarea[name="reason"]').fill('Should be refused.');
  await refused.getByRole('button', { name: 'Void commitment' }).click();
  await expect(
    refused.getByText('This commitment has settlements. Void the settling spend entries first.'),
  ).toBeVisible();
  await refused.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('VOID-PO-1', { exact: true })).toBeVisible();

  // a commitment without settlements can be voided
  await recordCommitment(page, { amount: '5000000', date: '2028-03-02', reference: 'VOID-PO-2' });
  const openRow = page.locator('tbody tr', { hasText: 'VOID-PO-2' });
  await openRow.locator('summary', { hasText: 'Manage' }).click();
  await openRow.getByRole('button', { name: 'Void commitment' }).click();
  const dialog = openRow.getByRole('dialog');
  await dialog.locator('textarea[name="reason"]').fill('Not needed after all.');
  await dialog.getByRole('button', { name: 'Void commitment' }).click();
  await expect(page.getByText('Commitment VOID-PO-2 voided.')).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'VOID-PO-2' })).toHaveCount(0);
  // only the settled commitment still counts
  await expect(
    cardValue(page, 'Allocation and execution', 'Capex commitments (open)'),
  ).toHaveText(`${rp(10000000)} (open ${rp(6000000)})`);
});

test('voids a spend and releases the commitment it settled @t2', async ({ page }) => {
  const fixture = {
    program: { code: 'VOID-PRG-7', name: 'Void spend program' },
    project: { code: 'VOID-PRJ-7', name: 'Void spend project' },
  };
  await buildAllocation(page, fixture, { capex: '20000000', opex: '0' });
  await openAllocation(page, fixture.program);

  await recordCommitment(page, { amount: '10000000', date: '2028-03-01', reference: 'VOID-PO-3' });
  await recordSpend(page, { amount: '4000000', reference: 'VOID-SP-1', settle: '4000000' });
  await expect(
    cardValue(page, 'Allocation and execution', 'Capex commitments (open)'),
  ).toHaveText(`${rp(10000000)} (open ${rp(6000000)})`);

  // Voiding a spend is allowed even when it settled a commitment: the server
  // releases the settlement and reopens the commitment (execution-actions.ts
  // voidSpend; docs/USER-GUIDE.md §4.2 "Voiding a spend ... releases its
  // settlements"). There is no settlement guard on this path to assert.
  const spendRow = page.locator('tbody tr', { hasText: 'VOID-SP-1' });
  await spendRow.locator('summary', { hasText: 'Manage' }).click();
  await spendRow.getByRole('button', { name: 'Void spend' }).click();
  const dialog = spendRow.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Void this spend entry?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('Voided by the spend test.');
  await dialog.getByRole('button', { name: 'Void spend' }).click();
  await expect(page.getByText('Spend entry VOID-SP-1 voided.')).toBeVisible();

  // the spend is gone, the commitment is open again and the current-year spend drops
  await expect(page.locator('tbody tr', { hasText: 'VOID-SP-1' })).toHaveCount(0);
  await expect(
    page.locator('tbody tr', { hasText: 'VOID-PO-3' }).getByText('open', { exact: true }),
  ).toBeVisible();
  await expect(
    cardValue(page, 'Allocation and execution', 'Capex commitments (open)'),
  ).toHaveText(`${rp(10000000)} (open ${rp(10000000)})`);
  await expect(cardValue(page, 'Allocation and execution', 'Capex spend this year')).toHaveText(
    rp(0),
  );
});

test('voids a recurring ops item with a reason and audits it @t2', async ({ page }) => {
  await openAnnualPlan(page);
  const createForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add recurring ops item' }) });
  await createForm.locator('input[name="name"]').fill('Void recurring item');
  await createForm.locator('select[name="categoryId"]').selectOption({ label: 'Connectivity' });
  await createForm.locator('input[name="opexBudget"]').fill('24000000');
  await page.getByRole('button', { name: 'Add recurring ops item' }).click();
  await expect(page.getByText('Recurring ops item “Void recurring item” created.')).toBeVisible();

  const card = page.locator('section').filter({ hasText: 'Void recurring item' });
  await card.getByRole('button', { name: 'Void item' }).click();
  const dialog = card.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Void this recurring ops item?' })).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill('No longer leased.');
  await dialog.getByRole('button', { name: 'Void item' }).click();
  await expect(page.getByText('Recurring ops item “Void recurring item” voided.')).toBeVisible();
  // a voided item leaves the annual plan (the page lists live items only)
  await expect(page.locator('section').filter({ hasText: 'Void recurring item' })).toHaveCount(0);

  await page.goto('/admin/audit?entityType=recurring_ops_item');
  const auditRow = page.locator('tbody tr').filter({ hasText: 'No longer leased.' }).first();
  await expect(auditRow).toBeVisible();
  await expect(auditRow.getByRole('cell', { name: 'void', exact: true })).toBeVisible();
});
