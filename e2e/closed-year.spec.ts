import { expect, test, type Locator, type Page } from '@playwright/test';
import { rp } from './support/money';

/**
 * Closed year (tier T2): FY2027 was closed by the foundation, so its write
 * surface stays closed except for the one door ADR-0007 (#108) opens — an
 * audited correction of an existing record, behind the record's own `Correct
 * record` affordance. This file pins that boundary: no create, void, cancel or
 * status control is rendered, the form is not in the DOM until the affordance
 * is pressed, the one server refusal a browser can still reach (a project
 * created under a closed-year program), and the closed-year summary on the
 * close page so the year cannot be closed twice. The full correction journey
 * (saving, badge, history, reports, receipt) is corrections.spec.ts.
 *
 * Post-close settlement (#98) is implemented: a closed allocation stays
 * read-only for entries, while an open-year payment settles a commitment from
 * the closed year. This file pins that write-surface split; the full treatment
 * proof is in execution.spec.ts.
 * The #96 (allocation update) and #97 (recurring-ops void) closed-year guards are
 * proven by action-level tests in
 *   src/server/plan/allocation-actions.test.ts
 *   src/server/plan/recurring-actions.test.ts
 * #108 changed what those guards do on the update path: the closed-year allocation
 * update is now a correction (corrections.spec.ts), so #96's browser case pins the
 * remaining invariant — the plain open-year edit form never returns.
 *
 * Prerequisite: the foundation journey has run (FY2027 closed by "E2E-CLOSE-FY2027",
 * FY2028 active).
 */

const CLOSED_YEAR = 2027;
const CLOSE_REFERENCE = 'E2E-CLOSE-FY2027';

/** The fixed copy the closed pages render for a correction (#108 contract). */
const CORRECTION_BANNER =
  'This fiscal year is closed. Saving is recorded as a correction after close, and the close snapshot does not change.';
const CLOSED_PLAN_NOTICE =
  'This fiscal year is closed. Figures can still be corrected with a reason; every correction is audited and the close snapshot stays frozen.';

const openAnnualPlan = async (page: Page, year: number): Promise<void> => {
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: `FY${year}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
};

/** The `<section>` a Card renders, found by its heading. */
const cardByHeading = (page: Page, name: string): Locator =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });

/** The dd that follows one dt, inside one already-scoped section. */
const valueIn = (section: Locator, dtLabel: string) =>
  section.locator('dl > div').filter({ hasText: dtLabel }).locator('dd');

test('the closed FY2027 annual plan keeps its write surface hidden until a correction is asked for @t2', async ({
  page,
}) => {
  await page.goto('/plan/annual');
  await expect(page.locator('tbody tr', { hasText: `FY${CLOSED_YEAR}` }).getByText('closed')).toBeVisible();

  await page.locator('tbody tr', { hasText: `FY${CLOSED_YEAR}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${CLOSED_YEAR} annual plan` })).toBeVisible();
  // the page says a correction is possible, and offers nothing to write with
  // until one is asked for
  await expect(page.getByText(CLOSED_PLAN_NOTICE)).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add program' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add recurring ops item' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void program' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void item' })).toHaveCount(0);
  // the open-year disclosure is gone: the form lives behind the affordance now
  await expect(page.getByText('Edit program')).toHaveCount(0);
  await expect(page.getByText('Edit item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Activate annual plan' })).toHaveCount(0);
  // a closed year is read back through its receipt, never closed a second time
  await expect(page.getByRole('link', { name: 'Close fiscal year' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Close receipt' })).toBeVisible();
  // the closed year still lists what it contains, each record with one affordance
  await expect(page.getByText('PRG-2027-001 · Workplace Modernisation 2027')).toBeVisible();
  await expect(page.getByText('Leased lines 2027')).toBeVisible();
  const programCard = cardByHeading(page, 'PRG-2027-001 · Workplace Modernisation 2027');
  const itemCard = cardByHeading(page, 'Leased lines 2027');
  await expect(programCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(itemCard.getByRole('button', { name: 'Correct record' })).toBeVisible();

  // the form is not in the DOM until the affordance is pressed ...
  await programCard.getByRole('button', { name: 'Correct record' }).click();
  await expect(programCard.getByText(CORRECTION_BANNER)).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(1);
  const form = programCard.locator('form');
  // ... and it is the existing edit form: same fields, budget included, one
  // open record at a time (the item's form is still absent)
  await expect(form.locator('input[name="capexBudget"]')).toBeVisible();
  await expect(form.locator('input[name="opexBudget"]')).toBeVisible();
  await expect(form.locator('textarea[name="reason"]')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(itemCard.locator('form')).toHaveCount(0);

  // the close page reports the closed year and has no close form, so it cannot
  // be closed twice: close-actions.ts answers "This fiscal year is already
  // closed." on the server, but the form that would send it is not rendered.
  const planPath = new URL(page.url()).pathname;
  await page.goto(`${planPath}/close`);
  await expect(page.getByRole('heading', { name: `Close FY${CLOSED_YEAR}` })).toBeVisible();
  const closedCard = page.locator('section').filter({ hasText: 'Fiscal year closed' });
  await expect(closedCard.getByText('closed', { exact: true })).toBeVisible();
  await expect(valueIn(closedCard, 'Approval reference')).toHaveText(CLOSE_REFERENCE);
  const receiptsCard = page.locator('section').filter({ hasText: 'Carry-over receipts' });
  await expect(
    receiptsCard.locator('tbody tr', { hasText: 'PRG-2027-001' }).first(),
  ).toContainText(rp(100000000));
  await expect(page.locator('input[name="confirmation"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Close FY${CLOSED_YEAR} and carry over` })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});

test('the closed FY2027 project and its allocation stay locked until a correction is asked for @t2', async ({
  page,
}) => {
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByText('Edit project')).toHaveCount(0);
  await expect(page.getByText('Record ijin prinsip')).toHaveCount(0);
  await expect(page.getByText('Update ijin prinsip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add allocation' })).toHaveCount(0);
  await expect(page.getByText('Edit allocation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void allocation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel project' })).toHaveCount(0);

  // each correctable record of the closed project has its own affordance
  const pricingCard = cardByHeading(page, 'Full-life figures and pricing chain');
  const ijinCard = cardByHeading(page, 'Ijin prinsip');
  const allocationCard = cardByHeading(page, 'FY2027 · PRG-2027-001 · Workplace Modernisation 2027');
  await expect(pricingCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(ijinCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(allocationCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);

  await allocationCard.getByRole('button', { name: 'Correct record' }).click();
  await expect(allocationCard.getByText(CORRECTION_BANNER)).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(1);
  await expect(allocationCard.locator('input[name="allocationCapex"]')).toBeVisible();
  await expect(allocationCard.locator('textarea[name="reason"]')).toBeVisible();

  // the allocation execution page keeps the same split: no entry forms, and the
  // commitment update is the one write reachable through an affordance
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(
    page.getByRole('heading', { name: `FY${CLOSED_YEAR} allocation · PRG-2027-001` }),
  ).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record spend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void spend' })).toHaveCount(0);
  await expect(page.getByText('Manage', { exact: true })).toHaveCount(0);
  const commitmentsSection = cardByHeading(page, 'Commitment entries');
  await expect(commitmentsSection.getByRole('button', { name: 'Correct record' })).toBeVisible();
  // spend entries are not a correctable record type: no affordance there
  const spendSection = cardByHeading(page, 'Spend entries');
  await expect(spendSection.getByRole('button', { name: 'Correct record' })).toHaveCount(0);

  const summary = (label: string) =>
    page
      .locator('section')
      .filter({ hasText: 'Allocation and execution' })
      .locator('dl > div')
      .filter({ has: page.locator('dt', { hasText: label }) })
      .locator('dd');
  await expect(summary('Capex allocation + carry-in')).toHaveText(rp(500000000));
  await expect(summary('Opex allocation + carry-in')).toHaveText(rp(100000000));
  // the figures still add up: 500,000,000 allocation − 40,000,000 open
  // commitment (100,000,000 committed, 60,000,000 settled) − 60,000,000 spend
  await expect(summary('Capex remaining')).toHaveText(rp(400000000));
});

test('the closed FY2027 recurring ops item is correctable while its execution stays closed @t2', async ({
  page,
}) => {
  await openAnnualPlan(page, CLOSED_YEAR);
  await expect(page.getByText(CLOSED_PLAN_NOTICE)).toBeVisible();
  const itemCard = cardByHeading(page, 'Leased lines 2027');
  await expect(itemCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(itemCard.locator('form')).toHaveCount(0);

  await itemCard.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(page.getByRole('heading', { name: `FY${CLOSED_YEAR} · Leased lines 2027` })).toBeVisible();

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record spend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void spend' })).toHaveCount(0);
  // the item has no execution rows, so the sections are empty rather than read-only
  await expect(page.getByText('No commitments recorded yet.')).toBeVisible();
  await expect(page.getByText('No spend entries recorded yet.')).toBeVisible();
  const budgetCard = cardByHeading(page, 'Budget and execution');
  await expect(valueIn(budgetCard, 'Opex allocation + carry-in')).toHaveText(rp(240000000));
});

test('refuses a project created under a closed-year program @t2', async ({ page }) => {
  await page.goto('/plan/projects');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create project' }) });
  // the register still offers closed-year programs, so this refusal is reachable
  await form
    .locator('select[name="originatingProgramId"]')
    .selectOption({ label: 'PRG-2027-001 · Workplace Modernisation 2027 (FY2027, SI-01)' });
  await form.locator('input[name="name"]').fill('Closed year project attempt');
  await form.locator('input[name="startFiscalYear"]').fill(String(CLOSED_YEAR));
  await form.locator('input[name="endFiscalYear"]').fill(String(CLOSED_YEAR));
  await form.locator('input[name="allocatedBudgetFullLife"]').fill('1000000');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'The originating fiscal year is closed and read-only.' }),
  ).toContainText('The originating fiscal year is closed and read-only.');
  // the refused form keeps what was typed and nothing was created
  await expect(page.locator('input[name="name"]')).toHaveValue('Closed year project attempt');
  await expect(page.locator('tbody tr', { hasText: 'Closed year project attempt' })).toHaveCount(0);
});

// #96 (https://github.com/tahopetis/strapla/issues/96): the closed-year
// allocation update used to be refused outright. #108 (ADR-0007) makes it an
// in-place correction behind the record's own affordance — proven end to end in
// corrections.spec.ts. This browser case pins what did not change: the plain
// open-year edit disclosure never comes back, and no form is in the DOM.
test('offers a closed-year allocation only the correction affordance, never the plain edit form (#96) @t2', async ({
  page,
}) => {
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  const allocationCard = cardByHeading(page, 'FY2027 · PRG-2027-001 · Workplace Modernisation 2027');
  await expect(page.getByText('Edit allocation')).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(allocationCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
});

// #97 (https://github.com/tahopetis/strapla/issues/97): the recurring-ops void
// no longer passes `allowClosed` to the editability guard, so a closed year is
// refused on the server (proven in src/server/plan/recurring-actions.test.ts).
// The annual plan page hides the void trigger when the year is closed, and only
// the correction affordance remains, so this browser case pins the visible lock.
test('refuses a recurring-ops void in a closed year on the server (#97) @t2', async ({
  page,
}) => {
  await openAnnualPlan(page, CLOSED_YEAR);
  await expect(page.getByText(CLOSED_PLAN_NOTICE)).toBeVisible();
  const itemCard = cardByHeading(page, 'Leased lines 2027');
  await expect(itemCard.getByRole('button', { name: 'Correct record' })).toBeVisible();
  await expect(itemCard.getByRole('button', { name: 'Void item' })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});

// #98 (https://github.com/tahopetis/strapla/issues/98): a closed allocation
// stays read-only; the payment is recorded in the open year and settles the
// closed-year commitment from there. The full feature proof (both treatments,
// mixed transactions, freeze, void and the closed-year report line) lives in
// execution.spec.ts; this pins only the write-surface split.
test('settles a closed-year commitment from the open year, not on the closed allocation (#98) @t2', async ({
  page,
}) => {
  // no spend form on the closed FY2027 allocation
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Post-close settlement project' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'PC-SETTLE-PRJ-1 · Post-close settlement project' }),
  ).toBeVisible();
  const closedCard = page.locator('section').filter({ hasText: 'FY2027 · POST-CLOSE-PRG-27' });
  await closedCard.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(
    page.getByRole('heading', { name: 'FY2027 allocation · POST-CLOSE-PRG-27' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record spend' })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);

  // the open FY2028 allocation offers the closed-year commitment, marked as such
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Post-close settlement project' })
    .getByRole('link', { name: 'Open' })
    .click();
  const openCard = page
    .locator('section')
    .filter({ hasText: 'FY2028 · PRG-2028-001 · Workplace Modernisation 2028' });
  await openCard.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(
    page.getByText(/CLOSED YEAR · CAPEX · FY2027 · .*POST-CLOSE-PO-27/),
  ).toBeVisible();
});
