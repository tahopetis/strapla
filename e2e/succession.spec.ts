import { expect, test, type Page } from '@playwright/test';
import { formatDate } from '../src/lib/format';
import { withSql } from './support/db';
import { rp } from './support/money';

/**
 * Strategic plan succession (tier T4, #109 / ADR-0008).
 *
 * This is the only tier that ends the shared foundation plan, so it runs last
 * and the three tests are serial: each one starts from the state the previous
 * one left behind. The journey is the issue's e2e acceptance:
 *
 * 1. final-close the plan's end year, close the remaining open years with an
 *    explicit zero carry, then archive the plan;
 * 2. create the successor after the archived horizon, add its first initiative,
 *    activate it and create its first annual plan;
 * 3. reopen the archived plan read-only and prove every surface still resolves
 *    to the successor.
 *
 * The shared database arrives with: the plan "IT Strategic Plan 2026–2030"
 * (active, FY2026–FY2030), FY2027 closed and FY2028/FY2029/FY2030 active. The
 * pinned copy asserted here is the contract from the issue: changing it in the
 * UI must change this spec.
 */

const ARCHIVED_PLAN = 'IT Strategic Plan 2026–2030';
const SUCCESSOR_PLAN = 'IT Strategic Plan 2031–2035';
const SUCCESSOR_SI = { code: 'SUC-SI-01', name: 'Successor workplace portfolio' };

const HORIZON_REASON = 'Keep the horizon on the fiscal years that still have annual plans.';
const ARCHIVE_REASON = 'The plan delivered its horizon; the portfolio continues under the successor.';
const ACTIVATION_REASON = 'Successor plan approved by the board.';
const CLOSE_REASON = 'No approved use in the next fiscal year: nothing is carried.';
// Mirrors finalCloseReason() in src/lib/close-form.ts: the fixed reason recorded
// on every snapshot row of a plan-boundary close.
const FINAL_CLOSE_REASON =
  'Final close: FY2030 is the last year of the strategic plan. No carry-over crosses the plan boundary.';

// Pinned copy from the issue. These strings are what a user reads; they are
// assertions, not descriptions, so a reworded UI fails the tier on purpose.
const ARCHIVED_NOTICE =
  'This plan is archived and read-only. Create a successor plan to continue the portfolio.';
const ARCHIVED_PLAN_NOTICE = 'This strategic plan is archived and read-only.';
const READ_ONLY_OPENING_NOTICE = 'Read-only opening balances of an archived plan.';
const SUCCESSOR_OPENING_NOTICE =
  "Opening balances are recorded once, for the first plan. A successor plan starts without them; the first plan's signed-off figures remain readable from its archived plan page.";

/** Opens an annual plan from the register and returns its URL. */
const openAnnualPlan = async (page: Page, year: number): Promise<string> => {
  await page.goto('/plan/annual');
  await page
    .locator('tbody tr', { hasText: `FY${year}` })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: `FY${year} annual plan` })).toBeVisible();
  return page.url();
};

/** The status badge of an annual plan row on the register. */
const expectAnnualPlanStatus = async (page: Page, year: number, status: string): Promise<void> => {
  await page.goto('/plan/annual');
  await expect(
    page.locator('tbody tr', { hasText: `FY${year}` }).getByText(status, { exact: true }),
  ).toBeVisible();
};

/**
 * Closes a non-end year with a deliberate zero carry: every carry field is the
 * explicit "0" the form requires, and every not-carried reason is supplied
 * because any available amount that stays behind is recorded in the snapshot
 * (ADR-0006 §3). Throws if the close is refused.
 */
const closeYearWithZeroCarry = async (page: Page, year: number): Promise<string> => {
  const annualUrl = await openAnnualPlan(page, year);
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: `Close FY${year}` })).toBeVisible();

  const carryInputs = page.locator('input[name^="carry_"]');
  await expect(carryInputs.first()).toBeVisible();
  for (let index = 0; index < (await carryInputs.count()); index += 1) {
    await carryInputs.nth(index).fill('0');
  }
  const reasonInputs = page.locator('input[name^="not_carried_reason_"]');
  for (let index = 0; index < (await reasonInputs.count()); index += 1) {
    await reasonInputs.nth(index).fill(CLOSE_REASON);
  }
  await page.locator('input[name="reference"]').fill(`E2E-CLOSE-FY${year}`);
  await page.locator('input[name="confirmation"]').fill(`CLOSE FY${year}`);
  await page.getByRole('button', { name: `Close FY${year} and carry over` }).click();
  await expect(
    page.getByText(`Fiscal year FY${year} closed and carry-over recorded`),
  ).toBeVisible();
  return annualUrl;
};

test('final-closes the plan end year and archives the strategic plan @t4', async ({ page }) => {
  // Two full year closes, a final close and the horizon round trip rewrite much
  // of the shared plan; the default 120 s is not enough for the form filling.
  test.setTimeout(300_000);

  await page.goto('/plan/strategic');
  const headerActions = page.getByRole('group', { name: 'Page header actions' });
  await expect(headerActions.getByText('active', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan details' })).toBeVisible();

  // ------------------------------------------- horizon containment (#109 §6)
  const planDetails = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) });
  await planDetails.getByText('Edit plan', { exact: true }).click();
  const editForm = planDetails
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });

  // FY2030 already has an annual plan, so an end year of 2029 would orphan it.
  // The refusal must name the offending record, not just fail.
  await editForm.locator('input[name="endFiscalYear"]').fill('2029');
  await editForm.locator('textarea[name="reason"]').fill(HORIZON_REASON);
  await editForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(editForm.getByRole('alert')).toContainText(
    'The new horizon excludes the FY2030 annual plan.',
  );
  // A refused edit changes nothing and keeps the typed reason for a retry.
  await expect(editForm.locator('textarea[name="reason"]')).toHaveValue(HORIZON_REASON);

  // A horizon that still contains every annual plan year saves and is audited.
  // The start year stays put on purpose: it is the opening-balance bridge year,
  // so moving it after the sign-off is refused — the supported early end shrinks
  // from the end year (#109 §6–7), which is what this restores after the refusal.
  await editForm.locator('input[name="endFiscalYear"]').fill('2030');
  await editForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Strategic plan “${ARCHIVED_PLAN}” updated.`)).toBeVisible();
  await expect(page.getByText('2026–2030', { exact: true })).toBeVisible();

  const horizonAudit = await withSql(async (sql) => {
    const rows = await sql<
      { reason: string | null; start_year: string; end_year: string }[]
    >`
      select
        a.reason,
        a.after->>'startFiscalYear' as start_year,
        a.after->>'endFiscalYear' as end_year
      from audit_entries a
      join strategic_plans p on p.id::text = a.entity_id
      where a.action = 'update'
        and a.entity_type = 'strategic_plan'
        and p.name = ${ARCHIVED_PLAN}
      order by a.created_at desc
      limit 1
    `;
    return rows[0];
  });
  expect(horizonAudit?.reason).toBe(HORIZON_REASON);
  expect(horizonAudit).toMatchObject({ start_year: '2026', end_year: '2030' });

  // --------------------------------------- archive needs every year closed
  // Archive is final, so it may not freeze an open annual plan that could never
  // be closed with a carry decision (#109 §2). The refusal names the first one.
  await page.goto('/plan/strategic');
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) })
    .getByRole('button', { name: 'Archive plan' })
    .click();
  // Scope by its own title: the initiative cards also render (closed) dialogs.
  const archiveDialog = page
    .getByRole('dialog')
    .filter({ hasText: 'Archive the strategic plan?' });
  await expect(archiveDialog).toBeVisible();
  await archiveDialog.locator('textarea[name="reason"]').fill(ARCHIVE_REASON);
  await archiveDialog.getByRole('button', { name: 'Archive plan' }).click();
  await expect(archiveDialog.getByRole('alert')).toContainText(
    'Every annual plan must be closed before the strategic plan is archived: FY2028 is still active.',
  );
  await archiveDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('group', { name: 'Page header actions' }).getByText('active', { exact: true })).toBeVisible();

  // ------------------------- close FY2028 and FY2029 with an explicit zero carry
  await closeYearWithZeroCarry(page, 2028);
  await expectAnnualPlanStatus(page, 2028, 'closed');
  await closeYearWithZeroCarry(page, 2029);
  await expectAnnualPlanStatus(page, 2029, 'closed');

  // ------------------------------- FY2030 is the end year: the final close
  const fy2030Url = await openAnnualPlan(page, 2030);
  await page.getByRole('link', { name: 'Close fiscal year' }).click();
  await expect(page.getByRole('heading', { name: 'Close FY2030' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Final close', exact: true })).toBeVisible();
  // There is no carry decision at the plan boundary: no carry amounts, target
  // programs or per-row reasons are rendered, and the fixed reason is stated.
  await expect(page.locator('input[name^="carry_"]')).toHaveCount(0);
  await expect(page.locator('select[name^="target_program_"]')).toHaveCount(0);
  await expect(page.locator('input[name^="not_carried_reason_"]')).toHaveCount(0);
  await expect(page.getByText(FINAL_CLOSE_REASON, { exact: true })).toBeVisible();

  await page.locator('input[name="reference"]').fill('E2E-CLOSE-FY2030');
  await page.locator('input[name="confirmation"]').fill('CLOSE FY2030');
  await page.getByRole('button', { name: /^Close FY2030 as the final close$/ }).click();
  await expect(
    page.getByText(/Fiscal year FY2030 closed as the final close: no carry-over, \d+ snapshot rows\./),
  ).toBeVisible();

  // The close page keeps the immutable snapshot: every available amount is
  // carried as zero and left behind with the plan-boundary reason.
  await page.goto(`${fy2030Url}/close`);
  await expect(page.getByRole('heading', { name: 'Fiscal year closed' })).toBeVisible();
  const snapshotCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Close snapshot' }) });
  const snapshotRows = snapshotCard.locator('tbody tr');
  const snapshotCount = await snapshotRows.count();
  expect(snapshotCount).toBeGreaterThan(0);
  for (let index = 0; index < snapshotCount; index += 1) {
    // columns: entity, component, available, carried, not carried, reason, targets
    await expect(snapshotRows.nth(index).getByRole('cell').nth(3)).toHaveText(rp(0));
  }
  await expect(snapshotCard.getByText(FINAL_CLOSE_REASON).first()).toBeVisible();
  // No carry-over entry is written: nothing crosses the plan boundary.
  await expect(page.getByText('No carry-over entries were recorded at close.')).toBeVisible();

  // The ledger/snapshot invariants still hold in the database (ADR-0006 §3):
  // carried is zero everywhere, available = carried + not carried, every row
  // carries the fixed reason, and the plan-boundary close wrote no receipt.
  const planId = fy2030Url.split('/').pop() ?? '';
  expect(planId).toMatch(/^[0-9a-f-]{36}$/);
  const finalClose = await withSql(async (sql) => {
    const [snapshots] = await sql<
      { snapshots: number; carried_zero: boolean; balanced: boolean; reasoned: boolean }[]
    >`
      select
        count(*)::int as snapshots,
        coalesce(bool_and(carried = 0), false) as carried_zero,
        coalesce(bool_and(available = carried + not_carried), false) as balanced,
        coalesce(bool_and(not_carried_reason = ${FINAL_CLOSE_REASON}), false) as reasoned
      from close_snapshots
      where annual_plan_id = ${planId}
    `;
    const [receipts] = await sql<{ receipts: number }[]>`
      select count(*)::int as receipts
      from carry_over_entries
      where source_annual_plan_id = ${planId}
    `;
    return {
      ...(snapshots ?? {
        snapshots: 0,
        carried_zero: false,
        balanced: false,
        reasoned: false,
      }),
      receipts: receipts?.receipts ?? 0,
    };
  });
  expect(finalClose.snapshots).toBeGreaterThan(0);
  expect(finalClose).toMatchObject({
    carried_zero: true,
    balanced: true,
    reasoned: true,
    receipts: 0,
  });

  // ------------------------------------------------------------- archive
  await page.goto('/plan/strategic');
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) })
    .getByRole('button', { name: 'Archive plan' })
    .click();
  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: 'Archive the strategic plan?' });
  await expect(dialog).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill(ARCHIVE_REASON);
  await dialog.getByRole('button', { name: 'Archive plan' }).click();
  await expect(page.getByText(`Strategic plan “${ARCHIVED_PLAN}” archived.`)).toBeVisible();

  // The archived plan is read-only on its page, and the create card returns:
  // with no active or draft plan a successor can be created (#109 §3).
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create the successor plan' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Page header actions' }).getByText('archived', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive plan' })).toHaveCount(0);
  await expect(page.getByText('Edit plan', { exact: true })).toHaveCount(0);
  // The successor create card is the only form left: the archived plan itself
  // offers no write control.
  await expect(page.locator('main form')).toHaveCount(1);

  // Between the archive and the successor the archived plan stays visible
  // read-only with the prompt to continue the portfolio (issue §4).
  await page.goto('/plan');
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();
});

test('creates the successor plan, activates it and opens its first annual plan @t4', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // ------------------------------------------- the successor create affordance
  await page.goto('/plan/strategic');
  await expect(page.getByRole('heading', { name: 'Create the successor plan' })).toBeVisible();
  const createCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Create the successor plan', exact: true }) });
  const createForm = createCard.locator('form');
  // The card defaults to the first year after the most recent archived horizon.
  await expect(createForm.locator('input[name="startFiscalYear"]')).toHaveValue('2031');
  await expect(createForm.locator('input[name="endFiscalYear"]')).toHaveValue('2035');

  // A horizon that overlaps the archived plan is refused and names the boundary:
  // no fiscal year may be owned by two plans (#109 §3).
  await createForm.locator('input[name="name"]').fill(SUCCESSOR_PLAN);
  await createForm.locator('input[name="startFiscalYear"]').fill('2030');
  await createForm.locator('input[name="endFiscalYear"]').fill('2034');
  await createForm.getByRole('button', { name: 'Create plan' }).click();
  await expect(createForm.getByRole('alert')).toContainText(
    'The successor plan must start after FY2030, the end of “IT Strategic Plan 2026–2030”.',
  );
  // Nothing was created: the current plan is still the archived one.
  await expect(page.getByRole('heading', { name: SUCCESSOR_PLAN, exact: true })).toHaveCount(0);
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();

  // The disjoint horizon creates the successor as a draft.
  await createForm.locator('input[name="startFiscalYear"]').fill('2031');
  await createForm.locator('input[name="endFiscalYear"]').fill('2035');
  await createForm.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText(`Strategic plan “${SUCCESSOR_PLAN}” created.`)).toBeVisible();
  const headerActions = page.getByRole('group', { name: 'Page header actions' });
  await expect(headerActions.getByText('draft', { exact: true })).toBeVisible();

  // With a successor present the non-archived plan is the current plan on every
  // surface that names one (#109 §4) — and it carries none of the archived data.
  await page.goto('/plan/strategic');
  const planDetails = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) });
  await expect(planDetails.getByText(SUCCESSOR_PLAN, { exact: true })).toBeVisible();
  await expect(page.getByText(ARCHIVED_NOTICE)).toHaveCount(0);

  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: SUCCESSOR_PLAN, exact: true })).toBeVisible();
  await expect(page.getByText(ARCHIVED_PLAN, { exact: true })).toHaveCount(0);

  await page.goto('/dashboard');
  await expect(
    page.getByText(`Portfolio health for ${SUCCESSOR_PLAN} · fiscal years 2031–2035`),
  ).toBeVisible();
  await expect(page.getByText(`Portfolio health for ${ARCHIVED_PLAN}`)).toHaveCount(0);

  // ------------------------------------------- first initiative, then activate
  // A draft starts empty; the first activity is the initiative that carries the
  // successor's envelope.
  await page.goto('/plan/strategic');
  const initiativeForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });
  await initiativeForm.locator('input[name="code"]').fill(SUCCESSOR_SI.code);
  await initiativeForm.locator('input[name="name"]').fill(SUCCESSOR_SI.name);
  await initiativeForm.locator('input[name="envelopeCapex"]').fill('2000000000');
  await initiativeForm.locator('input[name="envelopeOpex"]').fill('500000000');
  await initiativeForm.locator('input[name="priorCapex"]').fill('0');
  await initiativeForm.locator('input[name="priorOpex"]').fill('0');
  await initiativeForm.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText(`Strategic initiative ${SUCCESSOR_SI.code} created.`)).toBeVisible();

  // Activation lives in the page header and is audited with its reason (BR-1:
  // exactly one active plan, and the archived one is no longer active).
  const activation = page.getByRole('group', { name: 'Page header actions' }).locator('form');
  await activation.locator('textarea[name="reason"]').fill(ACTIVATION_REASON);
  await activation.getByRole('button', { name: 'Activate plan' }).click();
  await expect(page.getByText(`Strategic plan “${SUCCESSOR_PLAN}” activated.`)).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Page header actions' }).getByText('active', { exact: true }),
  ).toBeVisible();

  // ------------------------------------------- the successor's first year
  // Annual plans live inside the plan horizon; the successor's own first year is
  // FY2031. The archived plan's years are not the current plan's register.
  await page.goto('/plan/annual');
  await expect(page.getByText(`Fiscal years 2031–2035 of ${SUCCESSOR_PLAN}`)).toBeVisible();
  const annualForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create annual plan' }) });
  await annualForm.locator('select[name="fiscalYear"]').selectOption('2031');
  await annualForm.getByRole('button', { name: 'Create annual plan' }).click();
  await expect(page.getByText('Annual plan FY2031 created.')).toBeVisible();
  const annualRow = page.locator('tbody tr', { hasText: 'FY2031' });
  await expect(annualRow).toBeVisible();
  await expect(annualRow.getByText('draft', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr', { hasText: 'FY2027' })).toHaveCount(0);

  // --------------------------------------- opening balances stay first-plan-only
  // The import and the sign-off are not offered for a successor; the page states
  // where the first plan's signed-off figures still live (#109 §7).
  await page.goto('/plan/opening-balances');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Opening balances', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(SUCCESSOR_OPENING_NOTICE)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening import' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the import wizard' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign off opening balances' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save control totals' })).toHaveCount(0);
  await expect(page.getByText('No control totals were recorded for this plan.')).toBeVisible();
  // A successor accepts no opening-balance write at all: no form is rendered.
  await expect(page.locator('main form')).toHaveCount(0);
  // The notice points at the archived plans list where the first plan lives.
  await expect(page.getByRole('link', { name: 'Archived plans' }).first()).toBeVisible();
});

test('reopens the archived plan read-only while every surface uses the successor @t4', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // The archive record is the status-change audit entry itself: the list's date
  // and reason must agree with it (#109 §5). This is a direct database read
  // because the page is only a view of that append-only record.
  const archiveEntry = await withSql(async (sql) => {
    const rows = await sql<
      { plan_id: string; created_at: Date; reason: string | null }[]
    >`
      select p.id as plan_id, a.created_at, a.reason
      from audit_entries a
      join strategic_plans p on p.id::text = a.entity_id
      where a.action = 'status_change'
        and a.entity_type = 'strategic_plan'
        and a.after->>'status' = 'archived'
        and p.name = ${ARCHIVED_PLAN}
      order by a.created_at desc
      limit 1
    `;
    return rows[0];
  });
  if (!archiveEntry) {
    throw new Error(`No status-change audit entry archived ${ARCHIVED_PLAN}.`);
  }
  expect(archiveEntry.reason).toBe(ARCHIVE_REASON);
  const planId = archiveEntry.plan_id;
  // The same formatter the page uses (en-GB, Asia/Jakarta, 2-digit day/month):
  // the list cell must show exactly this calendar date.
  const archivedOn = formatDate(archiveEntry.created_at);

  // ------------------------------------------------------- the archived list
  await page.goto('/plan/strategic/archived');
  await expect(page.getByRole('heading', { name: 'Archived plans', exact: true })).toBeVisible();
  const archivedRow = page.locator('tbody tr', { hasText: ARCHIVED_PLAN });
  await expect(archivedRow).toHaveCount(1);
  // The horizon the plan ended with: the validated edit in the first test kept the
  // start year and restored the end year.
  await expect(archivedRow).toContainText('2026–2030');
  // columns: name, horizon, archived (dd/mm/yyyy), reason
  await expect(archivedRow.getByRole('cell').nth(2)).toHaveText(archivedOn);
  await expect(archivedRow).toContainText(ARCHIVE_REASON);

  // The name opens the plan's own read-only page.
  const archivedLink = archivedRow.getByRole('link', { name: ARCHIVED_PLAN, exact: true });
  await expect(archivedLink).toHaveAttribute('href', `/plan/strategic/${planId}`);
  await archivedLink.click();
  await expect(
    page.getByRole('heading', { level: 1, name: ARCHIVED_PLAN, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Archived strategic plan, read-only')).toBeVisible();
  await expect(page.getByText(ARCHIVED_PLAN_NOTICE)).toBeVisible();

  const archivedDetails = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) });
  await expect(archivedDetails.getByText(archivedOn, { exact: true })).toBeVisible();
  await expect(archivedDetails.getByText(ARCHIVE_REASON, { exact: true })).toBeVisible();

  // Its initiatives stay readable with their envelope figures: the archived
  // plan's history, not the successor's plan.
  await expect(page.getByText('SI-01 · Digital Workplace', { exact: true })).toBeVisible();
  await expect(page.getByText(rp(4_000_000_000)).first()).toBeVisible();
  await expect(page.getByText(rp(1_000_000_000)).first()).toBeVisible();

  // Its annual plans link into the existing read-only annual pages.
  const annualCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Annual plans', exact: true }) });
  for (const year of [2027, 2028, 2029, 2030]) {
    await expect(annualCard.getByRole('link', { name: `FY${year} annual plan` })).toHaveAttribute(
      'href',
      /^\/plan\/annual\/[0-9a-f-]+$/,
    );
  }

  // Its programs and projects stay navigable: each opens its existing read-only
  // page, and a project opens its allocations (#109 §5).
  const deliveryCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Programs and projects' }) });
  await expect(
    deliveryCard.getByRole('link', { name: 'PRG-2027-001 · Workplace Modernisation 2027' }),
  ).toHaveAttribute('href', /^\/plan\/programs\/[0-9a-f-]+$/);
  await expect(
    deliveryCard.getByRole('link', { name: 'PRJ-2027-001 · Device Refresh 2027' }),
  ).toHaveAttribute('href', /^\/plan\/projects\/[0-9a-f-]+$/);

  // An archived plan offers no write control of any kind.
  await expect(
    page.locator('main').getByRole('button', { name: /^(Add|Edit|Archive|Void|Save|Create)\b/ }),
  ).toHaveCount(0);
  await expect(page.getByText('Edit plan', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Add initiative', { exact: true })).toHaveCount(0);
  // The read-only page is data only: no form can write against the plan.
  await expect(page.locator('main form')).toHaveCount(0);

  // ------------------------------------------------- the read-only annual plan
  await annualCard.getByRole('link', { name: 'FY2027 annual plan' }).click();
  await expect(page.getByRole('heading', { name: 'FY2027 annual plan' })).toBeVisible();
  await expect(
    page.getByText(
      'This fiscal year is closed and the strategic plan is archived; the page is read-only.',
    ),
  ).toBeVisible();
  await expect(page.locator('main').getByRole('button', { name: 'Add program' })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Void program' })).toHaveCount(0);

  // ------------------------------------- the first plan's opening balances
  // Opening balances are recorded once, for the first plan: the archived plan
  // links its signed-off figures read-only, and there is no form to change them.
  await page.goto(`/plan/strategic/${planId}`);
  const openingLink = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Plan details', exact: true }) })
    .getByRole('link', { name: 'Opening balances', exact: true });
  await expect(openingLink).toHaveAttribute('href', `/plan/opening-balances?plan=${planId}`);
  await openingLink.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Opening balances', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(READ_ONLY_OPENING_NOTICE)).toBeVisible();
  const totalsCard = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Control totals and sign-off' }) });
  await expect(totalsCard.getByText('signed off', { exact: true })).toBeVisible();
  await expect(totalsCard.getByText(/E2E opening balances sign-off/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening import' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the import wizard' })).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);

  // ------------------------------------------------- reports use the successor
  // Reports resolve the current plan, so the archived plan's initiatives and
  // programs must not appear and the successor's must.
  await page.goto('/reports/si-five-year');
  await expect(page.getByRole('heading', { name: 'SI five-year view', exact: true })).toBeVisible();
  await expect(
    page.getByText(`IT Strategic Plan 2031–2035 · fiscal years 2031–2035`),
  ).toBeVisible();
  await expect(page.getByText(SUCCESSOR_SI.code, { exact: true })).toBeVisible();
  await expect(page.getByText('SI-01', { exact: true })).toHaveCount(0);
  await expect(page.getByText(ARCHIVED_PLAN, { exact: true })).toHaveCount(0);

  await page.goto('/reports/annual-plan');
  await expect(page.getByRole('heading', { name: 'Annual plan by SI and program' })).toBeVisible();
  await expect(
    page.getByText(`IT Strategic Plan 2031–2035 · fiscal years 2031–2035`),
  ).toBeVisible();
  await expect(page.getByText('PRG-2027-001')).toHaveCount(0);
  await expect(page.getByText(ARCHIVED_PLAN, { exact: true })).toHaveCount(0);

  // No route still calls the archived plan the current plan (#109 §4).
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: SUCCESSOR_PLAN, exact: true })).toBeVisible();
  await expect(page.getByText(ARCHIVED_PLAN, { exact: true })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(
    page.getByText(`Portfolio health for ${SUCCESSOR_PLAN} · fiscal years 2031–2035`),
  ).toBeVisible();
  await page.goto('/plan/annual');
  await expect(page.getByText(`Fiscal years 2031–2035 of ${SUCCESSOR_PLAN}`)).toBeVisible();
});
