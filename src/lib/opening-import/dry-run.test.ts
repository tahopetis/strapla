import { describe, expect, it } from 'vitest';
import { dryRunImport, formatDryRunReport } from './dry-run';

const GOOD_CSV = [
  'Code,Name,Strategic initiative code,Capex budget (Rp),Opex budget (Rp)',
  'PRG-01,Platform modernisation,SI-01,8000000000,2500000000',
  'PRG-02,Network refresh,SI-02,1200000000,300000000',
].join('\r\n');

const MIXED_CSV = [
  'Code,Name,Strategic initiative code,Capex budget (Rp),Opex budget (Rp)',
  'PRG-01,Platform modernisation,SI-01,8000000000,2500000000',
  'PRG-02,Network refresh,SI-02,not-a-number,300000000',
].join('\r\n');

const BAD_CSV = [
  'Code,Name,Strategic initiative code,Capex budget (Rp),Opex budget (Rp)',
  'PRG-01,Platform modernisation,SI-01,eight billion,2500000000',
  ',Network refresh,SI-02,1200000000,300000000',
].join('\r\n');

describe('dryRunImport', () => {
  it('returns the validated rows for a good file', async () => {
    const report = await dryRunImport({ dataSet: 'annual-programs', bytes: GOOD_CSV });
    expect(report.ok).toBe(true);
    expect(report.validRows).toHaveLength(2);
    expect(report.errors).toEqual([]);
  });

  it('returns only errors for a bad file — nothing is written', async () => {
    const report = await dryRunImport({ dataSet: 'annual-programs', bytes: BAD_CSV });
    expect(report.ok).toBe(false);
    expect(report.validRows).toEqual([]);
    expect(report.errors).toHaveLength(2);
    expect(report.errors.map((error) => error.line)).toEqual([2, 3]);
  });
});

describe('dryRunImport — mixed file', () => {
  it('reports the rows that did validate alongside the errors', async () => {
    const report = await dryRunImport({ dataSet: 'annual-programs', bytes: MIXED_CSV });
    expect(report.ok).toBe(false);
    expect(report.validRows).toHaveLength(1);
    expect(report.errors).toHaveLength(1);

    const text = formatDryRunReport(report, 'annual-programs.mixed.csv');
    expect(text).toContain('line 2: OK');
    expect(text).toContain('line 3: ERROR column "Capex budget (Rp)"');
    expect(text).toContain('Result: INVALID — 1 error(s). Nothing would be written.');
  });
});

describe('formatDryRunReport', () => {
  it('prints a per-line result for a valid file', async () => {
    const report = await dryRunImport({ dataSet: 'annual-programs', bytes: GOOD_CSV });
    const text = formatDryRunReport(report, 'annual-programs.sample.csv');

    expect(text).toContain('Opening-balance import dry run — Annual programs');
    expect(text).toContain('File: annual-programs.sample.csv');
    expect(text).toContain('line 2: OK');
    expect(text).toContain('line 3: OK');
    expect(text).toContain('code=PRG-01');
    expect(text).toContain('Result: VALID — 2 row(s) ready to import.');
  });

  it('prints every error by line and states that nothing would be written', async () => {
    const report = await dryRunImport({ dataSet: 'annual-programs', bytes: BAD_CSV });
    const text = formatDryRunReport(report, 'annual-programs.invalid.csv');

    expect(text).toContain(
      'line 2: ERROR column "Capex budget (Rp)": Capex budget (Rp) must be a whole, non-negative number (got "eight billion").',
    );
    expect(text).toContain('line 3: ERROR column "Code": Code is required.');
    expect(text).toContain('Result: INVALID — 2 error(s). Nothing would be written.');
    expect(text).not.toContain('OK');
  });

  it('reports a header-only template as a valid empty load', async () => {
    const report = await dryRunImport({
      dataSet: 'annual-programs',
      bytes: 'Code,Name,Strategic initiative code,Capex budget (Rp),Opex budget (Rp)',
    });
    const text = formatDryRunReport(report);
    expect(text).toContain('Result: VALID — 0 row(s) ready to import.');
  });
});
