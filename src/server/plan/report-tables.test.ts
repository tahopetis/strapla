import { describe, expect, it } from 'vitest';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import type { ExportTable } from '@/lib/report-export';
import type { ReportCustomFieldGroup } from './report-custom-fields';
import { applyCustomFieldGroup } from './report-tables';

/**
 * Unit tests for the custom-field column attachment (issue #46).
 *
 * These are pure table-level tests: no database, no report query. They pin the
 * two promises the export layer makes — selected fields append after the report
 * columns and fill in by record id, and the existing money columns and figures
 * are never touched.
 */

const location = field({ id: 'cf-location', name: 'Location', type: 'text' });
const priority = field({ id: 'cf-priority', name: 'Priority', type: 'number' });
const due = field({ id: 'cf-due', name: 'Due date', type: 'date' });

function field(
  overrides: Pick<CustomFieldDefinition, 'id' | 'name' | 'type'>,
): CustomFieldDefinition {
  return {
    entityType: 'annual_program',
    required: false,
    description: 'Registered for the report tests.',
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
