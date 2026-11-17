import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { openingFieldList, type OpeningField } from './field-list';
import { buildCsvTemplate, buildXlsxTemplate, templateFileName } from './template';

const ownerColumn: OpeningField = {
  name: 'procurementMethod',
  label: 'Procurement method',
  type: 'text',
  required: false,
  description: 'Owner-added column: how the project is procured.',
  example: 'Tender',
};

function headerRow(csv: string): string {
  const line = csv
    .split(/\r?\n/)
    .find((candidate) => candidate.trim() !== '' && !candidate.startsWith('#'));
  if (!line) throw new Error('template has no header row');
  return line;
}

describe('buildCsvTemplate', () => {
  const csv = buildCsvTemplate({ dataSet: 'strategic-initiatives', closingFiscalYear: 2026 });

  it('starts with the documented reason convention', () => {
    expect(csv).toContain('Opening balance — FY2026 close / <reference>');
  });

  it('declares every column in the field-list order', () => {
    const labels = openingFieldList('strategic-initiatives').map((field) => field.label);
    expect(headerRow(csv)).toBe(labels.join(','));
  });

  it('documents each column with its type, required flag and description', () => {
    const fields = openingFieldList('strategic-initiatives');
    for (const field of fields) {
      expect(csv).toContain(`#   ${field.label} — ${field.description}`);
      expect(csv).toContain(`(${field.type}, ${field.required ? 'required' : 'optional'})`);
    }
  });

  it('includes a commented example row built from the declared examples', () => {
    expect(csv).toContain(
      '# SI-01,Digital service platform,Chief Information Officer,Consolidate citizen-facing services on one platform.,12500000000,3250000000,Signed off with the FY2026 close.',
    );
  });

  it('appends an owner-added typed column', () => {
    const withOwner = buildCsvTemplate({
      dataSet: 'projects',
      closingFiscalYear: 2026,
      ownerColumns: [ownerColumn],
    });
    const header = headerRow(withOwner);
    expect(header.endsWith(',Procurement method')).toBe(true);
    expect(withOwner).toContain('Tender');
    expect(withOwner).toContain('Owner-added column: how the project is procured.');
  });
});

describe('buildXlsxTemplate', () => {
  it('writes an Instructions sheet and a Data sheet with the declared headers', async () => {
    const bytes = await buildXlsxTemplate({ dataSet: 'annual-programs', closingFiscalYear: 2026 });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Instructions', 'Data']);

    const data = workbook.getWorksheet('Data');
    const labels = openingFieldList('annual-programs').map((field) => field.label);
    expect(data?.getRow(1).values).toEqual([undefined, ...labels]);

    const instructions = workbook.getWorksheet('Instructions');
    const text = cellTexts(instructions).join('\n');
    expect(text).toContain('Opening balance — FY2026 close / <reference>');
    expect(text).toContain('Annual programs');
    for (const field of openingFieldList('annual-programs')) {
      expect(text).toContain(field.label);
      expect(text).toContain(field.description);
      expect(text).toContain(field.example);
    }
  });

  it('appends an owner-added typed column to the Data sheet and the instructions table', async () => {
    const bytes = await buildXlsxTemplate({
      dataSet: 'projects',
      closingFiscalYear: 2026,
      ownerColumns: [ownerColumn],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

    const data = workbook.getWorksheet('Data');
    expect(data?.getRow(1).values).toContain('Procurement method');
    const text = cellTexts(workbook.getWorksheet('Instructions')).join('\n');
    expect(text).toContain('Owner-added column: how the project is procured.');
  });
});

describe('templateFileName', () => {
  it('names the file after the data set and the format', () => {
    expect(templateFileName('strategic-initiatives', 'csv')).toBe(
      'strapla-opening-strategic-initiatives-template.csv',
    );
    expect(templateFileName('annual-programs', 'xlsx')).toBe(
      'strapla-opening-annual-programs-template.xlsx',
    );
  });
});

function cellTexts(sheet: ExcelJS.Worksheet | undefined): string[] {
  if (!sheet) return [];
  const texts: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined) texts.push(String(cell.text));
    });
  });
  return texts;
}
