import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import { rp } from './support/money';
import { withSql } from './support/db';

/**
 * Opening-balance reconciliation after sign-off (charter §6.9, ADR-0003 §5) and
 * the opening-import corner cases (W3a/W3b/W9).
 *
 * The foundation journey saves the FY2026 control totals (all zero), signs off,
 * imports the spreadsheet data and only then hands the signed-in state to t2.
 * Sign-off is final: the page must show the banner, the read-only comparison
 * table and no save/sign-off form, so this file never tries to re-save it.
 *
 * The import wizard is gated by the *target* fiscal year, not by the sign-off:
 * `getOpeningLoadScene` and `openingImportAction`
 * (src/server/plan/opening-import-actions.ts) both target
 * `plan.startFiscalYear + 1` — FY2027 — and the foundation closes FY2027 before
 * t2. The wizard therefore renders its "FY2027 is closed" notice and there is no
 * upload form to drive; the module import/validate round-trip cannot be reached
 * from the UI in this tier and would only be faked by posting the action
 * directly, so the gate itself is asserted instead. Template downloads stay
 * available and are covered here, including the live custom-field columns.
 */

const DATA_SETS = [
  {
    id: 'strategic-initiatives',
    header: 'Code,Name,Owner,Objective,Envelope amount (Rp)',
  },
  {
    id: 'annual-programs',
    header: 'Code,Name,Strategic initiative code,Previous program code,Capex budget (Rp)',
  },
  {
    id: 'projects',
    header: 'Code,Name,Originating program code,External reference,Owner,Description,Start fiscal year',
  },
] as const;

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function headerLabels(workbook: ExcelJS.Workbook, sheetName: string): string[] {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`The template has no "${sheetName}" worksheet.`);
  const labels: string[] = [];
  const row = sheet.getRow(1);
  for (let column = 1; column <= row.cellCount; column += 1) {
    labels.push(cellText(row.getCell(column).value));
  }
  return labels;
}

/** The template's header row: the last non-comment, non-empty CSV line. */
function csvHeaderLine(csv: string): string {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (!line.startsWith('#')) return line;
  }
  throw new Error('The CSV template has no header row.');
}

test('shows the signed-off reconciliation with read-only control totals @t2', async ({ page }) => {
  // The sign-off is persisted: the read-only view below is the same row.
  const reconciliation = await withSql(async (sql) =>
    sql<{ signed_off_at: Date | null; sign_off_reason: string | null }[]>`
      select signed_off_at, sign_off_reason
      from opening_balance_reconciliations
      limit 1
    `,
  );
  expect(reconciliation[0]?.signed_off_at).toBeTruthy();
  expect(reconciliation[0]?.sign_off_reason).toBe('E2E opening balances sign-off.');

  await page.goto('/plan/opening-balances');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Opening balances', exact: true }),
  ).toBeVisible();

  // The reconciliation card carries the signed-off badge and banner.
  const card = page.locator('section').filter({ hasText: 'Control totals and sign-off' });
  await expect(card.getByText('signed off', { exact: true })).toBeVisible();
  await expect(
    card.getByText(/Signed off .* — E2E opening balances sign-off\./),
  ).toBeVisible();
  await expect(card.getByText('The control totals are read-only.')).toBeVisible();

  // The comparison table has all eight control totals and a status per row.
  await expect(card.getByRole('columnheader', { name: 'Control total', exact: true })).toBeVisible();
  await expect(card.getByRole('columnheader', { name: 'Spreadsheet', exact: true })).toBeVisible();
  await expect(card.getByRole('columnheader', { name: 'Strapla', exact: true })).toBeVisible();
  await expect(card.getByRole('columnheader', { name: 'Difference', exact: true })).toBeVisible();
  await expect(card.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
  const controlRows = card.locator('tbody tr');
  await expect(controlRows).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    await expect(controlRows.nth(index).getByText(/^(match|difference)$/)).toBeVisible();
  }
  // The saved spreadsheet totals are the foundation's zeros; every in-app figure
  // is non-zero, so all eight rows are differences. A "match" badge is therefore
  // unreachable in this signed-off state (the form that could write a matching
  // total is gone).
  await expect(card.getByText('Rp 0', { exact: true })).toHaveCount(8);
  await expect(card.getByText('difference', { exact: true })).toHaveCount(8);

  // Sign-off is final: the reconciliation forms are not rendered at all.
  await expect(card.locator('form')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Save control totals' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Sign off opening balances' })).toHaveCount(0);

  // The rest of the reading view is intact around the signed-off card.
  await expect(page.getByText('Initiatives — envelope reconciliation')).toBeVisible();
  await expect(page.getByText('Annual programs — carry-in')).toBeVisible();
  await expect(page.getByText('Projects — opening position')).toBeVisible();
  const initiativesCard = page
    .locator('section')
    .filter({ hasText: 'Initiatives — envelope reconciliation' });
  await expect(
    initiativesCard.locator('tbody tr').filter({ hasText: 'SI-01' }),
  ).toContainText(rp(5_000_000_000));
});

test('serves the opening-import templates in CSV and XLSX with the live custom columns @t2', async ({
  page,
}) => {
  for (const dataSet of DATA_SETS) {
    // ------------------------------------------------------------- CSV
    const csvResponse = await page.request.get(
      `/plan/opening-balances/import/template?dataSet=${dataSet.id}&format=csv`,
    );
    expect(csvResponse.status()).toBe(200);
    expect(csvResponse.headers()['content-type']).toContain('text/csv');
    expect(csvResponse.headers()['content-disposition']).toContain(
      `strapla-opening-${dataSet.id}-template.csv`,
    );
    const csv = await csvResponse.text();
    expect(csvHeaderLine(csv)).toContain(dataSet.header);

    // ------------------------------------------------------------ XLSX
    const xlsxResponse = await page.request.get(
      `/plan/opening-balances/import/template?dataSet=${dataSet.id}&format=xlsx`,
    );
    expect(xlsxResponse.status()).toBe(200);
    expect(xlsxResponse.headers()['content-type']).toContain('spreadsheetml');
    expect(xlsxResponse.headers()['content-disposition']).toContain(
      `strapla-opening-${dataSet.id}-template.xlsx`,
    );
    const workbook = new ExcelJS.Workbook();
    const templateBody = await xlsxResponse.body();
    // exceljs types load() against its own ArrayBuffer-based Buffer declaration;
    // the Playwright body is a Node Buffer carrying the same bytes.
    await workbook.xlsx.load(templateBody as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Data');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Instructions');
    const dataHeader = headerLabels(workbook, 'Data');
    expect(dataHeader.join(',')).toContain(dataSet.header);

    if (dataSet.id === 'projects') {
      // W9: the live custom-field registry contributes importable columns, so an
      // administrator-added field appears without a code change.
      expect(dataHeader).toContain('Procurement method');
      expect(dataHeader).toContain('Delivery note (renamed)');
      expect(csvHeaderLine(csv)).toContain('Procurement method');
      expect(csvHeaderLine(csv)).toContain('Delivery note (renamed)');
    }
  }
});

test('blocks the opening import because the target FY2027 plan is closed @t2', async ({ page }) => {
  // The wizard page: the sign-off is final, but the message names the closed
  // fiscal year — the real gate in opening-import-actions.ts.
  await page.goto('/plan/opening-balances/import');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Opening-balance import' }),
  ).toBeVisible();
  await expect(
    page.getByText('FY2027 is closed and cannot receive an import.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('select[name="dataSet"]')).toHaveCount(0);
  await expect(page.locator('input[name="file"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validate file' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validate and load' })).toHaveCount(0);
  // The reading material around the wizard still renders.
  await expect(page.getByRole('heading', { name: 'Load order', exact: true })).toBeVisible();
  await expect(page.getByText(/Strategic initiatives — creates the initiatives/)).toBeVisible();

  // The reconciliation page repeats the same gate in its "Opening import" card.
  await page.goto('/plan/opening-balances');
  const importCard = page.locator('section').filter({ hasText: 'Opening import' });
  await expect(
    importCard.getByText('FY2027 is closed and cannot receive an import.', { exact: true }),
  ).toBeVisible();
  await expect(importCard.getByRole('link', { name: 'Open the import wizard' })).toHaveCount(0);
});
