import ExcelJS from 'exceljs';
import {
  openingFieldList,
  openingReasonConvention,
  OPENING_DATA_SETS,
  type OpeningDataSetId,
  type OpeningField,
  type OpeningFieldType,
} from './field-list.ts';

/**
 * Template generation from the declared field list (W3a). The same list feeds the
 * CSV and XLSX writers, so a template can never drift from the parser. Templates
 * carry the headers, the documented reason convention and an example row; example
 * values in CSV are commented out so the template itself never imports as data.
 */

const TYPE_RULES: Record<OpeningFieldType, string> = {
  text: 'any text; required columns must not be blank',
  number: 'whole, non-negative number; dots may group thousands (1.234.567)',
  date: 'YYYY-MM-DD (DD/MM/YYYY is also accepted)',
};

export interface TemplateOptions {
  dataSet: OpeningDataSetId;
  /** The fiscal year being closed (for example 2026 for the FY2027 cut-over). */
  closingFiscalYear: number;
  /** Owner-added columns; defaults to the committed field list config. */
  ownerColumns?: readonly OpeningField[];
}

export function templateFileName(dataSet: OpeningDataSetId, format: 'csv' | 'xlsx'): string {
  return `strapla-opening-${dataSet}-template.${format}`;
}

export function buildCsvTemplate(options: TemplateOptions): string {
  const dataSet = OPENING_DATA_SETS[options.dataSet];
  const fields = openingFieldList(options.dataSet, options.ownerColumns);
  const exampleRow = fields.map((field) => escapeCsv(field.example)).join(',');
  const headerRow = fields.map((field) => escapeCsv(field.label)).join(',');

  const lines = [
    `# Strapla opening-balance import — ${dataSet.title}`,
    `# Data set: ${dataSet.id} · ${fields.length} columns · generated from the declared field list.`,
    `# ${dataSet.description}`,
    '#',
    '# Type rules:',
    ...entryOf(TYPE_RULES).map(([type, rule]) => `#   ${type} — ${rule}.`),
    '#',
    `# Load reason convention: ${openingReasonConvention(options.closingFiscalYear)}`,
    '#',
    '# Lines starting with # are ignored. Keep this block or delete it.',
    '# Do not rename or add columns: undeclared columns are rejected (order does not matter).',
    '#',
    '# Columns:',
    ...fields.map(
      (field) =>
        `#   ${field.label} — ${field.description} (${field.type}, ${
          field.required ? 'required' : 'optional'
        })`,
    ),
    '#',
    '# Example row (commented out — replace the values, then remove the leading #):',
    `# ${exampleRow}`,
    '#',
    headerRow,
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export async function buildXlsxTemplate(options: TemplateOptions): Promise<Uint8Array> {
  const dataSet = OPENING_DATA_SETS[options.dataSet];
  const fields = openingFieldList(options.dataSet, options.ownerColumns);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Strapla';
  workbook.created = new Date();
  workbook.modified = new Date();

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [
    { key: 'column', width: 38 },
    { key: 'type', width: 12 },
    { key: 'required', width: 12 },
    { key: 'description', width: 70 },
    { key: 'example', width: 42 },
  ];

  const title = instructions.addRow([`Strapla opening-balance import — ${dataSet.title}`]);
  title.font = { bold: true, size: 14 };
  instructions.addRow([dataSet.description]);
  instructions.addRow([`Data set: ${dataSet.id} · ${fields.length} columns · generated from the declared field list.`]);
  instructions.addRow([]);

  const howTo = instructions.addRow(['How to fill this template']);
  howTo.font = { bold: true };
  for (const line of [
    '1. Fill the Data sheet. Row 1 is the header; one record per row; no blank rows inside the data.',
    '2. Do not rename or add columns on the Data sheet: undeclared columns are rejected. Column order does not matter.',
    `3. Types: ${entryOf(TYPE_RULES)
      .map(([type, rule]) => `${type} = ${rule}`)
      .join('; ')}.`,
    `4. Load reason convention: ${openingReasonConvention(options.closingFiscalYear)}`,
    '5. Amounts are whole Rupiah. Extra owner-added columns come from the declared field list, not from this sheet.',
  ]) {
    instructions.addRow([line]);
  }
  instructions.addRow([]);

  const columnsHeader = instructions.addRow(['Column', 'Type', 'Required', 'Description', 'Example']);
  columnsHeader.font = { bold: true };
  for (const field of fields) {
    instructions.addRow([
      field.label,
      field.type,
      field.required ? 'required' : 'optional',
      field.description,
      field.example,
    ]);
  }
  instructions.addRow([]);

  const exampleTitle = instructions.addRow(['Example row']);
  exampleTitle.font = { bold: true };
  instructions.addRow(fields.map((field) => field.label));
  instructions.addRow(fields.map((field) => field.example));

  const data = workbook.addWorksheet('Data');
  data.columns = fields.map((field) => ({
    header: field.label,
    key: field.name,
    width: Math.max(18, Math.min(42, field.label.length + 4)),
  }));
  data.getRow(1).font = { bold: true };
  data.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function entryOf(rules: Record<OpeningFieldType, string>): Array<[OpeningFieldType, string]> {
  return Object.entries(rules) as Array<[OpeningFieldType, string]>;
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
