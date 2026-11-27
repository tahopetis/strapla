import { describe, expect, it } from 'vitest';
import type { StrategicInitiative } from '@/db/schema';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import type { ExportTable } from '@/lib/report-export';
import type { ReportCustomFieldGroup } from './report-custom-fields';
import {
  EXECUTION_NOTE,
  REPORT_CORRECTION_NOTE,
  applyCorrectionMarkers,
  applyCustomFieldGroup,
  documentNote,
  postCloseAdjustmentTable,
  siFiveYearExportTables,
} from './report-tables';
import type {
  BudgetVsActualRow,
  SiFiveYearComponent,
  SiFiveYearReport,
} from './report-queries';

/**
 * Unit tests for the export tables: custom-field column attachment (#46), the
 * post-close adjustment table (#98) and the corrected-after-close marker
 * (#108).
 *
 * These are pure table-level tests: no database, no report query. They pin the
 * promises the export layer makes — selected fields append after the report
 * columns and fill in by record id, the correction marker appears only on a
 * marked row and never on a totals table, and the existing money columns,
 * figures and row ids are never touched.
 */

const location = field({ id: 'cf-location', name: 'Location', type: 'text' });
const priority = field({ id: 'cf-priority', name: 'Priority', type: 'number' });
const due = field({ id: 'cf-due', name: 'Due date', type: 'date' });

function field(
  overrides: Pick<CustomFieldDefinition, 'id' | 'name' | 'type'>,
): CustomFieldDefinition {
  return {
    entityType: 'annual_program',
    key: overrides.id,
    required: false,
    description: 'Registered for the report tests.',
    example: '',
    position: 0,
    ...overrides,
  };
}

function table(): ExportTable {
  return {
    name: 'Annual programs',
    columns: [
      { key: 'programCode', header: 'Program' },
      { key: 'capexBudget', header: 'Capex budget', kind: 'money' },
      { key: 'spendCapex', header: 'Capex spent', kind: 'money' },
    ],
    rows: [
      { id: 'program-1', programCode: 'PRG-01', capexBudget: 1_000, spendCapex: 250 },
      { id: 'program-2', programCode: 'PRG-02', capexBudget: 2_000, spendCapex: 500 },
      { id: 'program-3', programCode: 'PRG-03', capexBudget: 500, spendCapex: 0 },
    ],
  };
}

function group(
  selectedFields: readonly CustomFieldDefinition[],
  values: Map<string, CustomFieldValues>,
): ReportCustomFieldGroup {
  return {
    entityType: 'annual_program',
    tableName: 'Annual programs',
    fields: [location, priority, due],
    selectedFields,
    values,
  };
}

function moneySum(exportTable: ExportTable, key: string): number {
  return exportTable.rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

describe('applyCustomFieldGroup', () => {
  it('appends one column per selected field, in registry order, after the report columns', () => {
    const source = table();
    const result = applyCustomFieldGroup(source, group([location, priority, due], new Map()));

    expect(result.name).toBe(source.name);
    expect(result.columns.slice(0, source.columns.length)).toEqual(source.columns);
    expect(result.columns.slice(source.columns.length)).toEqual([
      { key: 'custom:cf-location', header: 'Location', kind: 'text' },
      { key: 'custom:cf-priority', header: 'Priority', kind: 'number' },
      { key: 'custom:cf-due', header: 'Due date', kind: 'text' },
    ]);
  });

  it('fills each row from the values of its record id and leaves unselected fields out', () => {
    const values = new Map<string, CustomFieldValues>([
      ['program-1', { 'cf-location': 'Jakarta', 'cf-priority': 2, 'cf-due': '2027-01-31' }],
      ['program-2', { 'cf-priority': 0 }],
    ]);
    const result = applyCustomFieldGroup(table(), group([location, priority], values));

    expect(result.columns.map((column) => column.key)).not.toContain('custom:cf-due');
    expect(result.rows).toEqual([
      {
        id: 'program-1',
        programCode: 'PRG-01',
        capexBudget: 1_000,
        spendCapex: 250,
        'custom:cf-location': 'Jakarta',
        'custom:cf-priority': 2,
      },
      {
        id: 'program-2',
        programCode: 'PRG-02',
        capexBudget: 2_000,
        spendCapex: 500,
        'custom:cf-location': null,
        'custom:cf-priority': 0,
      },
      {
        id: 'program-3',
        programCode: 'PRG-03',
        capexBudget: 500,
        spendCapex: 0,
        'custom:cf-location': null,
        'custom:cf-priority': null,
      },
    ]);
  });

  it('leaves the existing money columns, rows and totals untouched', () => {
    const source = table();
    const capexBefore = moneySum(source, 'capexBudget');
    const spendBefore = moneySum(source, 'spendCapex');

    const result = applyCustomFieldGroup(
      source,
      group([location, priority], new Map([['program-2', { 'cf-location': 'Bandung' }]])),
    );

    expect(result.rows).toHaveLength(source.rows.length);
    expect(moneySum(result, 'capexBudget')).toBe(capexBefore);
    expect(moneySum(result, 'spendCapex')).toBe(spendBefore);
    for (const [index, row] of result.rows.entries()) {
      expect(row).toMatchObject(source.rows[index]!);
    }
  });

  it('returns the same table when no field is selected', () => {
    const source = table();
    expect(applyCustomFieldGroup(source, group([], new Map()))).toBe(source);
  });
});

describe('postCloseAdjustmentTable (#98)', () => {
  function budgetRow(overrides: Partial<BudgetVsActualRow>): BudgetVsActualRow {
    return {
      programId: 'program-1',
      fiscalYear: 2027,
      siCode: 'SI-01',
      siName: 'Digital Workplace',
      programCode: 'POST-CLOSE-PRG-27',
      programName: 'Post-close programme',
      corrected: false,
      capexAvailable: 100_000_000,
      opexAvailable: 0,
      carryInCapex: 0,
      carryInOpex: 0,
      allocatedCapex: 80_000_000,
      allocatedOpex: 0,
      commitmentCapex: 30_000_000,
      commitmentOpex: 0,
      spendCapex: 0,
      spendOpex: 0,
      settlementCapex: 0,
      settlementOpex: 0,
      priorOpeningCapex: 0,
      priorOpeningOpex: 0,
      postCloseReserveCapex: 0,
      postCloseReserveOpex: 0,
      unallocatedCapex: 20_000_000,
      unallocatedOpex: 0,
      overCapex: false,
      overOpex: false,
      ...overrides,
    };
  }

  it('is a separate table with its own columns and only the reserve rows', () => {
    const result = postCloseAdjustmentTable([
      budgetRow({ postCloseReserveCapex: 10_000_000 }),
      budgetRow({ programId: 'program-2', programCode: 'PRG-2028-001', fiscalYear: 2028 }),
    ]);

    expect(result.name).toBe('Post-close adjustments');
    expect(result.columns.map((column) => column.header)).toEqual([
      'Commitment fiscal year',
      'SI',
      'Program',
      'Program name',
      'Capex reserve',
      'Opex reserve',
      'Total reserve',
    ]);
    expect(result.rows).toEqual([
      {
        id: 'program-1',
        fiscalYear: 2027,
        si: 'SI-01 · Digital Workplace',
        program: 'POST-CLOSE-PRG-27',
        programName: 'Post-close programme',
        capexReserve: 10_000_000,
        opexReserve: 0,
        totalReserve: 10_000_000,
      },
    ]);
  });

  it('has no rows when nothing was reserved', () => {
    expect(postCloseAdjustmentTable([budgetRow({})]).rows).toEqual([]);
  });

  it('never carries the corrected-after-close marker column (#108)', () => {
    const result = postCloseAdjustmentTable([
      budgetRow({ postCloseReserveCapex: 10_000_000, corrected: true }),
    ]);

    expect(result.columns.some((column) => column.key === 'corrected')).toBe(false);
    expect(result.rows[0]).not.toHaveProperty('corrected');
  });
});

describe('siFiveYearExportTables (ADR-0006 §5)', () => {
  function component(overrides: Partial<SiFiveYearComponent>): SiFiveYearComponent {
    return {
      envelope: 0,
      priorConsumed: 0,
      programBudget: 0,
      allocation: 0,
      commitment: 0,
      spend: 0,
      consumed: 0,
      headroom: 0,
      over: false,
      ...overrides,
    };
  }

  function initiative(
    overrides: Pick<StrategicInitiative, 'id' | 'code' | 'name'> &
      Partial<StrategicInitiative>,
  ): StrategicInitiative {
    return {
      planId: 'plan-1',
      owner: null,
      objective: null,
      envelopeCapex: 0,
      envelopeOpex: 0,
      priorProgramBudgetUsedCapex: 0,
      priorProgramBudgetUsedOpex: 0,
      notes: null,
      voidedAt: null,
      voidedReason: null,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  const overrunCapex = component({
    envelope: 100_000,
    programBudget: 150_000,
    consumed: 150_000,
    headroom: -50_000,
    over: true,
  });

  function report(): SiFiveYearReport {
    return {
      rows: [
        {
          initiative: initiative({
            id: 'si-1',
            code: 'SI-01',
            name: 'Digital Workplace',
            owner: 'Head of IT',
          }),
          capex: component({
            envelope: 4_000_000_000,
            priorConsumed: 600_000_000,
            programBudget: 1_200_000_000,
            allocation: 500_000_000,
            commitment: 100_000_000,
            spend: 60_000_000,
            consumed: 1_800_000_000,
            headroom: 2_200_000_000,
          }),
          opex: component({
            envelope: 1_000_000_000,
            priorConsumed: 150_000_000,
            programBudget: 300_000_000,
            consumed: 450_000_000,
            headroom: 550_000_000,
          }),
          corrected: false,
        },
        {
          initiative: initiative({ id: 'si-2', code: 'SI-02', name: 'Resilient network' }),
          capex: overrunCapex,
          opex: component({}),
          corrected: false,
        },
      ],
      totals: {
        capex: component({
          envelope: 4_000_100_000,
          priorConsumed: 600_000_000,
          programBudget: 1_200_150_000,
          allocation: 500_000_000,
          commitment: 100_000_000,
          spend: 60_000_000,
          consumed: 1_800_150_000,
          headroom: 2_199_950_000,
          over: true,
        }),
        opex: component({
          envelope: 1_000_000_000,
          priorConsumed: 150_000_000,
          programBudget: 300_000_000,
          consumed: 450_000_000,
          headroom: 550_000_000,
        }),
      },
    };
  }

  it('exports the capex and opex figures as separate, labelled columns', () => {
    const tables = siFiveYearExportTables(report());
    const main = tables[0]!;
    const total = tables[1]!;

    expect(main.name).toBe('SI five-year view');
    expect(main.columns.map((column) => column.header)).toEqual([
      'SI code',
      'Strategic initiative',
      'Owner',
      'Capex envelope',
      'Capex prior consumed',
      'Capex program budgets',
      'Capex allocated',
      'Capex committed',
      'Capex spent',
      'Capex consumed',
      'Capex headroom',
      'Capex status',
      'Opex envelope',
      'Opex prior consumed',
      'Opex program budgets',
      'Opex allocated',
      'Opex committed',
      'Opex spent',
      'Opex consumed',
      'Opex headroom',
      'Opex status',
    ]);
    expect(main.rows[0]).toMatchObject({
      code: 'SI-01',
      name: 'Digital Workplace',
      owner: 'Head of IT',
      capexEnvelope: 4_000_000_000,
      capexPrior: 600_000_000,
      capexProgramBudget: 1_200_000_000,
      capexConsumed: 1_800_000_000,
      capexHeadroom: 2_200_000_000,
      capexStatus: 'within capex envelope',
      opexEnvelope: 1_000_000_000,
      opexPrior: 150_000_000,
      opexHeadroom: 550_000_000,
      opexStatus: 'within opex envelope',
    });
    // A capex overrun is its own status; it never consumes opex headroom.
    expect(main.rows[1]).toMatchObject({
      capexStatus: 'over capex envelope',
      capexHeadroom: -50_000,
      opexStatus: 'within opex envelope',
      opexHeadroom: 0,
    });

    const totalRow = total.rows[0]!;
    expect(total.name).toBe('Totals');
    expect(totalRow).toMatchObject({
      label: 'Portfolio',
      capexEnvelope: 4_000_100_000,
      capexHeadroom: 2_199_950_000,
      capexStatus: 'over capex envelope',
      opexStatus: 'within opex envelope',
    });
  });

  it('keeps the custom-field columns after the per-component money columns (#46)', () => {
    const main = siFiveYearExportTables(report())[0]!;
    const result = applyCustomFieldGroup(main, {
      entityType: 'strategic_initiative',
      tableName: 'SI five-year view',
      fields: [location],
      selectedFields: [location],
      values: new Map([['si-1', { 'cf-location': 'Jakarta' }]]),
    });

    expect(result.columns.slice(0, main.columns.length)).toEqual(main.columns);
    expect(result.columns.at(-1)).toEqual({
      key: 'custom:cf-location',
      header: 'Location',
      kind: 'text',
    });
    expect(result.rows[0]).toMatchObject({
      capexEnvelope: 4_000_000_000,
      opexEnvelope: 1_000_000_000,
      'custom:cf-location': 'Jakarta',
    });
  });

  it('marks a corrected initiative row but leaves the totals table and every figure alone (#108)', () => {
    const plain = siFiveYearExportTables(report());
    const data = report();
    data.rows[0]!.corrected = true;
    const marked = siFiveYearExportTables(data);

    const plainMain = plain[0]!;
    const plainTotals = plain[1]!;
    const main = marked[0]!;
    const totals = marked[1]!;

    expect(main.columns.at(-1)).toEqual({ key: 'corrected', header: 'Corrected after close' });
    expect(main.columns.slice(0, -1)).toEqual(plainMain.columns);
    for (const [index, row] of main.rows.entries()) {
      const { corrected, ...figures } = row;
      expect(corrected).toBe(index === 0 ? 'yes' : '');
      // Every money value and every row id is exactly the unmarked build's.
      expect(figures).toEqual(plainMain.rows[index]);
    }
    // A marker can never move a total, and a totals table never gains it.
    expect(totals).toEqual(plainTotals);
    expect(totals.columns.some((column) => column.key === 'corrected')).toBe(false);
  });

  it('adds no marker column to any table when nothing was corrected (#108)', () => {
    const tables = siFiveYearExportTables(report());
    for (const candidate of tables) {
      expect(candidate.columns.some((column) => column.key === 'corrected')).toBe(false);
      for (const row of candidate.rows) {
        expect(row).not.toHaveProperty('corrected');
      }
    }
  });
});

describe('applyCorrectionMarkers (#108)', () => {
  it('returns a table untouched when none of its rows is marked', () => {
    const source = table();
    expect(applyCorrectionMarkers(source, new Set())).toBe(source);
    // An id from another report's table marks nothing here.
    expect(applyCorrectionMarkers(source, new Set(['program-99']))).toBe(source);
  });

  it('appends one marker column, yes for a marked row and an empty cell otherwise', () => {
    const source = table();
    const result = applyCorrectionMarkers(source, new Set(['program-2']));

    expect(result.name).toBe(source.name);
    expect(result.columns).toEqual([
      ...source.columns,
      { key: 'corrected', header: 'Corrected after close' },
    ]);
    expect(result.rows.map((row) => row.corrected)).toEqual(['', 'yes', '']);
    expect(result.rows.map((row) => row.id)).toEqual(['program-1', 'program-2', 'program-3']);
  });

  it('keeps every money value and every row id unchanged', () => {
    const source = table();
    const result = applyCorrectionMarkers(source, new Set(['program-1', 'program-3']));

    expect(moneySum(result, 'capexBudget')).toBe(moneySum(source, 'capexBudget'));
    expect(moneySum(result, 'spendCapex')).toBe(moneySum(source, 'spendCapex'));
    for (const [index, row] of result.rows.entries()) {
      expect(row).toMatchObject(source.rows[index]!);
    }
  });

  it('keeps the custom-field columns after the marker column (#46)', () => {
    const marked = applyCorrectionMarkers(table(), new Set(['program-2']));
    const result = applyCustomFieldGroup(
      marked,
      group([location], new Map([['program-2', { 'cf-location': 'Bandung' }]])),
    );

    expect(result.columns.map((column) => column.key)).toEqual([
      'programCode',
      'capexBudget',
      'spendCapex',
      'corrected',
      'custom:cf-location',
    ]);
    expect(result.rows[1]).toMatchObject({ corrected: 'yes', 'custom:cf-location': 'Bandung' });
  });
});

describe('documentNote (#108)', () => {
  it('appends the correction footnote only when a table carries a marked row', () => {
    expect(documentNote([])).toBe(EXECUTION_NOTE);
    expect(documentNote([table()])).toBe(EXECUTION_NOTE);

    const marked = applyCorrectionMarkers(table(), new Set(['program-2']));
    expect(documentNote([table(), marked])).toBe(`${EXECUTION_NOTE} ${REPORT_CORRECTION_NOTE}`);
  });

  it('keeps the fixed footnote copy', () => {
    expect(REPORT_CORRECTION_NOTE).toBe(
      'Rows marked corrected after close rest on a record corrected after the year closed. The figures shown are the live corrected figures; the close snapshot remains the historical record.',
    );
  });
});
