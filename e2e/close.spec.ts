import { expect, test, type Page } from '@playwright/test';
import { rp } from './support/money';
import { createProgramFixture } from './support/programs';

/**
 * Close (tier T2): the close preconditions the foundation journey does not
 * exercise, because it stops after the successful FY2027 close.
 *
 * 1. A draft year can be created and activated, but its close page has nowhere
 *    to carry the remaining budget until the next fiscal year exists.
 * 2. A wrong typed confirmation is blocked by the form itself (the `pattern`
 *    attribute) and does not reset the approval reference.
 * 3. The live carry-over preview is derived from the per-program and
 *    per-allocation amounts as they are typed, and a partial carry asks for the
 *    not-carried reason the close snapshot records (#113, ADR-0006 §3).
 *
 * The first test creates FY2029 and leaves it active on purpose: it becomes the
 * close target that makes FY2028's close page render the review form used by
 * tests 2 and 3 (and the tests never submit a close). No later spec may depend
 * on FY2029 state.
 *
 * Prerequisite: the foundation journey has run (FY2028 active, FY2027 closed).
 */

const OPEN_YEAR = 2028;
const NEXT_YEAR = 2029;

interface ProgramRef {
  code: string;
  name: string;
}

interface ProjectRef {
  code: string;
  name: string;
}

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

const createProgram = async (page: Page, program: ProgramRef): Promise<void> => {
  await createProgramFixture({
    fiscalYear: OPEN_YEAR,
    siCode: 'SI-01',
    code: program.code,
    name: program.name,
    capex: 20_000_000,
    opex: 0,
  });
  await page.reload();
  await expect(page.getByText(`${program.code} · ${program.name}`).first()).toBeVisible();
};

const createProject = async (page: Page, program: ProgramRef, project: ProjectRef): Promise<void> => {
  await page.goto('/plan/projects');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await form
    .locator('select[name="originatingProgramId"]')
    .selectOption({ label: `${program.code} · ${program.name} (FY${OPEN_YEAR}, SI-01)` });
  await form.locator('input[name="code"]').fill(project.code);
  await form.locator('input[name="name"]').fill(project.name);
  await form.locator('input[name="startFiscalYear"]').fill(String(OPEN_YEAR));
  await form.locator('input[name="endFiscalYear"]').fill(String(NEXT_YEAR));
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
    .selectOption({ label: `FY${OPEN_YEAR} · ${program.code} · ${program.name}` });
  await form.locator('input[name="allocationCapex"]').fill(amounts.capex);
  await form.locator('input[name="allocationOpex"]').fill(amounts.opex);
  await form.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(`Project year allocation FY${OPEN_YEAR} created.`)).toBeVisible();
};

test('activates FY2029 and its close page refuses while FY2030 is missing @t2', async ({
  page,
}) => {
  // create and activate the year the foundation did not create
  await page.goto('/plan/annual');
  const createForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
  await createForm.locator('select[name="fiscalYear"]').selectOption(String(NEXT_YEAR));
  await page.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText(`Annual plan FY${NEXT_YEAR} created.`)).toBeVisible();

  await page.locator('tbody tr', { hasText: `FY${NEXT_YEAR}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${NEXT_YEAR} annual plan` })).toBeVisible();
  await activateAnnualPlan(page, NEXT_YEAR);

  // with no FY2030 plan there is no carry-over target, so the close page states
  // the missing year and renders no form: close-actions.ts would answer
  // "The FY2030 annual plan does not exist yet; create it before closing." but
  // the browser cannot submit it.
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: `Close FY${NEXT_YEAR}` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next fiscal year is missing' })).toBeVisible();
  await expect(page.getByText('Carry-over has nowhere to land.')).toBeVisible();
  await expect(
    page.getByText(/Create the FY2030 annual plan first, then close FY2029\./),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create the next annual plan' })).toBeVisible();
  await expect(page.locator('input[name="confirmation"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Close FY${NEXT_YEAR} and carry over` })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);

  // FY2029 stays active: later specs must not depend on it
  await page.goto('/plan/annual');
  await expect(
    page.locator('tbody tr', { hasText: `FY${NEXT_YEAR}` }).getByText('active', { exact: true }),
  ).toBeVisible();
});

test('blocks a wrong typed confirmation without resetting the reference @t2', async ({ page }) => {
  await openAnnualPlan(page, OPEN_YEAR);
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: `Close FY${OPEN_YEAR}` })).toBeVisible();

  // every carry-over field is required, so fill them (0 = none) to make the
  // typed confirmation the only control the browser can refuse
  const carryInputs = page.locator('input[name^="carry_"]');
  await expect(carryInputs.first()).toBeVisible();
  const carryCount = await carryInputs.count();
  for (let index = 0; index < carryCount; index += 1) {
    await carryInputs.nth(index).fill('0');
  }
  await page.locator('input[name="reference"]').fill('E2E-CLOSE-FY2028');
  await page.locator('input[name="confirmation"]').fill('CLOSE FY2027');
  await page.getByRole('button', { name: `Close FY${OPEN_YEAR} and carry over` }).click();

  // the browser blocks the submit on the pattern: no server round trip, so the
  // reference (local state) is not reset and no close happened
  const confirmation = page.locator('input[name="confirmation"]');
  await expect(page.locator('input[name="reference"]')).toHaveValue('E2E-CLOSE-FY2028');
  await expect(confirmation).toHaveValue('CLOSE FY2027');
  expect(
    await confirmation.evaluate((element) => (element as HTMLInputElement).validity.patternMismatch),
  ).toBe(true);
  await expect(page).toHaveURL(/\/plan\/annual\/[0-9a-f-]+\/close$/);
  await expect(page.getByText(`Fiscal year FY${OPEN_YEAR} closed and carry-over recorded.`)).toHaveCount(0);

  // the exact phrase satisfies the pattern; the form is not submitted here
  await confirmation.fill(`CLOSE FY${OPEN_YEAR}`);
  expect(await confirmation.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(
    true,
  );
  await page.goto('/plan/annual');
  await expect(
    page.locator('tbody tr', { hasText: `FY${OPEN_YEAR}` }).getByText('active', { exact: true }),
  ).toBeVisible();
});

test('derives the carry-over preview from the per-program and per-allocation amounts @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'CLOSE-PRG-1', name: 'Close preview program' },
    project: { code: 'CLOSE-PRJ-1', name: 'Close preview project' },
  };

  // an FY2028 allocation to fill in the per-allocation half of the preview
  await openAnnualPlan(page, OPEN_YEAR);
  await createProgram(page, fixture.program);
  await createProject(page, fixture.program, fixture.project);
  await openProject(page, fixture.project);
  await addAllocation(page, fixture.program, { capex: '10000000', opex: '0' });

  await openAnnualPlan(page, OPEN_YEAR);
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: `Close FY${OPEN_YEAR}` })).toBeVisible();

  const preview = page.getByRole('region', { name: 'Carry-over totals preview' });
  const previewValue = (label: string) =>
    preview.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
  await expect(previewValue('Program capex')).toHaveText(rp(0));
  await expect(previewValue('Allocation capex')).toHaveText(rp(0));
  // a blank carry field is not a silent zero: the preview warns and the close blocks
  await expect(preview.getByRole('alert')).toContainText(
    'Every carry-over field needs a whole Rupiah amount; enter 0 for none.',
  );

  // the per-program amount feeds the program total
  await page
    .locator('tbody tr', { hasText: 'CLOSE-PRG-1' })
    .locator('input[name$="_capex"]')
    .fill('5000000');
  // A partial carry leaves part of the available amount behind, so the row asks
  // for the not-carried reason the close snapshot records (#113, ADR-0006 §3).
  const closeRow = page.locator('tbody tr', { hasText: 'CLOSE-PRG-1' });
  await expect(
    closeRow.getByText('Part of the available amount is not carried: a reason is required.'),
  ).toBeVisible();
  await expect(page.locator('input[name^="not_carried_reason_"]').first()).toBeVisible();
  // The fixture program was created without a continuation link, so its carry
  // target is an explicit same-initiative choice, not a default.
  await expect(
    closeRow.getByText('Source discontinued or merged: the target is a reallocation decision.'),
  ).toBeVisible();
  await expect(previewValue('Program capex')).toHaveText(rp(5000000));
  await expect(previewValue('Program opex')).toHaveText(rp(0));

  // the per-allocation amount feeds the allocation total separately
  await page
    .locator('tbody tr', { hasText: 'CLOSE-PRJ-1' })
    .locator('input[name$="_capex"]')
    .fill('3000000');
  await expect(previewValue('Allocation capex')).toHaveText(rp(3000000));
  await expect(previewValue('Allocation opex')).toHaveText(rp(0));

  // nothing was submitted: FY2028 is still the open year
  await page.goto('/plan/annual');
  await expect(
    page.locator('tbody tr', { hasText: `FY${OPEN_YEAR}` }).getByText('active', { exact: true }),
  ).toBeVisible();
});
