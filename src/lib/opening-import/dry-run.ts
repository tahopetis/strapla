import { OPENING_DATA_SETS, type OpeningDataSetId } from './field-list.ts';
import {
  inspectOpeningImport,
  type ParseError,
  type ParseOptions,
  type ParsedRow,
  type ParsedValue,
} from './parse.ts';

/**
 * Dry-run harness (W3a): run a file through the parser and print per-line results.
 * It validates only — there is no write path here, so a dry run can never change data.
 */

export interface DryRunReport {
  dataSet: OpeningDataSetId;
  dataSetTitle: string;
  ok: boolean;
  /** Rows that validated; on a failed file they are shown but would not load. */
  validRows: ParsedRow[];
  errors: ParseError[];
}

export async function dryRunImport(options: ParseOptions): Promise<DryRunReport> {
  const inspection = await inspectOpeningImport(options);
  return {
    dataSet: options.dataSet,
    dataSetTitle: OPENING_DATA_SETS[options.dataSet].title,
    ok: inspection.ok,
    validRows: inspection.rows,
    errors: inspection.errors,
  };
}

export function formatDryRunReport(report: DryRunReport, fileName?: string): string {
  const lines = [
    `Opening-balance import dry run — ${report.dataSetTitle}`,
    `File: ${fileName ?? '(text)'}`,
  ];

  const results = [
    ...report.validRows.map((row) => ({
      line: row.line,
      text: `line ${row.line}: OK  ${summarizeValues(row.values)}`,
    })),
    ...report.errors.map((error) => ({
      line: error.line,
      text: `line ${error.line}: ERROR column "${error.column}": ${error.message}`,
    })),
  ].sort((left, right) => left.line - right.line);
  for (const result of results) lines.push(result.text);

  if (report.ok) {
    lines.push(`Result: VALID — ${report.validRows.length} row(s) ready to import.`);
  } else {
    lines.push(`Result: INVALID — ${report.errors.length} error(s). Nothing would be written.`);
  }

  return lines.join('\n');
}

function summarizeValues(values: Record<string, ParsedValue>): string {
  const summary = Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(' · ');
  return summary.length > 200 ? `${summary.slice(0, 199)}…` : summary;
}
