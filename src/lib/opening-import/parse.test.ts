import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { OpeningField } from './field-list';
import { parseOpeningImport } from './parse';
import { buildCsvTemplate } from './template';

const SI_HEADER =
  'Code,Name,Owner,Objective,Capex envelope (Rp),Opex envelope (Rp),Prior program budget consumed — capex (Rp),Prior program budget consumed — opex (Rp),Notes';

function parseCsv(csv: string, dataSet: Parameters<typeof parseOpeningImport>[0]['dataSet'] = 'strategic-initiatives') {
  return parseOpeningImport({ dataSet, bytes: csv });
}

function errorsOf(result: Awaited<ReturnType<typeof parseOpeningImport>>) {
  if (result.ok) throw new Error('expected the parse to fail');
  return result.errors;
}

describe('parseOpeningImport — a good CSV file', () => {
  it('returns typed rows with their line numbers', async () => {
    const result = await parseCsv(
      [
        SI_HEADER,
        'SI-01,Digital service platform,Chief Information Officer,Consolidate services.,9500000000,3000000000,2200000000,1050000000,Signed off.',
        'SI-02,Network,"O\'Brien, network team",,1000000,0,0,0,',
      ].join('\r\n'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      line: 2,
      values: {
        code: 'SI-01',
        name: 'Digital service platform',
        owner: 'Chief Information Officer',
        objective: 'Consolidate services.',
        envelopeCapex: 9_500_000_000,
        envelopeOpex: 3_000_000_000,
        priorCapex: 2_200_000_000,
        priorOpex: 1_050_000_000,
        notes: 'Signed off.',
      },
    });
    expect(result.rows[1]).toEqual({
      line: 3,
      values: {
        code: 'SI-02',
        name: 'Network',
        owner: "O'Brien, network team",
        objective: null,
        envelopeCapex: 1_000_000,
        envelopeOpex: 0,
        priorCapex: 0,
        priorOpex: 0,
        notes: null,
      },
    });
  });

  it('accepts a quoted value containing a newline and keeps later line numbers right', async () => {
    const result = await parseCsv(
      [
        SI_HEADER,
        'SI-01,Digital,"Owner",,100,0,0,0,"First line',
        'second line"',
        'BAD,Name,,,not-a-number,0,0,0,',
      ].join('\n'),
    );

    const errors = errorsOf(result);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 4, column: 'Capex envelope (Rp)' });
  });

  it('fills columns that are absent from the file with null', async () => {
    const result = await parseCsv('Code,Name,Capex envelope (Rp),Opex envelope (Rp)\r\nSI-01,Digital,1000,250');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.values).toEqual({
      code: 'SI-01',
      name: 'Digital',
      owner: null,
      objective: null,
      envelopeCapex: 1000,
      envelopeOpex: 250,
      priorCapex: null,
      priorOpex: null,
      notes: null,
    });
  });

  it('ignores comment and blank lines, preserving physical line numbers', async () => {
    const result = await parseCsv(
      [
        '# generated template',
        '#',
        '',
        SI_HEADER,
        '',
        'SI-01,Digital,,,1000,0,0,0,',
        'BAD,Name,,,abc,0,0,0,',
      ].join('\r\n'),
    );

    const errors = errorsOf(result);
    expect(errors[0]).toMatchObject({ line: 7, column: 'Capex envelope (Rp)' });
  });

  it('parses a header-only template as zero rows', async () => {
    const result = await parseCsv(`${SI_HEADER}\r\n`);
    expect(result).toEqual({ ok: true, rows: [] });
  });

  it('strips a UTF-8 BOM', async () => {
    const result = await parseCsv(`\uFEFF${SI_HEADER}\r\nSI-01,Digital,,,1000,0,`);
    expect(result.ok).toBe(true);
  });
});

describe('parseOpeningImport — unknown and missing columns', () => {
  it('rejects an undeclared column instead of dropping it', async () => {
    const errors = errorsOf(
      await parseCsv(`${SI_HEADER},Cost centre\r\nSI-01,Digital,,,1000,0,0,0,,CC-1`),
    );
    expect(errors).toContainEqual({
      line: 1,
      column: 'Cost centre',
      message:
        'Unknown column "Cost centre". Add it to the declared field list or remove it from the file.',
    });
  });

  it('rejects a duplicate column header', async () => {
    const errors = errorsOf(await parseCsv(`${SI_HEADER},Name\r\nSI-01,Digital,,,1000,0,0,0,,again`));
    expect(errors).toContainEqual({
      line: 1,
      column: 'Name',
      message: 'Duplicate column "Name".',
    });
  });

  it('rejects a file that is missing a required column', async () => {
    const errors = errorsOf(await parseCsv('Code,Name\r\nSI-01,Digital'));
    expect(errors).toContainEqual({
      line: 1,
      column: 'Capex envelope (Rp)',
      message: 'Missing required column "Capex envelope (Rp)".',
    });
  });

  it('rejects a row with more values than declared columns', async () => {
    const errors = errorsOf(await parseCsv(`${SI_HEADER}\r\nSI-01,Digital,,,1000,0,0,0,,extra`));
    expect(errors).toContainEqual({
      line: 2,
      column: 'Row',
      message: 'The row has 10 values but the file declares 9 columns.',
    });
  });

  it('rejects a data cell with no column header above it', async () => {
    const errors = errorsOf(await parseCsv(`${SI_HEADER},\r\nSI-01,Digital,,,1000,0,0,0,,CC-1`));
    expect(errors[0]).toMatchObject({ line: 2, column: 'Row' });
  });

  it('reports an empty file', async () => {
    const errors = errorsOf(await parseCsv(''));
    expect(errors).toEqual([{ line: 1, column: 'File', message: 'The file is empty.' }]);
  });
});

describe('parseOpeningImport — declared types', () => {
  it('parses number columns: digits, grouped thousands, spaces and an Rp prefix', async () => {
    for (const input of ['1234567', '1.234.567', '1 234 567', 'Rp 1.234.567', 'Rp1234567']) {
      const result = await parseCsv(`${SI_HEADER}\r\nSI-01,Digital,,,${input},0,0,0,`);
      expect(result.ok, input).toBe(true);
      if (result.ok) expect(result.rows[0]?.values.envelopeCapex).toBe(1_234_567);
    }
  });

  it('rejects number values that are not whole, non-negative Rupiah', async () => {
    for (const [input, message] of [
      ['abc', 'Capex envelope (Rp) must be a whole, non-negative number (got "abc").'],
      ['-5', 'Capex envelope (Rp) must be a whole, non-negative number (got "-5").'],
      ['1.5', 'Capex envelope (Rp) must be a whole, non-negative number (got "1.5").'],
    ] as const) {
      const errors = errorsOf(await parseCsv(`${SI_HEADER}\r\nSI-01,Digital,,,${input},0,0,0,`));
      expect(errors).toContainEqual({ line: 2, column: 'Capex envelope (Rp)', message });
    }
  });

  it('parses dates in ISO and Indonesian order, returning ISO', async () => {
    const header =
      'Name,Originating program code,Start fiscal year,End fiscal year,Full-life allocated budget (Rp),Ijin prinsip document date';
    for (const [input, expected] of [
      ['2026-03-31', '2026-03-31'],
      ['31/03/2026', '2026-03-31'],
      ['1/3/2026', '2026-03-01'],
    ] as const) {
      const result = await parseOpeningImport({
        dataSet: 'projects',
        bytes: `${header}\r\nCore network,PRG-01,2027,2028,1000,${input}`,
      });
      expect(result.ok, input).toBe(true);
      if (result.ok) expect(result.rows[0]?.values.ijinPrinsipDocumentDate).toBe(expected);
    }
  });

  it('rejects impossible or malformed dates with their line', async () => {
    const header =
      'Name,Originating program code,Start fiscal year,End fiscal year,Full-life allocated budget (Rp),Ijin prinsip document date';
    for (const input of ['2026-02-30', '31/02/2026', '2026-3-1', 'tomorrow', '2026-13-01']) {
      const errors = errorsOf(
        await parseOpeningImport({
          dataSet: 'projects',
          bytes: `${header}\r\nCore network,PRG-01,2027,2028,1000,${input}`,
        }),
      );
      expect(errors[0]).toMatchObject({ line: 2, column: 'Ijin prinsip document date' });
      expect(errors[0]?.message).toContain('must be a date');
    }
  });

  it('rejects a blank required column and accepts a blank optional one', async () => {
    const errors = errorsOf(await parseCsv(`${SI_HEADER}\r\n,Digital,,,1000,0,`));
    expect(errors).toEqual([
      { line: 2, column: 'Code', message: 'Code is required.' },
    ]);
    const ok = await parseCsv(`${SI_HEADER}\r\nSI-01,Digital,,,1000,0,,`);
    expect(ok.ok).toBe(true);
  });

  it('reports every bad row, by line, in one pass', async () => {
    const errors = errorsOf(
      await parseCsv(
        [
          SI_HEADER,
          'SI-01,Digital,,,abc,0,',
          'SI-02,Network,,,1000,0,0,0,',
          'SI-03,,,,-1,0,0,0,',
        ].join('\r\n'),
      ),
    );
    expect(errors.map((error) => error.line)).toEqual([2, 4, 4]);
  });
});

describe('parseOpeningImport — XLSX', () => {
  it('reads the Data sheet, including numeric and date cells', async () => {
    const workbook = new ExcelJS.Workbook();
    const data = workbook.addWorksheet('Data');
    data.addRow([
      'Name',
      'Originating program code',
      'Start fiscal year',
      'End fiscal year',
      'Full-life allocated budget (Rp)',
      'Ijin prinsip document date',
    ]);
    data.addRow(['Core network', 'PRG-01', 2027, 2028, 9_500_000_000, new Date(Date.UTC(2026, 2, 31))]);
    data.addRow(['Edge servers', 'PRG-02', 2027, 2027, 1_000_000, new Date(Date.UTC(2026, 3, 1))]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const result = await parseOpeningImport({ dataSet: 'projects', bytes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      line: 2,
      values: expect.objectContaining({
        name: 'Core network',
        startFiscalYear: 2027,
        allocatedBudgetFullLife: 9_500_000_000,
        ijinPrinsipDocumentDate: '2026-03-31',
      }),
    });
    expect(result.rows[1]?.line).toBe(3);
  });

  it('reports a bad cell by spreadsheet row number', async () => {
    const workbook = new ExcelJS.Workbook();
    const data = workbook.addWorksheet('Data');
    data.addRow(['Name', 'Originating program code', 'Start fiscal year', 'End fiscal year', 'Full-life allocated budget (Rp)']);
    data.addRow(['Core network', 'PRG-01', 2027, 2028, 1000]);
    data.addRow(['Edge servers', 'PRG-02', 2027, 2027, -5]);
    const result = await parseOpeningImport({
      dataSet: 'projects',
      bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
    });

    const errors = errorsOf(result);
    expect(errors).toEqual([
      {
        line: 3,
        column: 'Full-life allocated budget (Rp)',
        message: 'Full-life allocated budget (Rp) must be a whole, non-negative number.',
      },
    ]);
  });

  it('reports a workbook without a Data sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').addRow(['Name']);
    const result = await parseOpeningImport({
      dataSet: 'projects',
      bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
    });

    const errors = errorsOf(result);
    expect(errors[0]?.message).toContain('Data');
  });
});

describe('parseOpeningImport — owner-added columns, template round trip', () => {
  const ownerColumn: OpeningField = {
    name: 'procurementMethod',
    label: 'Procurement method',
    type: 'text',
    required: true,
    description: 'Owner-added column: how the project is procured.',
    example: 'Tender',
  };

  // 20 app-owned project columns, then the owner-added column as the 21st.
  const projectRow = [
    '', // code — generated by the app
    'Core network',
    'PRG-01',
    '', // external reference
    '', // owner
    '', // description
    '2027',
    '2028',
    '1000',
    '', // submitted price
    '', // final deal price
    '', // opening allocated
    '', // opening open commitments
    '', // opening actual spend
    '', // ijin prinsip document number
    '', // ijin prinsip document date
    '', // ijin prinsip approved amount
    '', // ijin prinsip approver
    '', // ijin prinsip document link
    '', // ijin prinsip notes
    'Tender',
  ].join(',');

  it('parses an owner-added typed column when it is declared', async () => {
    const csv = `${buildCsvTemplate({ dataSet: 'projects', closingFiscalYear: 2026, ownerColumns: [ownerColumn] })}${projectRow}\r\n`;
    const result = await parseOpeningImport({
      dataSet: 'projects',
      bytes: csv,
      ownerColumns: [ownerColumn],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.values.procurementMethod).toBe('Tender');
  });

  it('rejects an owner column that is not part of the declared field list', async () => {
    // Annual programs has no committed owner column, so the sample column is undeclared.
    const template = buildCsvTemplate({
      dataSet: 'annual-programs',
      closingFiscalYear: 2026,
      ownerColumns: [ownerColumn],
    });
    const headerLine =
      template
        .split('\r\n')
        .findIndex((line) => !line.startsWith('#') && line.includes('Procurement method')) + 1;
    const row = 'PRG-09,Service catalogue,SI-01,,,,,,,Tender';
    const errors = errorsOf(
      await parseOpeningImport({ dataSet: 'annual-programs', bytes: `${template}${row}\r\n` }),
    );
    expect(errors[0]).toMatchObject({ line: headerLine, column: 'Procurement method' });
  });

  it('leaves a missing required registry-column value to the planner instead of rejecting the file', async () => {
    const header =
      'Name,Originating program code,Start fiscal year,End fiscal year,Full-life allocated budget (Rp)';
    const result = await parseOpeningImport({
      dataSet: 'projects',
      bytes: `${header}\r\nCore network,PRG-01,2027,2028,1000`,
      // The registry adapter marks its columns as row-checked.
      ownerColumns: [{ ...ownerColumn, headerRequired: false }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.values.procurementMethod).toBeNull();
  });

  it('validates the owner-added column by its declared type', async () => {
    const riskScore: OpeningField = {
      ...ownerColumn,
      name: 'riskScore',
      label: 'Risk score',
      type: 'number',
      example: '10',
    };
    const header = `${SI_HEADER},Risk score`;
    const result = await parseOpeningImport({
      dataSet: 'strategic-initiatives',
      bytes: `${header}\r\nSI-01,Digital,,,1000,0,0,0,,high`,
      ownerColumns: [riskScore],
    });
    const errors = errorsOf(result);
    expect(errors).toContainEqual({
      line: 2,
      column: 'Risk score',
      message: 'Risk score must be a whole, non-negative number (got "high").',
    });
  });

  it('parses a custom-field number column with the form rule: signed digits, no grouping', async () => {
    const riskScore: OpeningField = {
      ...ownerColumn,
      name: 'riskScore',
      label: 'Risk score',
      type: 'number',
      required: false,
      headerRequired: false,
      numberRule: 'integer',
      example: '10',
    };
    const header = `${SI_HEADER},Risk score`;

    const accepted = await parseOpeningImport({
      dataSet: 'strategic-initiatives',
      bytes: `${header}\r\nSI-01,Digital,,,1000,0,0,0,,-42`,
      ownerColumns: [riskScore],
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.rows[0]?.values.riskScore).toBe(-42);

    for (const value of ['1.234', 'Rp 100', '1.5']) {
      const errors = errorsOf(
        await parseOpeningImport({
          dataSet: 'strategic-initiatives',
          bytes: `${header}\r\nSI-01,Digital,,,1000,0,0,0,,${value}`,
          ownerColumns: [riskScore],
        }),
      );
      expect(errors[0]).toMatchObject({ line: 2, column: 'Risk score' });
      expect(errors[0]?.message).toContain('whole number');
    }
  });

  it('returns no rows when any row fails', async () => {
    const result = await parseCsv(
      [SI_HEADER, 'SI-01,Digital,,,1000,0,0,0,', 'BAD,Name,,,abc,0,0,0,'].join('\r\n'),
    );
    expect(result).toMatchObject({ ok: false });
    expect('rows' in result).toBe(false);
  });

  it('parses the example row of every generated template', async () => {
    for (const dataSet of ['strategic-initiatives', 'annual-programs', 'projects'] as const) {
      const template = buildCsvTemplate({ dataSet, closingFiscalYear: 2026 });
      const lines = template.split('\r\n');
      const header = lines.find((line) => line !== '' && !line.startsWith('#'));
      const exampleIndex =
        lines.findIndex((line) => line.startsWith('# Example row (')) + 1;
      const example = lines[exampleIndex]?.replace(/^# /, '');
      expect(header, dataSet).toBeDefined();
      expect(example, dataSet).toBeDefined();

      const result = await parseOpeningImport({
        dataSet,
        bytes: `${header}\r\n${example}\r\n`,
      });
      expect(result.ok, dataSet).toBe(true);
      if (result.ok) expect(result.rows).toHaveLength(1);
    }
  });
});
