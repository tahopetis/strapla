import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import { rp } from './support/money';
import { createProgramFixture } from './support/programs';

/**
 * Reports and exports (M2 #15, #46, #74, #75).
 *
 * All four report pages are read against the foundation portfolio, then every
 * report is downloaded as CSV and XLSX and parsed with exceljs (the same library
 * the export route writes with) so the file is proved as data, not just as a
 * 200 response. Exports carry raw whole-Rupiah integers — the on-screen views
 * are the ones that format money as "Rp 1.234.567" through `src/lib/format.ts`.
 *
 * The custom-column selection is proved with the project register because the
 * foundation already registered project fields; the filter coverage registers
 * its own fields for the strategic-initiative and annual-program entities (the
 * reports render `CustomFieldFilterForm` only when their entity has active
 * fields) and attaches them to its own SI, program and project in FY2028.
 */

/** One row of an exported sheet, index 0 = column A, as displayable text/numbers. */
type SheetRow = Array<string | number>;

function cellText(value: CellValue): string | number {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): SheetRow {
  const row = sheet.getRow(rowNumber);
  const values: SheetRow = [];
  for (let column = 1; column <= row.cellCount; column += 1) {
    values.push(cellText(row.getCell(column).value));
  }
  return values;
}

/** Every row of one worksheet, header row first. */
function sheetRows(workbook: ExcelJS.Workbook, name: string): SheetRow[] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`The exported workbook has no "${name}" worksheet.`);
  const rows: SheetRow[] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    rows.push(rowValues(sheet, rowNumber));
  }
  return rows;
}

/** The first non-header row matching the predicate, or undefined. */
function findRow(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  predicate: (row: SheetRow) => boolean,
): SheetRow | undefined {
  return sheetRows(workbook, sheetName)
    .slice(1)
    .find(predicate);
}

function expectRow(row: SheetRow | undefined, label: string): SheetRow {
  expect(row, `the exported ${label} row`).toBeTruthy();
  if (!row) throw new Error(`The export has no ${label} row.`);
  return row;
}

async function fetchExport(request: APIRequestContext, path: string): Promise<APIResponse> {
  const response = await request.get(path);
  expect(response.status(), `GET ${path}`).toBe(200);
  return response;
}

async function fetchCsv(request: APIRequestContext, path: string): Promise<string> {
  const response = await fetchExport(request, path);
  expect(response.headers()['content-type']).toContain('text/csv');
  return response.text();
}

async function fetchWorkbook(request: APIRequestContext, path: string): Promise<ExcelJS.Workbook> {
  const response = await fetchExport(request, path);
  expect(response.headers()['content-type']).toContain('spreadsheetml');
  const workbook = new ExcelJS.Workbook();
  const body = await response.body();
  // exceljs types load() against its own ArrayBuffer-based Buffer declaration;
  // the Playwright body is a Node Buffer carrying the same bytes.
  await workbook.xlsx.load(body as unknown as ArrayBuffer);
  return workbook;
}

async function addCustomField(
  page: Page,
  entityLabel: string,
  input: { name: string; description: string },
): Promise<void> {
  await page.goto('/admin/custom-fields');
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: entityLabel, exact: true }) });
  await card.getByText('Add a field').click();
  const form = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add field' }) });
  await form.locator('input[name="name"]').fill(input.name);
  await form.locator('select[name="type"]').selectOption('text');
  await form.locator('textarea[name="description"]').fill(input.description);
  await card.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByText(`Custom field “${input.name}” added.`)).toBeVisible();
}

/** Applies one custom-field filter through the report's own filter form. */
async function applyFilter(page: Page, fieldName: string, value: string): Promise<void> {
  await page.locator('select[name="cf"]').selectOption({ label: fieldName });
  await page.locator('input[name="cv"]').fill(value);
  await page.getByRole('button', { name: 'Apply filter' }).click();
}

test('renders all four reports with the live portfolio figures @t2', async ({ page }) => {
  // ------------------------------------------------- SI five-year view
  await page.goto('/reports/si-five-year');
  await expect(page.getByRole('heading', { level: 1, name: 'SI five-year view' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Initiative', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Capex envelope', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Opex envelope', exact: true })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Capex prior consumed', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Opex headroom', exact: true })).toBeVisible();
  // SI-01 carries the foundation's capex and opex envelopes and prior figures.
  const initiativeRow = page.locator('tbody tr').filter({ hasText: 'SI-01' });
  await expect(initiativeRow).toContainText('Digital Workplace');
  await expect(initiativeRow).toContainText(rp(4_000_000_000));
  await expect(initiativeRow).toContainText(rp(1_000_000_000));
  await expect(initiativeRow).toContainText(rp(600_000_000));
  await expect(initiativeRow).toContainText(rp(150_000_000));
  await expect(page.locator('tfoot').getByText('Portfolio total')).toBeVisible();

  // ------------------------------- Annual plan by SI and program
  await page.goto('/reports/annual-plan');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Annual plan by SI and program' }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'FY', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'SI / program', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Capex available', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Committed', exact: true }).first()).toBeVisible();
  // The recurring-ops table keeps its own headers under the program table.
  await expect(page.getByRole('columnheader', { name: 'Prior-year openings', exact: true })).toBeVisible();
  const programRow = page.locator('tbody tr').filter({ hasText: 'SI-01 · PRG-2027-001' });
  await expect(programRow).toContainText(rp(1_200_000_000));
  await expect(programRow).toContainText(rp(500_000_000));
  await expect(programRow).toContainText(rp(60_000_000));

  // ------------------------------------------------ Project register
  await page.goto('/reports/project-register');
  await expect(page.getByRole('heading', { level: 1, name: 'Project register' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Project', exact: true })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Full-life allocated', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Approved', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Flags', exact: true })).toBeVisible();
  // The saved column preference shows the project's extra column (#75).
  await expect(
    page.getByRole('columnheader', { name: 'Procurement method', exact: true }),
  ).toBeVisible();
  const projectRow = page.locator('tbody tr').filter({ hasText: 'PRJ-2027-001' });
  await expect(projectRow).toContainText('Device Refresh 2027');
  await expect(projectRow).toContainText(rp(1_000_000_000));
  await expect(projectRow).toContainText(rp(800_000_000));
  await expect(projectRow).toContainText(rp(900_000_000));
  await expect(projectRow).toContainText(rp(600_000_000));
  await expect(projectRow).toContainText(rp(100_000_000));
  await expect(projectRow).toContainText(rp(60_000_000));
  await expect(projectRow).toContainText('Open tender');
  await expect(projectRow.getByText('over_approved_budget', { exact: true })).toBeVisible();

  // ------------------------------------------------ Budget versus actual
  await page.goto('/reports/budget-vs-actual');
  await expect(page.getByRole('heading', { level: 1, name: 'Budget versus actual' })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Prior-year settlements', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Prior-year openings', exact: true }),
  ).toBeVisible();
  // #98: the closed year's post-close adjustments are a separately labelled block,
  // never a change to the existing columns above
  await expect(
    page.getByRole('heading', { name: 'Post-close adjustments (reserve)' }),
  ).toBeVisible();
  await expect(page.getByText(/outside the locked close snapshot/)).toBeVisible();
  const actualRow = page.locator('tbody tr').filter({ hasText: 'SI-01 · PRG-2027-001' });
  await expect(actualRow).toContainText(rp(1_200_000_000));
  await expect(actualRow).toContainText(rp(500_000_000));
  await expect(actualRow).toContainText(rp(100_000_000));
  await expect(actualRow).toContainText(rp(60_000_000));
});

test('exports every report as CSV and XLSX with the live rows @t2', async ({ page }) => {
  // ------------------------------------------------------------------ CSV
  const siCsv = await fetchCsv(page.request, '/reports/export/si-five-year?format=csv');
  expect(siCsv).toContain(
    'SI code,Strategic initiative,Owner,Capex envelope,Capex prior consumed,Capex program budgets',
  );
  expect(siCsv).toContain('SI-01,Digital Workplace');
  expect(siCsv).toContain(',4000000000,600000000,');

  const annualCsv = await fetchCsv(page.request, '/reports/export/annual-plan?format=csv');
  expect(annualCsv).toContain(
    'Fiscal year,Plan status,SI,Program,Program name,Capex initial budget,Capex revisions,Capex effective budget',
  );
  expect(annualCsv).toContain(
    '2027,closed,SI-01,PRG-2027-001,Workplace Modernisation 2027,1200000000,0,1200000000,0,1200000000',
  );

  const registerCsv = await fetchCsv(page.request, '/reports/export/project-register?format=csv');
  expect(registerCsv).toContain(
    'Project code,Project name,Status,SI,Program,Start FY,End FY,Full-life allocated',
  );
  expect(registerCsv).toContain(
    'PRJ-2027-001,Device Refresh 2027,active,SI-01 · Digital Workplace,PRG-2027-001',
  );
  expect(registerCsv).toContain(
    '1000000000,800000000,950000000,900000000,500000000,100000000,0,0,600000000,100000000,60000000',
  );

  const actualCsv = await fetchCsv(page.request, '/reports/export/budget-vs-actual?format=csv');
  expect(actualCsv).toContain(
    'Fiscal year,SI,Program,Capex budget available,Opex budget available,Capex allocated',
  );
  expect(actualCsv).toContain('2027,SI-01,PRG-2027-001 · Workplace Modernisation 2027,1200000000');

  // #98: the post-close adjustments are their own export table, not extra columns
  expect(actualCsv).toContain('Post-close adjustments');
  expect(actualCsv).toContain(
    'Commitment fiscal year,SI,Program,Program name,Capex reserve,Opex reserve,Total reserve',
  );

  // ----------------------------------------------------------------- XLSX
  const siWorkbook = await fetchWorkbook(page.request, '/reports/export/si-five-year?format=xlsx');
  expect(siWorkbook.worksheets.map((sheet) => sheet.name)).toContain('SI five-year view');
  const siRow = expectRow(
    findRow(siWorkbook, 'SI five-year view', (row) => row[0] === 'SI-01'),
    'SI-01',
  );
  expect(siRow[0]).toBe('SI-01');
  expect(siRow[1]).toBe('Digital Workplace');
  expect(siRow[3]).toBe(4_000_000_000);
  expect(siRow[4]).toBe(600_000_000);
  expect(sheetRows(siWorkbook, 'SI five-year view')[0]?.[0]).toBe('SI code');

  const annualWorkbook = await fetchWorkbook(
    page.request,
    '/reports/export/annual-plan?format=xlsx',
  );
  expect(annualWorkbook.worksheets.map((sheet) => sheet.name)).toContain('Annual programs');
  expect(sheetRows(annualWorkbook, 'Annual programs')[0]?.[0]).toBe('Fiscal year');
  const annualRow = expectRow(
    findRow(
      annualWorkbook,
      'Annual programs',
      (row) => row[0] === 2027 && row[3] === 'PRG-2027-001',
    ),
    'FY2027 PRG-2027-001',
  );
  expect(annualRow[4]).toBe('Workplace Modernisation 2027');
  expect(annualRow[5]).toBe(1_200_000_000);
  expect(annualRow[6]).toBe(0);
  expect(annualRow[7]).toBe(1_200_000_000);
  expect(annualRow[12]).toBe(300_000_000);
  expect(annualRow[14]).toBe(300_000_000);

  const registerWorkbook = await fetchWorkbook(
    page.request,
    '/reports/export/project-register?format=xlsx',
  );
  expect(registerWorkbook.worksheets.map((sheet) => sheet.name)).toContain('Project register');
  expect(sheetRows(registerWorkbook, 'Project register')[0]?.[0]).toBe('Project code');
  const registerRow = expectRow(
    findRow(registerWorkbook, 'Project register', (row) => row[0] === 'PRJ-2027-001'),
    'PRJ-2027-001',
  );
  expect(registerRow[1]).toBe('Device Refresh 2027');
  expect(registerRow[7]).toBe(1_000_000_000);
  expect(registerRow[8]).toBe(800_000_000);
  expect(registerRow[9]).toBe(950_000_000);
  expect(registerRow[10]).toBe(900_000_000);

  const actualWorkbook = await fetchWorkbook(
    page.request,
    '/reports/export/budget-vs-actual?format=xlsx',
  );
  expect(actualWorkbook.worksheets.map((sheet) => sheet.name)).toContain('Budget versus actual');
  // #98: the closed year's adjustments ship as a separate worksheet
  expect(actualWorkbook.worksheets.map((sheet) => sheet.name)).toContain('Post-close adjustments');
  expect(sheetRows(actualWorkbook, 'Post-close adjustments')[0]?.[0]).toBe('Commitment fiscal year');
  expect(sheetRows(actualWorkbook, 'Budget versus actual')[0]?.[0]).toBe('Fiscal year');
  const actualXlsxRow = expectRow(
    findRow(
      actualWorkbook,
      'Budget versus actual',
      (row) => row[0] === 2027 && row[2] === 'PRG-2027-001 · Workplace Modernisation 2027',
    ),
    'budget-versus-actual program',
  );
  expect(actualXlsxRow[3]).toBe(1_200_000_000);
  expect(actualXlsxRow[4]).toBe(300_000_000);
});

test('selects the custom columns for the CSV and XLSX exports @t2', async ({ page }) => {
  await page.goto('/reports/project-register');
  await expect(
    page.getByRole('columnheader', { name: 'Procurement method', exact: true }),
  ).toBeVisible();

  // The checkbox value is the registry field id the export's `columns` uses.
  await page.getByText('Extra columns').click();
  const columnCheckbox = page.getByRole('checkbox', {
    name: 'Procurement method',
    exact: true,
  });
  await expect(columnCheckbox).toBeChecked();
  const columnId = await columnCheckbox.getAttribute('value');
  expect(columnId).toBeTruthy();

  // An explicit selection wins over the saved preference and carries the column.
  const csvWithColumn = await fetchCsv(
    page.request,
    `/reports/export/project-register?format=csv&columns=${columnId}`,
  );
  expect(csvWithColumn).toContain('Procurement method');
  expect(csvWithColumn).toContain('Open tender');

  const workbookWithColumn = await fetchWorkbook(
    page.request,
    `/reports/export/project-register?format=xlsx&columns=${columnId}`,
  );
  const withHeader = sheetRows(workbookWithColumn, 'Project register')[0] ?? [];
  const columnIndex = withHeader.indexOf('Procurement method');
  expect(columnIndex).toBeGreaterThanOrEqual(0);
  const withColumnRow = expectRow(
    findRow(workbookWithColumn, 'Project register', (row) => row[0] === 'PRJ-2027-001'),
    'PRJ-2027-001 with the custom column',
  );
  expect(withColumnRow[columnIndex]).toBe('Open tender');

  // An explicit empty selection means "no extra columns" (a missing parameter
  // would mean "every active field"), so the header must be absent.
  const csvWithoutColumn = await fetchCsv(
    page.request,
    '/reports/export/project-register?format=csv&columns=',
  );
  expect(csvWithoutColumn).not.toContain('Procurement method');
  const workbookWithoutColumn = await fetchWorkbook(
    page.request,
    '/reports/export/project-register?format=xlsx&columns=',
  );
  expect(sheetRows(workbookWithoutColumn, 'Project register')[0] ?? []).not.toContain(
    'Procurement method',
  );
});

test('adds the custom fields and values that the report filters match @t2', async ({ page }) => {
  // A private initiative and its FY2028 program, so the filter assertions can
  // never depend on the foundation rows another tier might change.
  await page.goto('/plan/strategic');
  const initiativeForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add initiative' }) });
  await initiativeForm.locator('input[name="code"]').fill('SI-8801');
  await initiativeForm.locator('input[name="name"]').fill('Report filter initiative');
  await initiativeForm.locator('input[name="owner"]').fill('E2E Reports Owner');
  await initiativeForm.locator('input[name="envelopeCapex"]').fill('250000000');
  await initiativeForm.locator('input[name="envelopeOpex"]').fill('0');
  await initiativeForm.locator('input[name="priorCapex"]').fill('0');
  await initiativeForm.locator('input[name="priorOpex"]').fill('0');
  await page.getByRole('button', { name: 'Add initiative' }).click();
  await expect(page.getByText(/Strategic initiative SI-8801 created\./)).toBeVisible();

  await addCustomField(page, 'Strategic initiative', {
    name: 'Report filter note',
    description: 'Matches the strategic-initiative rows of the SI five-year report.',
  });
  await addCustomField(page, 'Strategic initiative', {
    name: 'Report filter stage',
    description: 'Second strategic-initiative filter used to stack filters.',
  });

  await page.goto('/plan/strategic');
  const initiativeCard = page
    .locator('section')
    .filter({ hasText: 'SI-8801 · Report filter initiative' });
  await initiativeCard.locator('summary', { hasText: 'Edit initiative' }).click();
  const initiativeEdit = initiativeCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await initiativeEdit.getByLabel('Report filter note').fill('filter-alpha');
  await initiativeEdit.getByLabel('Report filter stage').fill('filter-beta');
  await initiativeEdit.locator('textarea[name="reason"]').fill('Record the report filter values.');
  await initiativeEdit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Strategic initiative SI-8801 updated\./)).toBeVisible();

  // The FY2028 program under the new initiative, then its own registry values.
  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  await createProgramFixture({
    fiscalYear: 2028,
    siCode: 'SI-8801',
    code: 'PRG-2028-8801',
    name: 'Report filter program 2028',
    capex: 50_000_000,
    opex: 0,
  });
  await page.reload();
  await expect(page.getByText('PRG-2028-8801 · Report filter program 2028').first()).toBeVisible();

  await addCustomField(page, 'Annual program', {
    name: 'Report filter port',
    description: 'Matches the annual-program rows of the plan reports.',
  });
  await addCustomField(page, 'Annual program', {
    name: 'Report filter stage',
    description: 'Second annual-program filter used to stack filters.',
  });

  await page.goto('/plan/annual');
  await page.locator('tbody tr', { hasText: 'FY2028' }).getByRole('link', { name: 'Open' }).click();
  const programCard = page
    .locator('section')
    .filter({ hasText: 'PRG-2028-8801 · Report filter program 2028' });
  await programCard.locator('summary', { hasText: 'Edit program' }).click();
  const programEdit = programCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
  await programEdit.getByLabel('Report filter port').fill('filter-gamma');
  await programEdit.getByLabel('Report filter stage').fill('filter-delta');
  await programEdit.locator('textarea[name="reason"]').fill('Record the report filter values.');
  await programEdit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Annual program PRG-2028-8801 updated\./)).toBeVisible();

  // A project carrying the two project fields the foundation already registered.
  await page.goto('/plan/projects');
  const projectForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create project' }) });
  await projectForm.locator('select[name="originatingProgramId"]').selectOption({
    label: 'PRG-2028-8801 · Report filter program 2028 (FY2028, SI-8801)',
  });
  await projectForm.locator('input[name="name"]').fill('Report filters probe 2028');
  await projectForm.locator('input[name="owner"]').fill('E2E Reports Owner');
  await projectForm.locator('input[name="startFiscalYear"]').fill('2028');
  await projectForm.locator('input[name="endFiscalYear"]').fill('2028');
  await projectForm.locator('input[name="allocatedBudgetFullLife"]').fill('40000000');
  await projectForm.locator('input[name="submittedPrice"]').fill('40000000');
  await projectForm.locator('input[name="finalDealPrice"]').fill('35000000');
  await projectForm.getByLabel('Procurement method').fill('filter-procure');
  await projectForm.getByLabel('Delivery note (renamed)').fill('filter-delivery');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(/Project PRJ-2028-\d+ created\./)).toBeVisible();

  // The values are persisted on the record the report filter will read.
  await Promise.all([
    page.waitForURL(/\/plan\/projects\/[0-9a-f-]+$/),
    page
      .locator('tbody tr', { hasText: 'Report filters probe 2028' })
      .getByRole('link', { name: 'Open' })
      .click(),
  ]);
  await expect(page.getByText('Additional fields')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'filter-procure' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'filter-delivery' })).toBeVisible();
});

test('filters each report by custom fields, stacks filters and clears them @t2', async ({
  page,
}) => {
  // Uses the registry fields, the SI/program and the project the previous test
  // created (a new custom field is what makes a report render its filter form).
  // ------------------------------------------------- SI five-year view
  await page.goto('/reports/si-five-year');
  await expect(page.locator('tbody tr').filter({ hasText: 'SI-01' })).toHaveCount(1);
  await applyFilter(page, 'Report filter note', 'filter-alpha');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr', { hasText: 'SI-8801' })).toBeVisible();
  await expect(
    page.getByText('Totals cover the whole report, not only the filtered rows.'),
  ).toBeVisible();
  await applyFilter(page, 'Report filter stage', 'filter-beta');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(2);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(0);
  await expect(page.locator('tbody tr').filter({ hasText: 'SI-01' })).toHaveCount(1);

  // ------------------------------ Annual plan by SI and program
  await page.goto('/reports/annual-plan');
  const programTable = page.locator('table').first();
  await expect(programTable.locator('tbody tr', { hasText: 'PRG-2027-001' })).toBeVisible();
  await applyFilter(page, 'Report filter port', 'filter-gamma');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(programTable.locator('tbody tr')).toHaveCount(1);
  await expect(programTable.locator('tbody tr', { hasText: 'PRG-2028-8801' })).toBeVisible();
  await expect(
    page.getByText('Totals cover the whole report, not only the filtered rows.'),
  ).toBeVisible();
  await applyFilter(page, 'Report filter stage', 'filter-delta');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(2);
  await expect(programTable.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(0);
  await expect(programTable.locator('tbody tr', { hasText: 'PRG-2027-001' })).toBeVisible();

  // ------------------------------------------------ Budget versus actual
  await page.goto('/reports/budget-vs-actual');
  const actualTable = page.locator('table').first();
  await expect(actualTable.locator('tbody tr', { hasText: 'PRG-2027-001' })).toBeVisible();
  await applyFilter(page, 'Report filter port', 'filter-gamma');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(actualTable.locator('tbody tr')).toHaveCount(1);
  await expect(actualTable.locator('tbody tr', { hasText: 'PRG-2028-8801' })).toBeVisible();
  await applyFilter(page, 'Report filter stage', 'filter-delta');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(2);
  await expect(actualTable.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(0);
  await expect(actualTable.locator('tbody tr', { hasText: 'PRG-2027-001' })).toBeVisible();

  // ------------------------------------------------- Project register
  await page.goto('/reports/project-register');
  await expect(page.locator('tbody tr').filter({ hasText: 'PRJ-2027-001' })).toBeVisible();
  await applyFilter(page, 'Procurement method', 'filter-procure');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr', { hasText: 'Report filters probe 2028' })).toBeVisible();
  await applyFilter(page, 'Delivery note (renamed)', 'filter-delivery');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(2);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear all' }).click();
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(0);
  await expect(page.locator('tbody tr').filter({ hasText: 'PRJ-2027-001' })).toBeVisible();

  // The "no rows match" state is an empty table body plus the whole-report note.
  await applyFilter(page, 'Procurement method', 'no such procurement value');
  await expect(page.locator('a[aria-label^="Remove filter"]')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(
    page.getByText('Totals cover the whole report, not only the filtered rows.'),
  ).toBeVisible();
});

test('prints a report with the application chrome hidden @t2', async ({ page }) => {
  // The print button calls window.print(); stub it before the page loads so the
  // click can be observed instead of opening the (headless) print dialog.
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    (window as unknown as { print: () => void }).print = () => {
      const target = window as unknown as { __printCalls: number };
      target.__printCalls += 1;
    };
  });
  await page.goto('/reports/annual-plan');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Annual plan by SI and program' }),
  ).toBeVisible();

  // The screen-only chrome is visible before printing.
  await expect(page.locator('.screen-only').first()).toBeVisible();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.app-nav')).toBeVisible();

  await page.getByRole('button', { name: 'Print / PDF' }).click();
  const printCalls = await page.evaluate(
    () => (window as unknown as { __printCalls: number }).__printCalls,
  );
  expect(printCalls).toBe(1);

  // globals.css hides .app-header, .app-nav and .screen-only under @media print.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.screen-only').first()).toBeHidden();
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('.app-nav')).toBeHidden();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.report-body')).toBeVisible();
  await expect(page.locator('.report-body table').first()).toBeVisible();
});
