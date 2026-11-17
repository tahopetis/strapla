#!/usr/bin/env node
/**
 * Opening-balance import command line (W3a).
 *
 *   template <data-set> --closing-fiscal-year 2026 [--format csv|xlsx] [--out <path>]
 *   validate <data-set> <file>
 *
 * The dry-run harness (`validate`) only reads: it prints per-line results and never
 * writes to the database. Templates are generated from the same declared field list
 * the parser validates against.
 *
 * Relative imports keep the `.ts` extension so Node can run this file directly with
 * its type stripping (Node >= 24, the repo engine); `allowImportingTsExtensions` in
 * tsconfig keeps TypeScript happy and the app never imports this script.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  OPENING_DATA_SETS,
  isOpeningDataSetId,
  openingFieldList,
  openingReasonConvention,
  type OpeningDataSetId,
} from '../src/lib/opening-import/field-list.ts';
import { dryRunImport, formatDryRunReport } from '../src/lib/opening-import/dry-run.ts';
import {
  buildCsvTemplate,
  buildXlsxTemplate,
  templateFileName,
} from '../src/lib/opening-import/template.ts';

const DATA_SETS = Object.keys(OPENING_DATA_SETS).join(', ');

const USAGE = `Opening-balance import (W3a)

Usage:
  node scripts/opening-import.ts template <data-set> --closing-fiscal-year <year> [--format csv|xlsx] [--out <path>]
  node scripts/opening-import.ts validate <data-set> <file>

Data sets: ${DATA_SETS}

Examples:
  pnpm opening:template annual-programs --closing-fiscal-year 2026 --format csv
  pnpm opening:validate annual-programs fixtures/opening-import/annual-programs.sample.csv
`;

class CliError extends Error {}

async function run(argv: readonly string[]): Promise<number> {
  try {
    const { flags, positional } = parseArgs(argv);
    const command = positional.shift();

    switch (command) {
      case 'template':
        return await template(positional, flags);
      case 'validate':
        return await validate(positional);
      case undefined:
        throw new CliError('Missing command.');
      default:
        throw new CliError(`Unknown command "${command}".`);
    }
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      console.error('');
      console.error(USAGE);
      return 2;
    }
    throw error;
  }
}

function parseArgs(argv: readonly string[]): {
  flags: Record<string, string>;
  positional: string[];
} {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument.startsWith('--')) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`The option ${argument} needs a value.`);
      }
      flags[argument.slice(2)] = value;
      index += 1;
    } else {
      positional.push(argument);
    }
  }
  return { flags, positional };
}

function requireDataSet(value: string | undefined): OpeningDataSetId {
  if (value === undefined) throw new CliError('A data set is required.');
  if (!isOpeningDataSetId(value)) {
    throw new CliError(`Unknown data set "${value}". Expected one of: ${DATA_SETS}.`);
  }
  return value;
}

function requireClosingFiscalYear(value: string | undefined): number {
  if (value === undefined) {
    throw new CliError(
      '--closing-fiscal-year is required; it is the fiscal year being closed (for example 2026 for the FY2027 cut-over).',
    );
  }
  const year = Number(value);
  try {
    openingReasonConvention(year);
  } catch {
    throw new CliError(
      `--closing-fiscal-year must be a four-digit year between 2000 and 2100 (got "${value}").`,
    );
  }
  return year;
}

async function template(
  positional: string[],
  flags: Record<string, string>,
): Promise<number> {
  const dataSet = requireDataSet(positional[0]);
  if (positional.length > 1) throw new CliError(`Unexpected argument "${positional[1]}".`);
  const closingFiscalYear = requireClosingFiscalYear(flags['closing-fiscal-year']);
  const format = flags.format ?? 'xlsx';
  if (format !== 'csv' && format !== 'xlsx') {
    throw new CliError(`Unknown format "${format}". Expected csv or xlsx.`);
  }
  const out = resolve(flags.out ?? templateFileName(dataSet, format));

  if (format === 'csv') {
    await writeFile(out, buildCsvTemplate({ dataSet, closingFiscalYear }), 'utf8');
  } else {
    await writeFile(out, await buildXlsxTemplate({ dataSet, closingFiscalYear }));
  }

  console.log(
    `Wrote ${out} (${format}, ${openingFieldList(dataSet).length} columns, reason convention: ${openingReasonConvention(closingFiscalYear)}).`,
  );
  return 0;
}

async function validate(positional: string[]): Promise<number> {
  const dataSet = requireDataSet(positional[0]);
  const file = positional[1];
  if (file === undefined) throw new CliError('A file to validate is required.');
  if (positional.length > 2) throw new CliError(`Unexpected argument "${positional[2]}".`);

  try {
    const bytes = new Uint8Array(await readFile(file));
    const report = await dryRunImport({ dataSet, bytes });
    console.log(formatDryRunReport(report, basename(file)));
    return report.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new CliError(`Cannot read "${file}": the file does not exist.`);
    }
    throw error;
  }
}

process.exitCode = await run(process.argv.slice(2));
