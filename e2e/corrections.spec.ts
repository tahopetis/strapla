import { expect, test, type Locator, type Page } from '@playwright/test';
import { rp } from './support/money';

/**
 * Closed-year audited corrections (#108, ADR-0007) on the live product.
 *
 * The foundation journey closed FY2027 (`E2E-CLOSE-FY2027`) and left FY2028
 * active, so the records this file corrects are governed by a closed annual
 * plan. A correction is an in-place update of a record that already exists,
 * behind the `Correct record` affordance and with a mandatory reason; the save
 * is audited under the `correction` action (never `update`), and the close
 * snapshot, the carry-over ledger and the carry-in caches are never written by
 * one. The live figures move, the snapshot stays the historical record.
 *
 * The two money records are foundation fixtures, chosen so the corrected
 * figures belong to no other spec's assertions:
 * - `POST-CLOSE-PRG-27` is the FY2027 program the close fixture created with a
 *   100,000,000 capex budget and no carry-in (plan-happy-path.spec.ts, "the
 *   post-close settlement fixture").
 * - its FY2027 allocation for `PC-SETTLE-PRJ-1` is 80,000,000 capex, and the
 *   project carries one open commitment of 30,000,000 (`POST-CLOSE-PO-27`).
 * - the close carried nothing out of that program (every carry field was
 *   zeroed and only PRG-2027-001 carried 100,000,000), so the frozen snapshot
 *   row reads available 100,000,000 − 80,000,000 = 20,000,000.
 *
 * The corrections take the program budget to 120,000,000 and the allocation to
 * 90,000,000, so the live figures are 30,000,000 unallocated in the program
 * (120,000,000 − 90,000,000) and 60,000,000 remaining on the allocation
 * (90,000,000 − 30,000,000 open commitment). Those are the figures the two
 * reports and the CSV must show while the close receipt keeps the frozen
 * 20,000,000 and the carry-over receipts keep the 100,000,000 the close wrote.
 *
 * The tests share the database and run in order (the suite is serial), so the
 * first test makes the corrections and the later ones read them back.
 */

const CLOSED_YEAR = 2027;
const CLOSE_REFERENCE = 'E2E-CLOSE-FY2027';
const CLOSED_PLAN_HEADING = `FY${CLOSED_YEAR} annual plan`;

const PROGRAM = { code: 'POST-CLOSE-PRG-27', name: 'Post-close settlement programme' } as const;
const PROJECT = { code: 'PC-SETTLE-PRJ-1', name: 'Post-close settlement project' } as const;
const PROGRAM_LABEL = `${PROGRAM.code} · ${PROGRAM.name}`;
const PROJECT_LABEL = `${PROJECT.code} · ${PROJECT.name}`;
const ALLOCATION_CARD_TITLE = `FY${CLOSED_YEAR} · ${PROGRAM.code} · ${PROGRAM.name}`;
/** The label the correction lists give the allocation (correction-queries.ts). */
const ALLOCATION_LABEL = `FY${CLOSED_YEAR} allocation · ${PROGRAM.code}`;

const PROGRAM_REASON = 'Correct the closed-year programme budget.';
const ALLOCATION_REASON = 'Correct the closed-year allocation.';
const PROJECT_REASON = 'Correct the closed-year project owner.';
const CORRECTED_PROJECT_OWNER = 'IT Infrastructure Lead (corrected)';

// The fixed UI copy of #108 (contract, "Fixed UI copy" — do not paraphrase).
const CORRECTION_BANNER =
  'This fiscal year is closed. Saving is recorded as a correction after close, and the close snapshot does not change.';
const CLOSED_PLAN_NOTICE =
  'This fiscal year is closed. Figures can still be corrected with a reason; every correction is audited and the close snapshot stays frozen.';
const CORRECTIONS_TITLE = 'Corrections after close';
const RECEIPT_NOTICE_DESCRIPTION =
  'The close snapshot above is frozen. These records were corrected after the close and are shown at their live figures.';
const CORRECTED_AFTER_CLOSE = 'Corrected after close';
const REPORT_FOOTNOTE =
  'Rows marked corrected after close rest on a record corrected after the year closed. The figures shown are the live corrected figures; the close snapshot remains the historical record.';

/** The foundation figures the corrections start from (see the file header). */
const PROGRAM_CAPEX_FOUNDATION = 100_000_000;
const ALLOCATION_CAPEX_FOUNDATION = 80_000_000;
const OPEN_COMMITMENT = 30_000_000;
/** Frozen at the close: the program's unallocated capex, 100,000,000 − 80,000,000. */
const PROGRAM_FROZEN_AVAILABLE = PROGRAM_CAPEX_FOUNDATION - ALLOCATION_CAPEX_FOUNDATION;
/** Carried out of the closed year (every carry field was zero except PRG-2027-001). */
const CLOSED_YEAR_CARRIED = 100_000_000;

/** What the corrections set, and the live figures they produce. */
const PROGRAM_CAPEX_CORRECTED = 120_000_000;
const ALLOCATION_CAPEX_CORRECTED = 90_000_000;
const PROGRAM_LIVE_UNALLOCATED = PROGRAM_CAPEX_CORRECTED - ALLOCATION_CAPEX_CORRECTED;
const ALLOCATION_REMAINING = ALLOCATION_CAPEX_CORRECTED - OPEN_COMMITMENT;

/** The `<section>` a Card renders, found by its heading, so page copy cannot match. */
const cardByHeading = (page: Page, name: string): Locator =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });

const openClosedAnnualPlan = async (page: Page): Promise<void> => {
  await page.goto('/plan/annual');
  await page
    .locator('tbody tr', { hasText: `FY${CLOSED_YEAR}` })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(page.getByRole('heading', { name: CLOSED_PLAN_HEADING })).toBeVisible();
};

const openProject = async (page: Page): Promise<void> => {
  await page.goto('/plan/projects');
  await page.locator('tbody tr', { hasText: PROJECT.name }).getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: PROJECT_LABEL })).toBeVisible();
};

const ddValue = (section: Locator, dtLabel: string): Locator =>
  section.locator('dl > div').filter({ hasText: dtLabel }).locator('dd');

// ------------------------------------------------------------------- CSV readback

interface CsvTable {
  readonly columns: string[];
  readonly rows: string[][];
}

/** One CSV line split into fields, honouring the quoted fields the export writes. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character !== '"') {
        value += character;
        continue;
      }
      if (line[index + 1] === '"') {
        value += '"';
        index += 1;
        continue;
      }
      quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ',') {
      fields.push(value);
      value = '';
      continue;
    }
    value += character;
  }
  fields.push(value);
  return fields;
}

/**
 * The exported CSV table whose header carries every given column. The export
 * writes a blank line before each table name and at the end, so the rows of one
 * table are the contiguous lines after its header.
 */
function csvTable(csv: string, requiredColumns: readonly string[]): CsvTable {
  const lines = csv.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const columns = csvFields(lines[index] ?? '');
    if (!requiredColumns.every((column) => columns.includes(column))) continue;
    const rows: string[][] = [];
    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
      const line = lines[rowIndex] ?? '';
      if (line === '') break;
      rows.push(csvFields(line));
    }
    return { columns, rows };
  }
  throw new Error(`The export has no table with the columns: ${requiredColumns.join(', ')}.`);
}

/** The exported row whose cells match every given column value. */
function csvRow(table: CsvTable, match: Readonly<Record<string, string>>): string[] {
  const row = table.rows.find((cells) =>
    Object.entries(match).every(
      ([column, value]) => cells[table.columns.indexOf(column)] === value,
    ),
  );
  expect(row, `the exported row ${JSON.stringify(match)}`).toBeTruthy();
  if (!row) throw new Error(`The export has no row matching ${JSON.stringify(match)}.`);
  return row;
}

/** One cell of an exported row, by its column header. */
function csvCell(
  table: CsvTable,
  row: readonly string[],
  column: string,
): string | undefined {
  return row[table.columns.indexOf(column)];
}

const fetchCsv = async (page: Page, path: string): Promise<string> => {
  const response = await page.request.get(path);
  expect(response.status(), `GET ${path}`).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  return response.text();
};

/**
 * The correction workflow: corrects the FY2027 program budget, its allocation
 * and the project metadata, and pins the reason requirement, the badges, the
 * frozen revision register and the closed plan's corrections card.
 */
test('corrects closed-year records in place with a reason, and the records show it @t2', async ({
  page,
}) => {
  // -------------------------------------------------- the closed read-only frame
  await openClosedAnnualPlan(page);
  await expect(page.getByText(CLOSED_PLAN_NOTICE)).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
  // the corrections card is only rendered once the plan has a correction
  await expect(page.getByRole('heading', { name: CORRECTIONS_TITLE, exact: true })).toHaveCount(0);

  // The program budget starts at the foundation figure and carries no marker.
  const programCard = cardByHeading(page, PROGRAM_LABEL);
  await expect(programCard).toContainText(rp(PROGRAM_CAPEX_FOUNDATION));
  await expect(programCard).toContainText(rp(ALLOCATION_CAPEX_FOUNDATION));
  await expect(programCard).toContainText(rp(PROGRAM_FROZEN_AVAILABLE));
  await expect(programCard.getByText(CORRECTED_AFTER_CLOSE, { exact: true })).toHaveCount(0);

  // ------------------------------------------- program budget: the reason gate
  await programCard.getByRole('button', { name: 'Correct record' }).click();
  await expect(programCard.getByText(CORRECTION_BANNER)).toBeVisible();
  const programForm = programCard.locator('form');
  await expect(programForm).toBeVisible();

  // The reason is required. The browser blocks an empty submit (the field is
  // `required`); a request that reaches the server without one is refused too,
  // so the form stays open and no success message appears.
  const reasonField = programForm.locator('textarea[name="reason"]');
  await expect(reasonField).toHaveAttribute('required', '');
  await reasonField.evaluate((element) => element.removeAttribute('required'));
  await programForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(programForm.getByText('Reason for change is required.')).toBeVisible();
  await expect(programCard.getByText(CORRECTION_BANNER)).toBeVisible();
  await expect(page.getByText(`Annual program ${PROGRAM.code} updated.`)).toHaveCount(0);

  // A too-short reason passes the schema but not the correction guard (ADR-0007
  // §5): the refusal is the form message, not a saved record.
  await programForm.locator('textarea[name="reason"]').fill('ok');
  await programForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    programCard
      .getByRole('alert')
      .filter({ hasText: 'Give a reason for a correction after close.' }),
  ).toBeVisible();
  await expect(page.getByText(`Annual program ${PROGRAM.code} updated.`)).toHaveCount(0);

  // The corrected save is in place: same form, mandatory reason, no revision.
  await programForm.locator('input[name="capexBudget"]').fill(String(PROGRAM_CAPEX_CORRECTED));
  await programForm.locator('textarea[name="reason"]').fill(PROGRAM_REASON);
  await programForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Annual program ${PROGRAM.code} updated.`)).toBeVisible();

  await expect(page.getByRole('heading', { name: CLOSED_PLAN_HEADING })).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);
  const correctedProgramCard = cardByHeading(page, PROGRAM_LABEL);
  await expect(
    correctedProgramCard.getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(correctedProgramCard).toContainText(rp(PROGRAM_CAPEX_CORRECTED));
  await expect(correctedProgramCard).toContainText(
    rp(PROGRAM_CAPEX_CORRECTED - ALLOCATION_CAPEX_FOUNDATION),
  );
  // A closed-year program budget is corrected in place, never by a revision.
  await expect(
    page
      .getByRole('group', { name: 'Page header actions' })
      .getByText('0 revisions', { exact: true }),
  ).toBeVisible();

  // The closed plan now names the correction, its reason and the record.
  const correctionsCard = cardByHeading(page, CORRECTIONS_TITLE);
  await expect(correctionsCard).toBeVisible();
  await expect(correctionsCard.getByText('1', { exact: true })).toBeVisible();
  await expect(correctionsCard.getByRole('link', { name: PROGRAM_LABEL })).toBeVisible();
  await expect(correctionsCard.getByRole('link', { name: PROGRAM_LABEL })).toHaveAttribute(
    'href',
    /^\/plan\/annual\/[0-9a-f-]+$/,
  );
  await expect(correctionsCard.getByText(PROGRAM_REASON)).toBeVisible();

  // --------------------------------------- the allocation: the same disclosure
  await openProject(page);
  const allocationCard = cardByHeading(page, ALLOCATION_CARD_TITLE);
  await expect(allocationCard).toContainText(rp(ALLOCATION_CAPEX_FOUNDATION));
  await expect(allocationCard).toContainText(rp(ALLOCATION_CAPEX_FOUNDATION - OPEN_COMMITMENT));
  await expect(allocationCard.getByText(CORRECTED_AFTER_CLOSE, { exact: true })).toHaveCount(0);
  await allocationCard.getByRole('button', { name: 'Correct record' }).click();
  await expect(allocationCard.getByText(CORRECTION_BANNER)).toBeVisible();
  const allocationForm = allocationCard.locator('form');
  await allocationForm
    .locator('input[name="allocationCapex"]')
    .fill(String(ALLOCATION_CAPEX_CORRECTED));
  await allocationForm.locator('textarea[name="reason"]').fill(ALLOCATION_REASON);
  await allocationForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Project year allocation FY${CLOSED_YEAR} updated.`)).toBeVisible();

  const correctedAllocationCard = cardByHeading(page, ALLOCATION_CARD_TITLE);
  await expect(
    correctedAllocationCard.getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(correctedAllocationCard).toContainText(rp(ALLOCATION_CAPEX_CORRECTED));
  await expect(correctedAllocationCard).toContainText(rp(ALLOCATION_REMAINING));

  // --------------------------- the project: metadata behind the same affordance
  const pricingCard = cardByHeading(page, 'Full-life figures and pricing chain');
  await pricingCard.getByRole('button', { name: 'Correct record' }).click();
  await expect(pricingCard.getByText(CORRECTION_BANNER)).toBeVisible();
  const projectForm = pricingCard.locator('form');
  await projectForm.locator('input[name="owner"]').fill(CORRECTED_PROJECT_OWNER);
  await projectForm.locator('textarea[name="reason"]').fill(PROJECT_REASON);
  await projectForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Project ${PROJECT.code} updated.`)).toBeVisible();

  // The project card shows the corrected metadata, and the record's own history
  // names the audited action rather than the machine token (ADR-0007 §5, §7).
  await expect(ddValue(cardByHeading(page, 'Project'), 'Owner')).toHaveText(
    CORRECTED_PROJECT_OWNER,
  );
  const correctionHistoryRow = cardByHeading(page, 'Change history')
    .locator('tbody tr')
    .filter({ hasText: PROJECT_REASON });
  await expect(correctionHistoryRow).toHaveCount(1);
  await expect(
    correctionHistoryRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('main form')).toHaveCount(0);

  // --------------------------- the closed plan lists all three live corrections
  await openClosedAnnualPlan(page);
  const finalCard = cardByHeading(page, CORRECTIONS_TITLE);
  await expect(finalCard.getByText('3', { exact: true })).toBeVisible();
  await expect(finalCard.getByRole('link', { name: PROGRAM_LABEL })).toBeVisible();
  await expect(finalCard.getByRole('link', { name: ALLOCATION_LABEL })).toBeVisible();
  await expect(finalCard.getByRole('link', { name: PROJECT_LABEL })).toBeVisible();
  await expect(finalCard.getByRole('link', { name: ALLOCATION_LABEL })).toHaveAttribute(
    'href',
    /^\/plan\/projects\/[0-9a-f-]+\/allocations\/[0-9a-f-]+$/,
  );
  await expect(finalCard.getByText(PROGRAM_REASON)).toBeVisible();
  await expect(finalCard.getByText(ALLOCATION_REASON)).toBeVisible();
  await expect(finalCard.getByText(PROJECT_REASON)).toBeVisible();
  // badges are per record: the untouched foundation program carries none.
  await expect(
    cardByHeading(page, PROGRAM_LABEL).getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    cardByHeading(page, 'PRG-2027-001 · Workplace Modernisation 2027').getByText(
      CORRECTED_AFTER_CLOSE,
      { exact: true },
    ),
  ).toHaveCount(0);
  // the live unallocated figure is the corrected one, not the frozen one.
  await expect(cardByHeading(page, PROGRAM_LABEL)).toContainText(rp(PROGRAM_LIVE_UNALLOCATED));
});

/**
 * The audit trail and the close receipt: one `correction` entry per save, with
 * before/after and the reason, and the receipt keeps its frozen close figures
 * while adding the notice that lists the corrected records.
 */
test('audits each correction once and keeps the close receipt frozen @t2', async ({ page }) => {
  // ------------------------------------------------ the audit trail is the index
  await page.goto('/admin/audit?action=correction');
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();
  await expect(page.locator('select[name="action"] option[value="correction"]')).toHaveText(
    CORRECTED_AFTER_CLOSE,
  );
  // three saves, three entries: a correction is never recorded as an update.
  const correctionRows = page.locator('tbody tr');
  await expect(correctionRows).toHaveCount(3);

  const programAuditRow = correctionRows.filter({ hasText: PROGRAM_REASON });
  await expect(programAuditRow).toHaveCount(1);
  await expect(
    programAuditRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(programAuditRow.getByText('annual_program', { exact: true })).toBeVisible();
  await programAuditRow.getByText('Show values').click();
  const programSnapshots = programAuditRow.locator('pre');
  await expect(programSnapshots.first()).toContainText(
    `"capexBudget": ${PROGRAM_CAPEX_FOUNDATION}`,
  );
  await expect(programSnapshots.nth(1)).toContainText(
    `"capexBudget": ${PROGRAM_CAPEX_CORRECTED}`,
  );

  const allocationAuditRow = correctionRows.filter({ hasText: ALLOCATION_REASON });
  await expect(allocationAuditRow).toHaveCount(1);
  await expect(
    allocationAuditRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    allocationAuditRow.getByText('project_year_allocation', { exact: true }),
  ).toBeVisible();
  await allocationAuditRow.getByText('Show values').click();
  const allocationSnapshots = allocationAuditRow.locator('pre');
  await expect(allocationSnapshots.first()).toContainText(
    `"allocationCapex": ${ALLOCATION_CAPEX_FOUNDATION}`,
  );
  await expect(allocationSnapshots.nth(1)).toContainText(
    `"allocationCapex": ${ALLOCATION_CAPEX_CORRECTED}`,
  );

  const projectAuditRow = correctionRows.filter({ hasText: PROJECT_REASON });
  await expect(projectAuditRow).toHaveCount(1);
  await expect(projectAuditRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true })).toBeVisible();
  await expect(projectAuditRow.getByText('project', { exact: true })).toBeVisible();

  // ------------------------------------------------ the close receipt stays frozen
  await openClosedAnnualPlan(page);
  await page.getByRole('link', { name: 'Close receipt' }).click();
  await expect(page.getByRole('heading', { name: `Close FY${CLOSED_YEAR}` })).toBeVisible();
  await expect(
    ddValue(cardByHeading(page, 'Fiscal year closed'), 'Approval reference'),
  ).toHaveText(CLOSE_REFERENCE);

  // The snapshot is the frozen historical record: PRG-2027-001 still carries the
  // 100,000,000 the close wrote, and the corrected program's own snapshot row
  // still shows the 20,000,000 available at close — not the live 120,000,000.
  const snapshotCard = cardByHeading(page, 'Close snapshot');
  const frozenCarryRow = snapshotCard.locator('tbody tr', { hasText: 'PRG-2027-001' }).first();
  await expect(frozenCarryRow).toContainText(rp(CLOSED_YEAR_CARRIED));
  await expect(frozenCarryRow).toContainText('Not carried: no approved use in FY2028.');
  const frozenProgramRow = snapshotCard
    .locator('tbody tr')
    .filter({ hasText: PROGRAM.code })
    .filter({ hasText: 'capex' });
  await expect(frozenProgramRow).toHaveCount(1);
  await expect(frozenProgramRow).toContainText(rp(PROGRAM_FROZEN_AVAILABLE));
  await expect(frozenProgramRow).toContainText('Not carried: no approved use in FY2028.');

  // The carry-over receipts the close wrote are unchanged by a correction: the
  // close carried exactly one amount (PRG-2027-001 capex 100,000,000), and a
  // correction writes no ledger entry.
  const receiptsCard = cardByHeading(page, 'Carry-over receipts');
  await expect(receiptsCard.getByText('1', { exact: true })).toBeVisible();
  await expect(
    receiptsCard.locator('tbody tr', { hasText: 'PRG-2027-001' }).first(),
  ).toContainText(rp(CLOSED_YEAR_CARRIED));
  await expect(receiptsCard.getByText(new RegExp(CLOSE_REFERENCE)).first()).toBeVisible();

  // The receipt adds the notice below the frozen card: the fixed description and
  // the corrected records as links, with their reasons.
  const notice = cardByHeading(page, CORRECTIONS_TITLE);
  await expect(notice).toBeVisible();
  await expect(notice.getByText('3', { exact: true })).toBeVisible();
  await expect(notice).toContainText(RECEIPT_NOTICE_DESCRIPTION);
  await expect(notice.getByRole('link', { name: PROGRAM_LABEL })).toBeVisible();
  await expect(notice.getByRole('link', { name: ALLOCATION_LABEL })).toBeVisible();
  await expect(notice.getByRole('link', { name: PROJECT_LABEL })).toBeVisible();
  await expect(notice.getByText(PROGRAM_REASON)).toBeVisible();
  await expect(notice.getByText(ALLOCATION_REASON)).toBeVisible();
  await expect(notice.getByText(PROJECT_REASON)).toBeVisible();
  // a correction never reopens the closed year: the receipt keeps no form.
  await expect(page.locator('main form')).toHaveCount(0);
});

/**
 * The reports: live corrected figures, a per-row marker, the footnote and the
 * CSV column. The frozen snapshot is a different document (the close receipt).
 */
test('reports the live corrected figures with the corrected-after-close marker @t2', async ({
  page,
}) => {
  // ------------------------------------------ annual plan by SI and program
  await page.goto('/reports/annual-plan');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Annual plan by SI and program' }),
  ).toBeVisible();
  const programRow = page.locator('tbody tr').filter({ hasText: `SI-01 · ${PROGRAM.code}` });
  await expect(programRow).toHaveCount(1);
  await expect(programRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true })).toBeVisible();
  // The live figures: 120,000,000 effective capex, 90,000,000 allocated and
  // 30,000,000 unallocated (see the file header).
  await expect(programRow).toContainText(rp(PROGRAM_CAPEX_CORRECTED));
  await expect(programRow).toContainText(rp(ALLOCATION_CAPEX_CORRECTED));
  await expect(programRow).toContainText(rp(PROGRAM_LIVE_UNALLOCATED));
  await expect(page.getByText(REPORT_FOOTNOTE, { exact: true })).toBeVisible();
  // the marker is per row, never per table: the untouched program is unmarked
  await expect(
    page
      .locator('tbody tr')
      .filter({ hasText: 'SI-01 · PRG-2027-001' })
      .getByText(CORRECTED_AFTER_CLOSE),
  ).toHaveCount(0);

  // ------------------------------------------------ budget versus actual
  await page.goto('/reports/budget-vs-actual');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Budget versus actual' }),
  ).toBeVisible();
  const actualRow = page
    .locator('tbody tr')
    .filter({ hasText: `SI-01 · ${PROGRAM.code}` })
    .first();
  await expect(actualRow.getByText(CORRECTED_AFTER_CLOSE, { exact: true })).toBeVisible();
  await expect(actualRow).toContainText(rp(PROGRAM_CAPEX_CORRECTED));
  await expect(actualRow).toContainText(rp(ALLOCATION_CAPEX_CORRECTED));
  await expect(actualRow).toContainText(rp(PROGRAM_LIVE_UNALLOCATED));
  await expect(page.getByText(REPORT_FOOTNOTE, { exact: true })).toBeVisible();

  // ------------------------------------- the CSV exports carry the marker column
  const annualCsv = await fetchCsv(page, '/reports/export/annual-plan?format=csv');
  const annualTable = csvTable(annualCsv, ['Fiscal year', 'Plan status', 'Program']);
  expect(annualTable.columns).toContain(CORRECTED_AFTER_CLOSE);
  expect(annualCsv).toContain(REPORT_FOOTNOTE);
  const markedAnnualRow = csvRow(annualTable, {
    'Fiscal year': String(CLOSED_YEAR),
    Program: PROGRAM.code,
  });
  expect(csvCell(annualTable, markedAnnualRow, 'Capex initial budget')).toBe(
    String(PROGRAM_CAPEX_CORRECTED),
  );
  expect(csvCell(annualTable, markedAnnualRow, 'Capex allocated')).toBe(
    String(ALLOCATION_CAPEX_CORRECTED),
  );
  expect(csvCell(annualTable, markedAnnualRow, 'Capex unallocated')).toBe(
    String(PROGRAM_LIVE_UNALLOCATED),
  );
  expect(csvCell(annualTable, markedAnnualRow, CORRECTED_AFTER_CLOSE)).toBe('yes');
  const untouchedAnnualRow = csvRow(annualTable, {
    'Fiscal year': String(CLOSED_YEAR),
    Program: 'PRG-2027-001',
  });
  expect(csvCell(annualTable, untouchedAnnualRow, CORRECTED_AFTER_CLOSE)).toBe('');

  const actualCsv = await fetchCsv(page, '/reports/export/budget-vs-actual?format=csv');
  const actualTable = csvTable(actualCsv, [
    'Fiscal year',
    'Program',
    'Capex budget available',
  ]);
  expect(actualTable.columns).toContain(CORRECTED_AFTER_CLOSE);
  expect(actualCsv).toContain(REPORT_FOOTNOTE);
  const markedActualRow = csvRow(actualTable, {
    'Fiscal year': String(CLOSED_YEAR),
    Program: PROGRAM_LABEL,
  });
  expect(csvCell(actualTable, markedActualRow, 'Capex budget available')).toBe(
    String(PROGRAM_CAPEX_CORRECTED),
  );
  expect(csvCell(actualTable, markedActualRow, 'Capex allocated')).toBe(
    String(ALLOCATION_CAPEX_CORRECTED),
  );
  expect(csvCell(actualTable, markedActualRow, 'Capex unallocated')).toBe(
    String(PROGRAM_LIVE_UNALLOCATED),
  );
  expect(csvCell(actualTable, markedActualRow, CORRECTED_AFTER_CLOSE)).toBe('yes');
});
