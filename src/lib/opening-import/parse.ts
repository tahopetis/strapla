import ExcelJS from 'exceljs';
import { assertRupiah } from '../../domain/money.ts';
import {
  openingFieldList,
  type DeclaredOpeningField,
  type OpeningDataSetId,
  type OpeningField,
} from './field-list.ts';

/**
 * Opening-balance import parser and validator (W3a).
 *
 * Reads one template-shaped file (CSV or XLSX), type-checks every declared column,
 * rejects undeclared columns, and reports every problem by line number. The module
 * returns validated rows or errors and never touches the database, so a failed
 * validation can never write anything (zero writes on any failure).
 */

export interface ParseError {
  /** Physical file line (CSV) or spreadsheet row number (XLSX), 1-based. */
  line: number;
  /** Declared column header, or File / Sheet / Row for file-level problems. */
  column: string;
  message: string;
}

export type ParsedValue = string | number | null;

export interface ParsedRow {
  line: number;
  values: Record<string, ParsedValue>;
}

export type ParseResult =
  | { ok: true; rows: ParsedRow[] }
  | { ok: false; errors: ParseError[] };

export interface ParseOptions {
  dataSet: OpeningDataSetId;
  /** File bytes. A string is treated as CSV text (convenient for tests and harnesses). */
  bytes: Uint8Array | ArrayBuffer | string;
  /** Owner-added columns; defaults to the committed field list config. */
  ownerColumns?: readonly OpeningField[];
}

type RawCell =
  | { kind: 'blank' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'date'; iso: string };

interface SourceRecord {
  line: number;
  cells: RawCell[];
}

class FileError extends Error {
  readonly line: number;
  readonly column: string;

  constructor(line: number, column: string, message: string) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

const BLANK: RawCell = { kind: 'blank' };

/**
 * Full validation view: every error, plus the rows that did validate. The dry run
 * uses this to print a result per line even when the file as a whole is rejected;
 * `parseOpeningImport` is the all-or-nothing contract for callers that will load.
 */
export interface OpeningImportInspection {
  ok: boolean;
  rows: ParsedRow[];
  errors: ParseError[];
}

export async function parseOpeningImport(options: ParseOptions): Promise<ParseResult> {
  const inspection = await inspectOpeningImport(options);
  return inspection.ok
    ? { ok: true, rows: inspection.rows }
    : { ok: false, errors: inspection.errors };
}

export async function inspectOpeningImport(options: ParseOptions): Promise<OpeningImportInspection> {
  const fields = openingFieldList(options.dataSet, options.ownerColumns);

  let records: SourceRecord[];
  try {
    records = await readRecords(options);
  } catch (error) {
    if (error instanceof FileError) {
      return {
        ok: false,
        rows: [],
        errors: [{ line: error.line, column: error.column, message: error.message }],
      };
    }
    throw error;
  }

  return validateRecords(records, fields);
}

// ---------------------------------------------------------------- reading

async function readRecords(options: ParseOptions): Promise<SourceRecord[]> {
  if (typeof options.bytes === 'string') {
    return parseCsv(options.bytes);
  }
  const bytes =
    options.bytes instanceof Uint8Array ? options.bytes : new Uint8Array(options.bytes);
  if (isZip(bytes)) return readXlsx(bytes);
  return parseCsv(new TextDecoder('utf-8').decode(bytes));
}

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

async function readXlsx(bytes: Uint8Array): Promise<SourceRecord[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    throw new FileError(1, 'File', 'The file could not be read as an XLSX workbook.');
  }

  const sheet = workbook.getWorksheet('Data');
  if (!sheet) {
    throw new FileError(
      1,
      'Sheet',
      'The workbook has no "Data" worksheet. Start from the generated template.',
    );
  }

  const records: SourceRecord[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: RawCell[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      cells.push(normalizeCell(row.getCell(column).value));
    }
    records.push({ line: row.number, cells });
  });
  return records;
}

function normalizeCell(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return BLANK;
  if (typeof value === 'string') return value === '' ? BLANK : { kind: 'text', text: value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'boolean') return { kind: 'text', text: String(value) };
  if (value instanceof Date) return { kind: 'date', iso: isoFromDate(value) };

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      const text = value.richText.map((part) => part.text).join('');
      return text === '' ? BLANK : { kind: 'text', text };
    }
    if ('hyperlink' in value && 'text' in value) {
      return { kind: 'text', text: String(value.text) };
    }
    if ('error' in value) {
      return { kind: 'text', text: String(value.error) };
    }
    if ('result' in value) {
      return normalizeCell(value.result as ExcelJS.CellValue);
    }
  }

  return { kind: 'text', text: String(value) };
}

function isoFromDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(
    date.getUTCDate(),
    2,
  )}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** A small RFC-4180 reader: quoted values, doubled quotes, embedded newlines. */
function parseCsv(text: string): SourceRecord[] {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const records: SourceRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    cells.push(cell);
    records.push({
      line: recordLine,
      cells: cells.map((value) => (value === '' ? BLANK : { kind: 'text', text: value })),
    });
    cells = [];
    cell = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (character === '\n') line += 1;
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell === '') {
      inQuotes = true;
      quoteLine = line;
    } else if (character === ',') {
      cells.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    throw new FileError(quoteLine, 'File', `Unterminated quoted value starting on line ${quoteLine}.`);
  }
  if (cell !== '' || cells.length > 0) endRecord();

  return records;
}

// ---------------------------------------------------------------- validation

function validateRecords(
  records: readonly SourceRecord[],
  fields: readonly DeclaredOpeningField[],
): OpeningImportInspection {
  const meaningful = records.filter((record) => !isBlank(record) && !isComment(record));
  if (meaningful.length === 0) {
    return {
      ok: false,
      rows: [],
      errors: [{ line: 1, column: 'File', message: 'The file is empty.' }],
    };
  }

  const header = meaningful[0] as SourceRecord;
  const dataRecords = meaningful.slice(1);
  const headerCells = header.cells.map(cellText);
  while (headerCells.length > 0 && (headerCells[headerCells.length - 1] as string).trim() === '') {
    headerCells.pop();
  }

  const errors: ParseError[] = [];
  const labelToIndex = new Map<string, number>();
  const labels = fields.map((field) => field.label);

  headerCells.forEach((rawLabel, index) => {
    const label = rawLabel.trim();
    if (label === '') {
      errors.push({
        line: header.line,
        column: `Column ${index + 1}`,
        message: `Column ${index + 1} has no header.`,
      });
      return;
    }
    if (!labels.includes(label)) {
      errors.push({
        line: header.line,
        column: label,
        message: `Unknown column "${label}". Add it to the declared field list or remove it from the file.`,
      });
      return;
    }
    if (labelToIndex.has(label)) {
      errors.push({ line: header.line, column: label, message: `Duplicate column "${label}".` });
      return;
    }
    labelToIndex.set(label, index);
  });

  for (const field of fields) {
    if (field.required && !labelToIndex.has(field.label)) {
      errors.push({
        line: header.line,
        column: field.label,
        message: `Missing required column "${field.label}".`,
      });
    }
  }

  // Header errors make the column mapping unreliable: stop before validating rows.
  if (errors.length > 0) return { ok: false, rows: [], errors };

  const rows: ParsedRow[] = [];
  for (const record of dataRecords) {
    const rowErrors: ParseError[] = [];
    const values: Record<string, ParsedValue> = {};

    const valueCount = lastValueIndex(record.cells);
    if (valueCount > headerCells.length) {
      rowErrors.push({
        line: record.line,
        column: 'Row',
        message: `The row has ${valueCount} values but the file declares ${headerCells.length} columns.`,
      });
    }

    for (const field of fields) {
      const index = labelToIndex.get(field.label);
      if (index === undefined) {
        values[field.name] = null;
        continue;
      }
      const raw = record.cells[index] ?? BLANK;
      const parsed = parseCell(field, raw);
      if (parsed.ok) {
        values[field.name] = parsed.value;
      } else {
        rowErrors.push({ line: record.line, column: field.label, message: parsed.message });
      }
    }

    if (rowErrors.length > 0) errors.push(...rowErrors);
    else rows.push({ line: record.line, values });
  }

  if (errors.length > 0) return { ok: false, rows, errors };
  return { ok: true, rows, errors: [] };
}

type CellResult = { ok: true; value: ParsedValue } | { ok: false; message: string };

function parseCell(field: DeclaredOpeningField, raw: RawCell): CellResult {
  if (raw.kind === 'blank' || (raw.kind === 'text' && raw.text.trim() === '')) {
    return field.required
      ? { ok: false, message: `${field.label} is required.` }
      : { ok: true, value: null };
  }

  if (field.type === 'text') {
    return { ok: true, value: cellText(raw) };
  }
  if (field.type === 'number') {
    return parseNumberCell(field, raw);
  }
  return parseDateCell(field, raw);
}

function parseNumberCell(field: DeclaredOpeningField, raw: RawCell): CellResult {
  if (raw.kind === 'number') {
    try {
      return { ok: true, value: assertRupiah(raw.value) };
    } catch {
      return { ok: false, message: `${field.label} must be a whole, non-negative number.` };
    }
  }
  if (raw.kind === 'text') {
    const value = parseWholeNumber(raw.text);
    if (value !== null) return { ok: true, value };
    return {
      ok: false,
      message: `${field.label} must be a whole, non-negative number (got "${raw.text.trim()}").`,
    };
  }
  return { ok: false, message: `${field.label} must be a whole, non-negative number (got a date).` };
}

function parseDateCell(field: DeclaredOpeningField, raw: RawCell): CellResult {
  if (raw.kind === 'date') return { ok: true, value: raw.iso };
  if (raw.kind === 'text') {
    const value = parseIsoDate(raw.text);
    if (value !== null) return { ok: true, value };
    return {
      ok: false,
      message: `${field.label} must be a date (YYYY-MM-DD or DD/MM/YYYY, got "${raw.text.trim()}").`,
    };
  }
  return { ok: false, message: `${field.label} must be a date (YYYY-MM-DD or DD/MM/YYYY).` };
}

/**
 * Whole, non-negative numbers; dots may group thousands (1.234.567) and "Rp" is
 * tolerated. The format is stricter than the form's `parseRupiah` on purpose: an
 * ambiguous "1.5" is rejected rather than read as 15. The money semantics
 * (safe integer, non-negative) still come from `assertRupiah`, so they live in one
 * module (ADR-0003).
 */
function parseWholeNumber(text: string): number | null {
  const withoutCurrency = text
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .trim();
  const compact = withoutCurrency.replace(/\s+/g, '');
  if (!/^\d+$/.test(compact) && !/^\d{1,3}(\.\d{3})+$/.test(compact)) return null;
  try {
    return assertRupiah(Number(compact.replaceAll('.', '')));
  } catch {
    return null;
  }
}

function parseIsoDate(text: string): string | null {
  const trimmed = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);

  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function lastValueIndex(cells: readonly RawCell[]): number {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (!isBlankCell(cells[index] as RawCell)) return index + 1;
  }
  return 0;
}

function isBlank(record: SourceRecord): boolean {
  return record.cells.every(isBlankCell);
}

function isBlankCell(cell: RawCell): boolean {
  return cell.kind === 'blank' || (cell.kind === 'text' && cell.text.trim() === '');
}

function isComment(record: SourceRecord): boolean {
  const first = record.cells[0];
  if (!first) return false;
  return (first.kind === 'text' && first.text.trimStart().startsWith('#')) || false;
}

function cellText(cell: RawCell): string {
  switch (cell.kind) {
    case 'text':
      return cell.text.trim();
    case 'number':
      return String(cell.value);
    case 'date':
      return cell.iso;
    default:
      return '';
  }
}
