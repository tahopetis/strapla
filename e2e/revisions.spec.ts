import { expect, test, type Page } from '@playwright/test';
import { rp } from './support/money';

/**
 * Budget revisions (tier T2, #112 / ADR-0006 §4).
 *
 * The spec owns its fiscal year: it creates and activates FY2030, so it never
 * depends on the year the close spec leaves active and never closes a year
 * another spec needs. It covers the acceptance path end to end:
 *
 * 1. posting a revision on an active year, with the formal decision missing, so
 *    the register shows *awaiting decision reference* and recording the decision
 *    attaches it;
 * 2. the activation freeze: budgets are not editable, a program created during
 *    the active year starts at zero and is funded by the revision;
 * 3. refusals: an unbalanced switch, and a switch above the donor program's
 *    unallocated budget.
 *
 * The de-allocation floor (an allocation below open commitments plus spend) and
 * the cross-component shift rule need a project, an allocation and a commitment
 * to set up; they are covered by the domain and action unit tests instead.
 */

const REVISION_YEAR = 2030;
const FLOOR_PROJECT = { code: 'REV-2030-PRJ', name: 'Revision floor project' };
const PROGRAMS = {
  donor: { code: 'PRG-2030-01', name: 'Network renewal' },
  receiver: { code: 'PRG-2030-02', name: 'Device refresh' },
};
const SI_LABEL = 'SI-01 · Digital Workplace';

const openAnnualPlan = async (page: Page, year: number): Promise<void> => {
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: `FY${year}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
};

const activateAnnualPlan = async (page: Page, year: number): Promise<void> => {
  const headerActions = page.getByRole('group', { name: 'Page header actions' });
  await expect(headerActions.getByText('draft', { exact: true })).toBeVisible();
  const activation = headerActions.locator('form');
  await activation.locator('textarea[name="reason"]').fill(`FY${year} budget approved.`);
  await activation.getByRole('button', { name: 'Activate annual plan' }).click();
  await expect(page.getByText(`Annual plan FY${year} activated.`)).toBeVisible();
  await expect(headerActions.getByText('active', { exact: true })).toBeVisible();
};

const createProgram = async (
  page: Page,
  program: { code: string; name: string },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await form.locator('input[name="code"]').fill(program.code);
  await form.locator('input[name="name"]').fill(program.name);
  await form.locator('select[name="siId"]').selectOption({ label: SI_LABEL });
  await form.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText(`Annual program ${program.code} created.`)).toBeVisible();
};

const openRevisionRegister = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Open the revision register' }).click();
  await expect(
    page.getByRole('heading', { name: `FY${REVISION_YEAR} budget revisions` }),
  ).toBeVisible();
};

/** The create form's line grid is one signed cell per program and component. */
const deltaField = (page: Page, program: { code: string; name: string }, component: 'capex' | 'opex') =>
  page.getByLabel(`${program.code} · ${program.name} ${component} delta`);

const postRevision = async (
  page: Page,
  input: {
    reason: string;
    decisionReference?: string;
    lines: Array<{ program: { code: string; name: string }; capex?: string; opex?: string }>;
  },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Post revision' }) });
  await form.locator('textarea[name="reason"]').fill(input.reason);
  await form.locator('input[name="decisionReference"]').fill(input.decisionReference ?? '');
  for (const line of input.lines) {
    if (line.capex !== undefined) await deltaField(page, line.program, 'capex').fill(line.capex);
    if (line.opex !== undefined) await deltaField(page, line.program, 'opex').fill(line.opex);
  }
  await form.getByRole('button', { name: 'Post revision' }).click();
};

/**
 * A 20M FY2030 allocation under the donor program, so the switch floor can be
 * separated from the negative-budget guard: after the 40M switch the donor
 * still has budget but no longer enough unallocated to cover a 50M switch.
 */
const createFloorAllocation = async (page: Page): Promise<void> => {
  await page.goto('/plan/projects');
  const projectForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await projectForm
    .locator('select[name="originatingProgramId"]')
    .selectOption({
      label: `${PROGRAMS.donor.code} · ${PROGRAMS.donor.name} (FY${REVISION_YEAR}, SI-01)`,
    });
  await projectForm.locator('input[name="code"]').fill(FLOOR_PROJECT.code);
  await projectForm.locator('input[name="name"]').fill(FLOOR_PROJECT.name);
  await projectForm.locator('input[name="startFiscalYear"]').fill(String(REVISION_YEAR));
  await projectForm.locator('input[name="endFiscalYear"]').fill(String(REVISION_YEAR));
  await projectForm.locator('input[name="allocatedBudgetFullLife"]').fill('20000000');
  await projectForm.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(`Project ${FLOOR_PROJECT.code} created.`)).toBeVisible();

  await page
    .locator('tbody tr', { hasText: FLOOR_PROJECT.name })
    .getByRole('link', { name: 'Open' })
    .click();
  const allocationForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await allocationForm
    .locator('select[name="annualProgramId"]')
    .selectOption({
      label: `FY${REVISION_YEAR} · ${PROGRAMS.donor.code} · ${PROGRAMS.donor.name}`,
    });
  await allocationForm.locator('input[name="allocationCapex"]').fill('20000000');
  await allocationForm.locator('input[name="allocationOpex"]').fill('0');
  await allocationForm.getByRole('button', { name: 'Add allocation' }).click();
  await expect(
    page.getByText(`Project year allocation FY${REVISION_YEAR} created.`),
  ).toBeVisible();
};

test('posts a revision with the decision awaited, then records it, and freezes the budget form @t2', async ({
  page,
}) => {
  // ------------------------------------------------- a revision-enabled year
  await page.goto('/plan/annual');
  const createForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
  await createForm.locator('select[name="fiscalYear"]').selectOption(String(REVISION_YEAR));
  await createForm.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText(`Annual plan FY${REVISION_YEAR} created.`)).toBeVisible();

  await openAnnualPlan(page, REVISION_YEAR);
  await activateAnnualPlan(page, REVISION_YEAR);

  // A program created while the year is active starts at zero: the budget
  // fields are gone and the form says how it is funded.
  await expect(
    page.getByText(/A program created while the plan is active starts with a zero budget/),
  ).toBeVisible();
  await expect(
    page.locator('form').filter({ has: page.getByRole('button', { name: 'Add program' }) }),
  ).not.toContainText('Capex budget');
  await createProgram(page, PROGRAMS.donor);
  await createProgram(page, PROGRAMS.receiver);

  // ---------------------------------------------------- post the revision
  await openRevisionRegister(page);
  await expect(page.getByText(`No budget revisions posted for FY${REVISION_YEAR} yet.`)).toBeVisible();

  await postRevision(page, {
    reason: 'Annual efficiency cut reversed for network renewal',
    lines: [{ program: PROGRAMS.donor, capex: '100000000' }],
  });
  await expect(page.getByText('Budget revision REV-2030-001 posted.')).toBeVisible();

  // The register names the number, the reason and the missing decision.
  await expect(page.locator('li').filter({ hasText: 'REV-2030-001' })).toHaveCount(1);
  await expect(page.getByText('awaiting decision reference')).toBeVisible();
  await expect(page.getByText(rp(100_000_000)).first()).toBeVisible();

  // Each line links to its program (#115): the register is navigable.
  const revisionCard = page.locator('li').filter({ hasText: 'REV-2030-001' });
  await expect(revisionCard.getByRole('columnheader', { name: 'Line', exact: true })).toBeVisible();
  await expect(revisionCard.getByRole('cell', { name: 'capex', exact: true })).toBeVisible();
  const lineLink = revisionCard.getByRole('link', { name: /PRG-2030-01 · Network renewal/ });
  await expect(lineLink).toBeVisible();
  await expect(lineLink).toHaveAttribute('href', /^\/plan\/programs\/[0-9a-f-]+$/);

  // ------------------------------------- the freeze and the effective budget
  await openAnnualPlan(page, REVISION_YEAR);
  // The plan header carries the revision count and the awaiting-decision state.
  const planHeader = page.getByRole('group', { name: 'Page header actions' });
  await expect(planHeader.getByText('1 revision', { exact: true })).toBeVisible();
  await expect(planHeader.getByText('1 awaiting decision', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the revision register' })).toBeVisible();
  const donorCard = page.locator('section').filter({ hasText: PROGRAMS.donor.code }).first();
  await expect(donorCard.getByText(/Effective budget: capex/)).toBeVisible();
  await expect(donorCard.getByText(rp(100_000_000)).first()).toBeVisible();
  // the edit form keeps the non-amount fields but has no budget inputs
  await donorCard.getByText('Edit program').click();
  await expect(donorCard.getByText(/Budgets are frozen while the plan is active/)).toBeVisible();
  await expect(
    donorCard.locator('input[name="capexBudget"]:not([type="hidden"])'),
  ).toHaveCount(0);
  await expect(donorCard.locator('input[name="name"]')).toHaveValue(PROGRAMS.donor.name);

  // ------------------------------------------ record the formal decision
  await openRevisionRegister(page);
  const awaitingRevision = page.locator('li').filter({ hasText: 'REV-2030-001' });
  await awaitingRevision.getByText('Record the decision reference').click();
  await awaitingRevision.locator('input[name="decisionReference"]').fill('SC-2030-01');
  await awaitingRevision
    .locator('textarea[name="reason"]')
    .fill('Steering committee decision recorded.');
  await awaitingRevision.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision reference recorded for REV-2030-001.')).toBeVisible();
  await expect(page.getByText('awaiting decision reference')).toHaveCount(0);
  await expect(page.getByText('SC-2030-01')).toBeVisible();
});

test('posts a balanced switch and refuses an unbalanced one and one above the floor @t2', async ({
  page,
}) => {
  // FY2030 is active with PRG-2030-01 holding Rp 100.000.000 of unallocated
  // capex and PRG-2030-02 at zero (the previous test posted it). Add a 20M
  // allocation so the switch floor has something to run out of.
  await createFloorAllocation(page);
  await openAnnualPlan(page, REVISION_YEAR);
  await openRevisionRegister(page);

  // ------------------------------------------------------- the balance rule
  await postRevision(page, {
    reason: 'Unbalanced candidate',
    lines: [
      { program: PROGRAMS.donor, capex: '-40000000' },
      { program: PROGRAMS.receiver, capex: '25000000' },
    ],
  });
  await expect(page.getByText(/Capex lines do not balance/).first()).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'REV-2030-002' })).toHaveCount(0);

  // ---------------------------------------------------- a balanced switch
  await postRevision(page, {
    reason: 'Move network budget to device refresh',
    decisionReference: 'SC-2030-02',
    lines: [
      { program: PROGRAMS.donor, capex: '-40000000' },
      { program: PROGRAMS.receiver, capex: '40000000' },
    ],
  });
  await expect(page.getByText('Budget revision REV-2030-002 posted.')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'REV-2030-002' })).toHaveCount(1);

  // The register keeps both revisions; the second carries its decision.
  await expect(page.locator('li').filter({ hasText: 'REV-2030-' })).toHaveCount(2);
  await expect(page.getByText('SC-2030-02')).toBeVisible();
  // A switch is two lines in one document: donor down, receiver up, both linked.
  const switchCard = page.locator('li').filter({ hasText: 'REV-2030-002' });
  await expect(switchCard.getByRole('link', { name: /PRG-2030-01 · Network renewal/ })).toBeVisible();
  await expect(switchCard.getByRole('link', { name: /PRG-2030-02 · Device refresh/ })).toBeVisible();

  // ------------------------------------------ more than is unallocated
  // A 20M allocation sits under the donor program. After the 40M switch the
  // donor has 60M budget and 40M unallocated; a 50M switch stays above zero but
  // cannot be covered, so the floor refuses it and it never reaches the register.
  await postRevision(page, {
    reason: 'Switch above the unallocated budget',
    lines: [
      { program: PROGRAMS.donor, capex: '-50000000' },
      { program: PROGRAMS.receiver, capex: '50000000' },
    ],
  });
  await expect(page.getByText(/this switch takes/)).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'REV-2030-003' })).toHaveCount(0);
  await expect(page.locator('li').filter({ hasText: 'REV-2030-' })).toHaveCount(2);
});
