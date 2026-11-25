import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { OpeningField } from './field-list';
import { parseOpeningImport } from './parse';

/**
 * The committed sample workbooks are fictitious: they are never real portfolio data
 * (the FY2026 workbook stays off-repo). The XLSX sample is generated from the CSV
 * sample, and this suite keeps the two in agreement.
 */

const FIXTURES = new URL('../../../fixtures/opening-import/', import.meta.url);

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(name, FIXTURES)));
}

const OWNER_COLUMN: OpeningField = {
  name: 'procurementMethod',
  label: 'Procurement method',
  type: 'text',
  required: true,
  description: 'Owner-added column: how the program is procured.',
  example: 'Tender',
};

describe('sample workbooks', () => {
  it('parses the strategic initiative sample', async () => {
    const result = await parseOpeningImport({
      dataSet: 'strategic-initiatives',
      bytes: await fixture('strategic-initiatives.sample.csv'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.values).toMatchObject({
      code: 'SI-01',
      envelopeCapex: 9_500_000_000,
      envelopeOpex: 3_000_000_000,
      priorCapex: 2_200_000_000,
      priorOpex: 1_050_000_000,
    });
  });

  it('parses the annual program sample', async () => {
    const result = await parseOpeningImport({
      dataSet: 'annual-programs',
      bytes: await fixture('annual-programs.sample.csv'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    expect(result.rows[1]?.values).toMatchObject({
      code: 'PRG-02',
      prevProgramCode: null,
      carryInCapex: null,
    });
  });

  it('parses the project sample from both CSV and XLSX to the same rows', async () => {
    const fromCsv = await parseOpeningImport({
      dataSet: 'projects',
      bytes: await fixture('projects.sample.csv'),
    });
    const fromXlsx = await parseOpeningImport({
      dataSet: 'projects',
      bytes: await fixture('projects.sample.xlsx'),
    });

    expect(fromCsv.ok).toBe(true);
    expect(fromXlsx.ok).toBe(true);
    if (!fromCsv.ok || !fromXlsx.ok) return;
    expect(fromXlsx.rows).toEqual(fromCsv.rows);
    expect(fromCsv.rows[1]?.values.ijinPrinsipDocumentDate).toBe('2026-04-30');
    expect(fromCsv.rows[2]?.values.submittedPrice).toBeNull();
  });

  it('reports the invalid project sample by line', async () => {
    const result = await parseOpeningImport({
      dataSet: 'projects',
      bytes: await fixture('projects.invalid.csv'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => [error.line, error.column])).toEqual([
      [3, 'Name'],
      [3, 'Full-life allocated budget (Rp)'],
      [3, 'Ijin prinsip document date'],
      [4, 'Opening actual spend (Rp)'],
    ]);
  });

  it('rejects the owner-column sample until the column is declared', async () => {
    const bytes = await fixture('annual-programs.owner-column.sample.csv');
    const undeclared = await parseOpeningImport({ dataSet: 'annual-programs', bytes });
    expect(undeclared.ok).toBe(false);

    const declared = await parseOpeningImport({
      dataSet: 'annual-programs',
      bytes,
      ownerColumns: [OWNER_COLUMN],
    });
    expect(declared.ok).toBe(true);
    if (declared.ok) expect(declared.rows[0]?.values.procurementMethod).toBe('Tender');
  });
});
