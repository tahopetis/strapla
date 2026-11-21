import { expect, test, type Locator, type Page } from '@playwright/test';
import { rp } from './support/money';

/**
 * Closed year (tier T2): FY2027 was closed by the foundation, so every write
 * path against it must refuse or be hidden. This file pins the read-only
 * notices, the absence of write forms on the annual plan, the project, the
 * project year allocation and the recurring ops item, the one server refusal a
 * browser can still reach (a project created under a closed-year program), and
 * the closed-year summary on the close page so the year cannot be closed twice.
 *
 * Three known server gaps are recorded as `test.fixme`: the UI hides the
 * affordance, so a browser can only assert the visible lock. They are tracked at
 *   #96 allocation update closed-year guard
 *   #97 recurring-ops void allowClosed
 *   #98 dead post-close spend branch
 * and the missing guards need an action-level test, not a faked browser path.
 *
 * Prerequisite: the foundation journey has run (FY2027 closed by "E2E-CLOSE-FY2027",
 * FY2028 active).
 */

const CLOSED_YEAR = 2027;
const CLOSE_REFERENCE = 'E2E-CLOSE-FY2027';

const openAnnualPlan = async (page: Page, year: number): Promise<void> => {
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: `FY${year}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
};

/** The dd that follows one dt, inside one already-scoped section. */
const valueIn = (section: Locator, dtLabel: string) =>
  section.locator('dl > div').filter({ hasText: dtLabel }).locator('dd');

test('the closed FY2027 annual plan is read-only @t2', async ({ page }) => {
  await page.goto('/plan/annual');
  await expect(page.locator('tbody tr', { hasText: `FY${CLOSED_YEAR}` }).getByText('closed')).toBeVisible();

  await page.locator('tbody tr', { hasText: `FY${CLOSED_YEAR}` }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `FY${CLOSED_YEAR} annual plan` })).toBeVisible();
  // the page says it and offers nothing to write with
  await expect(page.getByText('This fiscal year is closed and read-only.')).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add program' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add recurring ops item' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void program' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void item' })).toHaveCount(0);
  await expect(page.getByText('Edit program')).toHaveCount(0);
  await expect(page.getByText('Edit item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Activate annual plan' })).toHaveCount(0);
  // the close link is only rendered for an active plan
  await expect(page.getByRole('link', { name: 'Close fiscal year' })).toHaveCount(0);
  // the closed year still lists what it contains
  await expect(page.getByText('PRG-2027-001 · Workplace Modernisation 2027')).toBeVisible();
  await expect(page.getByText('Leased lines 2027')).toBeVisible();

  // the close page reports the closed year and has no close form, so it cannot
  // be closed twice: close-actions.ts answers "This fiscal year is already
  // closed." on the server, but the form that would send it is not rendered.
  const planPath = new URL(page.url()).pathname;
  await page.goto(`${planPath}/close`);
  await expect(page.getByRole('heading', { name: `Close FY${CLOSED_YEAR}` })).toBeVisible();
  const closedCard = page.locator('section').filter({ hasText: 'Fiscal year closed' });
  await expect(closedCard.getByText('closed', { exact: true })).toBeVisible();
  await expect(valueIn(closedCard, 'Approval reference')).toHaveText(CLOSE_REFERENCE);
  await expect(
    closedCard.locator('tbody tr', { hasText: CLOSE_REFERENCE }).getByText(rp(100000000)),
  ).toBeVisible();
  await expect(page.locator('input[name="confirmation"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Close FY${CLOSED_YEAR} and carry over` })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});

test('the closed FY2027 project and its allocation are read-only @t2', async ({ page }) => {
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

  // the allocation execution page shows the figures but no entry forms
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
  await expect(page.getByText('read-only', { exact: true }).first()).toBeVisible();

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

test('the closed FY2027 recurring ops item is read-only @t2', async ({ page }) => {
  await openAnnualPlan(page, CLOSED_YEAR);
  const card = page.locator('section').filter({ hasText: 'Leased lines 2027' });
  await card.getByRole('link', { name: 'Open commitments & spend' }).click();
  await expect(page.getByRole('heading', { name: `FY${CLOSED_YEAR} · Leased lines 2027` })).toBeVisible();

  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record spend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void commitment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void spend' })).toHaveCount(0);
  // the item has no execution rows, so the sections are empty rather than read-only
  await expect(page.getByText('No commitments recorded yet.')).toBeVisible();
  await expect(page.getByText('No spend entries recorded yet.')).toBeVisible();
  const budgetCard = page.locator('section').filter({ hasText: 'Budget and execution' });
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

  await expect(page.getByRole('alert')).toContainText(
    'The originating fiscal year is closed and read-only.',
  );
  // the refused form keeps what was typed and nothing was created
  await expect(page.locator('input[name="name"]')).toHaveValue('Closed year project attempt');
  await expect(page.locator('tbody tr', { hasText: 'Closed year project attempt' })).toHaveCount(0);
});

// #96 (https://github.com/tahopetis/strapla/issues/96): the allocation UPDATE
// action never checks whether the allocation's annual plan is closed — only the
// void action does. The project page hides the edit form because the project's
// originating year is closed, so the browser can pin the visible lock only; the
// missing server guard needs an action-level test.
test.fixme('refuses an allocation update in a closed year on the server (#96) @t2', async ({
  page,
}) => {
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: 'PRJ-2027-001 · Device Refresh 2027' })).toBeVisible();
  // the visible lock: there is no allocation edit form to submit
  await expect(page.getByText('Edit allocation')).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});

// #97 (https://github.com/tahopetis/strapla/issues/97): voidItem passes
// `allowClosed: true`, so a recurring-ops void is accepted on the server for a
// closed year. The annual plan page hides the void trigger when the year is
// closed, so only the visible lock can be asserted here.
test.fixme('refuses a recurring-ops void in a closed year on the server (#97) @t2', async ({
  page,
}) => {
  await openAnnualPlan(page, CLOSED_YEAR);
  await expect(page.getByText('This fiscal year is closed and read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void item' })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});

// #98 (https://github.com/tahopetis/strapla/issues/98): the post-close branch in
// createSpend ("only spend entries settling existing commitments can be
// recorded") is unreachable because requireEditable() throws first. Both paths
// refuse, so the browser can only assert that a closed allocation offers no
// spend form; the dead branch needs an action-level test.
test.fixme('refuses a post-close spend on a closed allocation (#98) @t2', async ({ page }) => {
  await page.goto('/plan/projects');
  await page
    .locator('tbody tr', { hasText: 'Device Refresh 2027' })
    .getByRole('link', { name: 'Open' })
    .click();
  await page.getByRole('link', { name: 'Open commitments & spend' }).first().click();
  await expect(
    page.getByRole('heading', { name: `FY${CLOSED_YEAR} allocation · PRG-2027-001` }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record spend' })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
});
