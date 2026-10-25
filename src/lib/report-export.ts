import ExcelJS from 'exceljs';

/**
 * Generic report export primitives (M2 #15). The same table definitions feed
 * the CSV and XLSX writers, so both exports always match the on-screen report.
 */

export type ExportColumnKind = 'text' | 'money' | 'number';

export interface ExportColumn {
  key: string;
  header: string;
  kind?: ExportColumnKind;
}

export interface ExportTable {
  name: string;
  columns: ExportColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface ExportDocument {
  title: string;
  subtitle: string;
  generatedAt: Date;
  note?: string;
  tables: ExportTable[];
}

function escapeCsv(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(document: ExportDocument): string {
  const lines: string[] = [];
  lines.push(escapeCsv(document.title));
  lines.push(escapeCsv(document.subtitle));
  lines.push(`Generated,${escapeCsv(document.generatedAt.toISOString())}`);
  if (document.note) lines.push(escapeCsv(document.note));
  for (const table of document.tables) {
    lines.push('');
    lines.push(escapeCsv(table.name));
    lines.push(table.columns.map((column) => escapeCsv(column.header)).join(','));
    for (const row of table.rows) {
      lines.push(table.columns.map((column) => escapeCsv(row[column.key] ?? null)).join(','));
    }
  }
  lines.push('');
  return lines.join('\r\n');
}

function sheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
}

export async function toXlsx(document: ExportDocument): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Strapla';
  workbook.created = document.generatedAt;
  workbook.modified = document.generatedAt;

  const about = workbook.addWorksheet('About');
  about.columns = [
    { header: 'Field', key: 'field', width: 24 },
    { header: 'Value', key: 'value', width: 100 },
  ];
  about.addRows([
    { field: 'Report', value: document.title },
    { field: 'Scope', value: document.subtitle },
    { field: 'Generated', value: document.generatedAt.toISOString() },
    { field: 'Currency', value: 'IDR, whole Rupiah (raw numbers in cells)' },
    ...(document.note ? [{ field: 'Note', value: document.note }] : []),
  ]);
  about.getRow(1).font = { bold: true };

  for (const table of document.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.name));
    sheet.columns = table.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: Math.max(14, Math.min(40, column.header.length + 4)),
      style:
        column.kind === 'money' || column.kind === 'number'
          ? { numFmt: '#,##0', alignment: { horizontal: 'right' } }
          : undefined,
    }));
    for (const row of table.rows) {
      sheet.addRow(row);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
