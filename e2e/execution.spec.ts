import { expect, test, type Page } from '@playwright/test';
import { rp } from './support/money';

/**
 * Execution (tier T2): the commitment and spend lifecycle on a fresh FY2028
 * allocation — open → partially settled → settled — with the remaining
 * arithmetic of ADR-0003 §3 (allocation + carry-in − open commitments −
 * current-year spend), the BR-11 warning when current-year spend outruns the
 * year's commitments, and the prior-year opening classification that is
 * excluded from remaining.
 *
 * The fourth test covers cross-year settlement and BR-11's exclusion of it: a
 * spend recorded on FY2029 that settles an FY2028 commitment. It needs its own
 * strategic initiative and a project spanning both fiscal years, because the
 * spend form only offers earlier-year commitments of the SAME project
 * (execution-queries.ts loadPriorSettlementOptions) and both years must be open.
 * A dedicated SI keeps those extra program budgets out of SI-01's envelope.
 *
 * Prerequisite: the foundation journey has run. Every record is created new inside
 * its own test with an EXEC- code (FY2028, plus FY2029 for the cross-year case),
 * and the cross-year test uses XYS- codes and its own initiative.
 */

const FY = 2028;
const NEXT_FY = 2029;
const FY_FROM = '2028-03-01';

interface ProgramRef {
  code: string;
  name: string;
}

interface ProjectRef {
  code: string;
  name: string;
}

const openAnnualPlan = async (page: Page, year: number = FY): Promise<void> => {
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: `FY${year}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
};

const createProgram = async (
  page: Page,
  program: ProgramRef,
  siLabel = 'SI-01 · Digital Workplace',
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add program' }) });
  await form.locator('input[name="code"]').fill(program.code);
  await form.locator('input[name="name"]').fill(program.name);
  await form.locator('select[name="siId"]').selectOption({ label: siLabel });
  await form.locator('input[name="capexBudget"]').fill('30000000');
  await form.locator('input[name="opexBudget"]').fill('0');
  await form.getByRole('button', { name: 'Add program' }).click();
  await expect(page.getByText(`Annual program ${program.code} created.`)).toBeVisible();
};

const createProject = async (
  page: Page,
  program: ProgramRef,
  project: ProjectRef,
  options: { siCode?: string; start?: number; end?: number } = {},
): Promise<void> => {
  // the originating-program option reads "<code> · <name> (FY<year>, <SI code>)"
  const siCode = options.siCode ?? 'SI-01';
  const start = options.start ?? FY;
  const end = options.end ?? FY;
  await page.goto('/plan/projects');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await form
    .locator('select[name="originatingProgramId"]')
    .selectOption({ label: `${program.code} · ${program.name} (FY${FY}, ${siCode})` });
  await form.locator('input[name="code"]').fill(project.code);
  await form.locator('input[name="name"]').fill(project.name);
  await form.locator('input[name="startFiscalYear"]').fill(String(start));
  await form.locator('input[name="endFiscalYear"]').fill(String(end));
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

/** Builds a fresh program, project and FY2028 allocation (capex 20,000,000). */
const buildAllocation = async (
  page: Page,
  fixture: { program: ProgramRef; project: ProjectRef },
): Promise<void> => {
  await openAnnualPlan(page);
  await createProgram(page, fixture.program);
  await createProject(page, fixture.program, fixture.project);
  await openProject(page, fixture.project);
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await form
    .locator('select[name="annualProgramId"]')
    .selectOption({ label: `FY${FY} · ${fixture.program.code} · ${fixture.program.name}` });
  await form.locator('input[name="allocationCapex"]').fill('20000000');
  await form.locator('input[name="allocationOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(`Project year allocation FY${FY} created.`)).toBeVisible();
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(
    page.getByRole('heading', { name: `FY${FY} allocation · ${fixture.program.code}` }),
  ).toBeVisible();
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
  input: { amount: string; reference: string },
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add commitment' }) });
  await form.locator('select[name="component"]').selectOption('capex');
  await form.locator('input[name="amount"]').fill(input.amount);
  await form.locator('input[name="commitmentDate"]').fill(FY_FROM);
  await form.locator('input[name="reference"]').fill(input.reference);
  await form.getByRole('button', { name: 'Add commitment' }).click();
  await expect(page.getByText(`Commitment ${input.reference} recorded.`)).toBeVisible();
};

const expectSpendFlash = async (page: Page, reference: string): Promise<void> => {
  await expect(page.getByText(`Spend entry ${reference} recorded.`)).toBeVisible();
};

/** Adds one project year allocation on the project page for the given fiscal year. */
const addAllocation = async (
  page: Page,
  program: ProgramRef,
  amounts: { capex: string; opex: string },
  fiscalYear = FY,
): Promise<void> => {
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add allocation' }) });
  await form
    .locator('select[name="annualProgramId"]')
    .selectOption({ label: `FY${fiscalYear} · ${program.code} · ${program.name}` });
  await form.locator('input[name="allocationCapex"]').fill(amounts.capex);
  await form.locator('input[name="allocationOpex"]').fill(amounts.opex);
  await form.getByRole('button', { name: 'Add allocation' }).click();
  await expect(page.getByText(`Project year allocation FY${fiscalYear} created.`)).toBeVisible();
};

/** Opens one allocation card's execution page from the project page. */
const openAllocationCard = async (
  page: Page,
  fiscalYear: number,
  program: ProgramRef,
): Promise<void> => {
  const cardTitle = `FY${fiscalYear} · ${program.code} · ${program.name}`;
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: cardTitle }) });
  await card.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(
    page.getByRole('heading', { name: `FY${fiscalYear} allocation · ${program.code}` }),
  ).toBeVisible();
};

/**
 * Cross-year settlement needs the next fiscal year open as well. close.spec may
 * already have created and activated FY2029, so this creates the plan only when
 * it is missing and activates it only while it is a draft — the test also runs on
 * its own (for example with --grep).
 */
const ensureOpenYear = async (page: Page, year: number): Promise<void> => {
  await page.goto('/plan/annual');
  if ((await page.locator('tbody tr', { hasText: `FY${year}` }).count()) === 0) {
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
    await form.locator('select[name="fiscalYear"]').selectOption(String(year));
    await page.getByRole('button', { name: 'Create annual plan' }).click();
    await expect(page.getByText(`Annual plan FY${year} created.`)).toBeVisible();
  }
  await page.locator('tbody tr', { hasText: `FY${year}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
  const headerActions = page.getByRole('group', { name: 'Page header actions' });
  if ((await headerActions.getByText('draft', { exact: true }).count()) > 0) {
    const activation = headerActions.locator('form');
    await activation
      .locator('textarea[name="reason"]')
      .fill(`FY${year} kept open for the cross-year test.`);
    await activation.getByRole('button', { name: 'Activate annual plan' }).click();
    await expect(page.getByText(`Annual plan FY${year} activated.`)).toBeVisible();
  }
};

test('runs an allocation through open, partially settled and settled with the remaining arithmetic @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'EXEC-PRG-1', name: 'Execution lifecycle program' },
    project: { code: 'EXEC-PRJ-1', name: 'Execution lifecycle project' },
  };
  await buildAllocation(page, fixture);

  const summary = (label: string) => cardValue(page, 'Allocation and execution', label);
  await expect(summary('Capex allocation + carry-in')).toHaveText(rp(20000000));
  await expect(summary('Capex commitments (open)')).toHaveText(`${rp(0)} (open ${rp(0)})`);
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex remaining')).toHaveText(rp(20000000));

  // a commitment is open, reduces the remaining and is not spend yet
  await recordCommitment(page, { amount: '10000000', reference: 'EXEC-PO-1' });
  const commitmentRow = page.locator('tbody tr', { hasText: 'EXEC-PO-1' });
  await expect(commitmentRow.getByText('open', { exact: true })).toBeVisible();
  // nothing is settled yet: the settled cell is the only zero in the row
  await expect(commitmentRow.getByText(rp(0))).toBeVisible();
  await expect(summary('Capex commitments (open)')).toHaveText(
    `${rp(10000000)} (open ${rp(10000000)})`,
  );
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex remaining')).toHaveText(rp(10000000));

  // a spend that settles part of it: open commitments fall, spend rises, remaining is unchanged
  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('6000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-04-01');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-1');
  await spendForm.locator('input[name^="settle_"]').first().fill('6000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expectSpendFlash(page, 'EXEC-SP-1');

  await expect(commitmentRow.getByText('partially settled')).toBeVisible();
  await expect(commitmentRow.getByText(rp(6000000))).toBeVisible();
  await expect(commitmentRow.getByText(rp(4000000))).toBeVisible();
  await expect(summary('Capex commitments (open)')).toHaveText(
    `${rp(10000000)} (open ${rp(4000000)})`,
  );
  await expect(summary('Capex spend this year')).toHaveText(rp(6000000));
  await expect(summary('Capex remaining')).toHaveText(rp(10000000));
  const firstSpend = page.locator('tbody tr', { hasText: 'EXEC-SP-1' });
  await expect(firstSpend.getByText('current year')).toBeVisible();
  await expect(firstSpend.getByText(`${rp(6000000)} · FY${FY}`)).toBeVisible();

  // settling the rest makes the commitment settled, and the remaining is still 10,000,000
  await spendForm.locator('input[name="amount"]').fill('4000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-05-01');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-2');
  await spendForm.locator('input[name^="settle_"]').first().fill('4000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expectSpendFlash(page, 'EXEC-SP-2');

  await expect(commitmentRow.getByText('settled', { exact: true })).toBeVisible();
  await expect(summary('Capex commitments (open)')).toHaveText(`${rp(10000000)} (open ${rp(0)})`);
  await expect(summary('Capex spend this year')).toHaveText(rp(10000000));
  await expect(summary('Capex remaining')).toHaveText(rp(10000000));

  // an unsettled spend reduces the remaining and, once above the commitment total,
  // raises the BR-11 warning (a warning, never a block)
  await expect(page.getByText('capex spend above commitment (BR-11)')).toHaveCount(0);
  await spendForm.locator('input[name="amount"]').fill('5000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-06-01');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-3');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expectSpendFlash(page, 'EXEC-SP-3');

  await expect(summary('Capex spend this year')).toHaveText(rp(15000000));
  await expect(summary('Capex remaining')).toHaveText(rp(5000000));
  await expect(page.getByText('capex spend above commitment (BR-11)')).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'EXEC-SP-3' }).getByText('none')).toBeVisible();
});

test('records a prior-year opening payment without moving the remaining budget @t2', async ({
  page,
}) => {
  const fixture = {
    program: { code: 'EXEC-PRG-2', name: 'Execution opening program' },
    project: { code: 'EXEC-PRJ-2', name: 'Execution opening project' },
  };
  await buildAllocation(page, fixture);

  const summary = (label: string) => cardValue(page, 'Allocation and execution', label);
  await recordCommitment(page, { amount: '5000000', reference: 'EXEC-PO-2' });
  await expect(summary('Capex remaining')).toHaveText(rp(15000000));

  // a prior-year opening payment is spend outside the current year: it is shown
  // separately and excluded from the remaining and from BR-11
  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('6000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-04-02');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-4');
  await spendForm.locator('select[name="settlementKind"]').selectOption('prior_year_opening');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expectSpendFlash(page, 'EXEC-SP-4');

  await expect(page.locator('tbody tr', { hasText: 'EXEC-SP-4' }).getByText('prior-year opening', { exact: true })).toBeVisible();
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex remaining')).toHaveText(rp(15000000));
  const priorYearRow = page
    .locator('dl > div')
    .filter({ hasText: 'Prior-year opening payments (excluded from remaining)' });
  await expect(priorYearRow.locator('dd')).toHaveText(`capex ${rp(6000000)} · opex ${rp(0)}`);

  // a prior-year opening payment cannot settle an in-app commitment
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('6000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-04-03');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-5');
  await spendForm.locator('select[name="settlementKind"]').selectOption('prior_year_opening');
  await spendForm.locator('input[name^="settle_"]').first().fill('5000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expect(
    spendForm.getByText('A prior-year opening payment cannot settle an in-app commitment.'),
  ).toBeVisible();
  // nothing was recorded: the prior-year total and the remaining are unchanged
  await expect(priorYearRow.locator('dd')).toHaveText(`capex ${rp(6000000)} · opex ${rp(0)}`);
  await expect(summary('Capex remaining')).toHaveText(rp(15000000));
});

test('refuses a settlement above the open commitment amount @t2', async ({ page }) => {
  const fixture = {
    program: { code: 'EXEC-PRG-3', name: 'Execution refusal program' },
    project: { code: 'EXEC-PRJ-3', name: 'Execution refusal project' },
  };
  await buildAllocation(page, fixture);
  const allocationUrl = page.url();

  const summary = (label: string) => cardValue(page, 'Allocation and execution', label);
  await recordCommitment(page, { amount: '10000000', reference: 'EXEC-PO-3' });
  await expect(summary('Capex remaining')).toHaveText(rp(10000000));

  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('12000000');
  await spendForm.locator('input[name="spentOn"]').fill('2028-04-04');
  await spendForm.locator('input[name="reference"]').fill('EXEC-SP-6');
  // the commitment's open amount is 10,000,000, so a 11,000,000 split is refused
  await spendForm.locator('input[name^="settle_"]').first().fill('11000000');
  await page.getByRole('button', { name: 'Record spend' }).click();

  // validateSettlementSplits throws a SettlementError, which failureState does not
  // translate into a form message: it rethrows and the route error boundary renders
  // (#99 — src/server/actions/common.ts knownFailureMessage, src/domain/settlement.ts).
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();

  // nothing was written: the commitment is still open and no spend row exists
  await page.goto(allocationUrl);
  await expect(
    page.getByRole('heading', { name: `FY${FY} allocation · ${fixture.program.code}` }),
  ).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'EXEC-SP-6' })).toHaveCount(0);
  await expect(
    page.locator('tbody tr', { hasText: 'EXEC-PO-3' }).getByText('open', { exact: true }),
  ).toBeVisible();
  await expect(summary('Capex remaining')).toHaveText(rp(10000000));
});

test('settles an FY2028 commitment from FY2029 without moving either year @t2', async ({ page }) => {
  // Cross-year settlement (ADR-0003 §3 / BR-11): a spend in the open year that pays
  // an earlier year's commitment is classified cross-year, and only the remainder
  // counts as the current year's spend — so FY2029's remaining does not move while
  // the FY2028 commitment settles without creating FY2028 actuals.
  //
  // This fixture is the heaviest setup in the file (an initiative, two annual
  // programs, a two-year project, two allocations and the prior-year commitment).
  test.setTimeout(180_000);

  const initiative = { code: 'XYS-01', name: 'Cross-year settlement initiative' };
  const program2028 = { code: 'XYS-PRG-2028', name: 'Cross-year program 2028' };
  const program2029 = { code: 'XYS-PRG-2029', name: 'Cross-year program 2029' };
  const project = { code: 'XYS-PRJ-1', name: 'Cross-year project' };

  // A dedicated SI keeps the extra programs out of SI-01's envelope check.
  await page.goto('/plan/strategic');
  const initiativeForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });
  await initiativeForm.locator('input[name="code"]').fill(initiative.code);
  await initiativeForm.locator('input[name="name"]').fill(initiative.name);
  await initiativeForm.locator('input[name="envelopeAmount"]').fill('500000000');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText(`Strategic initiative ${initiative.code} created.`)).toBeVisible();
  const siLabel = `${initiative.code} · ${initiative.name}`;

  // both fiscal years must be open: the project owns one allocation per year
  await ensureOpenYear(page, NEXT_FY);
  await openAnnualPlan(page, FY);
  await createProgram(page, program2028, siLabel);
  await openAnnualPlan(page, NEXT_FY);
  await createProgram(page, program2029, siLabel);
  await createProject(page, program2028, project, { siCode: initiative.code, start: FY, end: NEXT_FY });
  await openProject(page, project);
  await addAllocation(page, program2028, { capex: '20000000', opex: '0' });
  await addAllocation(page, program2029, { capex: '20000000', opex: '0' }, NEXT_FY);

  // an FY2028 commitment, left open for the next year to pay
  await openAllocationCard(page, FY, program2028);
  await recordCommitment(page, { amount: '10000000', reference: 'XYS-PO-2028' });

  // the FY2029 spend form offers the earlier year's commitment for settlement
  await openProject(page, project);
  await openAllocationCard(page, NEXT_FY, program2029);
  await expect(
    page.getByText('PRIOR YEAR · CAPEX · FY2028 · 2028-03-01 · XYS-PO-2028 · open 10000000'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'FY2029 spend settling an earlier-year commitment is classified as cross-year automatically.',
    ),
  ).toBeVisible();

  const summary = (label: string) => cardValue(page, 'Allocation and execution', label);
  await expect(summary('Capex commitments (open)')).toHaveText(`${rp(0)} (open ${rp(0)})`);
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex remaining')).toHaveText(rp(20000000));
  await expect(page.getByText('No commitments recorded yet.')).toBeVisible();

  // the FY2029 spend settles the FY2028 commitment: a cross-year settlement
  const spendForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record spend' }) });
  await spendForm.locator('select[name="component"]').selectOption('capex');
  await spendForm.locator('input[name="amount"]').fill('10000000');
  await spendForm.locator('input[name="spentOn"]').fill('2029-02-01');
  await spendForm.locator('input[name="reference"]').fill('XYS-SP-1');
  await spendForm.locator('input[name^="settle_"]').first().fill('10000000');
  await page.getByRole('button', { name: 'Record spend' }).click();
  await expectSpendFlash(page, 'XYS-SP-1');

  // classified cross-year, and the primary/excluded portion does not reduce FY2029
  await expect(page.getByText('cross-year settlement', { exact: true })).toBeVisible();
  await expect(
    page
      .locator('tbody tr', { hasText: 'XYS-SP-1' })
      .getByText(`${rp(10000000)} · FY2028 (cross-year)`),
  ).toBeVisible();
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex remaining')).toHaveText(rp(20000000));
  await expect(summary('Capex commitments (open)')).toHaveText(`${rp(0)} (open ${rp(0)})`);
  await expect(page.getByText('capex spend above commitment (BR-11)')).toHaveCount(0);

  // FY2028 shows the commitment settled, with no current-year actuals of its own
  await openProject(page, project);
  await openAllocationCard(page, FY, program2028);
  await expect(
    page.locator('tbody tr', { hasText: 'XYS-PO-2028' }).getByText('settled', { exact: true }),
  ).toBeVisible();
  await expect(summary('Capex spend this year')).toHaveText(rp(0));
  await expect(summary('Capex commitments (open)')).toHaveText(`${rp(10000000)} (open ${rp(0)})`);
  await expect(summary('Capex remaining')).toHaveText(rp(20000000));
  // the cross-year spend belongs to the FY2029 allocation, so FY2028 lists none
  await expect(page.getByText('No spend entries recorded yet.')).toBeVisible();
});
