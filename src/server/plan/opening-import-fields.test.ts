import { describe, expect, it } from 'vitest';
import { openingFieldList } from '@/lib/opening-import/field-list';
import { parseOpeningImport } from '@/lib/opening-import/parse';
import { buildCsvTemplate } from '@/lib/opening-import/template';
import type { CustomFieldDefinition } from '@/domain/custom-fields';
import { openingFieldsFromRegistry } from './opening-import-fields';
import { planProjectsLoad, type OpeningLoadContext } from './opening-load';

const CLOSING_YEAR = 2026;

function definition(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: 'field-delivery',
    entityType: 'project',
    name: 'Delivery note',
    key: 'deliveryNote',
    type: 'text',
    required: false,
    description: 'How the delivery is staged.',
    example: '',
    ...overrides,
  };
}

const projectContext: OpeningLoadContext = {
  planId: 'plan-1',
  annualPlanId: 'annual-1',
  annualPlanFiscalYear: 2027,
  planStartFiscalYear: 2026,
  planEndFiscalYear: 2030,
  initiativeIdByCode: new Map(),
  programIdByCode: new Map([['PRG-01', 'program-1']]),
  existingInitiativeCodes: new Set(),
  existingProgramCodes: new Set(),
  existingProjectCodes: new Set(),
};

describe('openingFieldsFromRegistry', () => {
  it('uses the registry key as the row key and pairs the definition with its id', () => {
    const { columns, fields } = openingFieldsFromRegistry(
      'projects',
      [definition()],
      CLOSING_YEAR,
    );
    expect(columns[0]).toMatchObject({
      name: 'deliveryNote',
      label: 'Delivery note',
      type: 'text',
      required: false,
      description: 'How the delivery is staged.',
      // A required registry field is checked per row, not per file.
      headerRequired: false,
    });
    expect(columns[0]?.numberRule).toBeUndefined();
    expect(fields[0]?.column).toBe('deliveryNote');
    expect(fields[0]?.definition.id).toBe('field-delivery');
  });

  it('gives a number column the form rule instead of the Rupiah rule', () => {
    const { columns } = openingFieldsFromRegistry(
      'projects',
      [definition({ type: 'number' })],
      CLOSING_YEAR,
    );
    expect(columns[0]?.numberRule).toBe('integer');
  });

  it('flattens a multi-line description so the CSV template stays one comment line', () => {
    const { columns } = openingFieldsFromRegistry(
      'projects',
      [definition({ description: 'First line\nsecond line' })],
      CLOSING_YEAR,
    );
    expect(columns[0]?.description).toBe('First line second line');
  });

  it('supplies a type-appropriate example; the date follows the closing year', () => {
    const examples = (['text', 'number', 'date'] as const).map((type) => {
      const { columns } = openingFieldsFromRegistry(
        'projects',
        [definition({ type })],
        CLOSING_YEAR,
      );
      return columns[0]?.example;
    });
    for (const example of examples) expect(example ?? '').not.toBe('');
    expect(new Set(examples).size).toBe(3);
    expect(examples[2]).toBe('2026-01-01');
  });

  it('carries the administrator example into the template column', () => {
    const { columns } = openingFieldsFromRegistry(
      'projects',
      [definition({ example: 'Open tender' })],
      CLOSING_YEAR,
    );
    expect(columns[0]?.example).toBe('Open tender');
  });

  it('keeps a multi-line example on one template line', () => {
    const { columns } = openingFieldsFromRegistry(
      'projects',
      [definition({ example: 'First line\nsecond line' })],
      CLOSING_YEAR,
    );
    expect(columns[0]?.example).toBe('First line second line');
  });

  it('makes a display name that repeats an app-owned header unique instead of rejecting it', () => {
    const { columns, fields } = openingFieldsFromRegistry(
      'projects',
      [definition({ id: 'field-owner', name: 'Owner', key: 'owner' })],
      CLOSING_YEAR,
    );
    expect(columns[0]?.label).toBe('Owner (custom field)');
    // The registry key also collides here (the app owns an `owner` column), so
    // the parsed-row key is suffixed; the definition still stores under its id.
    expect(fields[0]?.column).toBe('ownerCustom');
    expect(fields[0]?.definition.id).toBe('field-owner');
    // The merged field list is valid: both columns can coexist.
    expect(() => openingFieldList('projects', columns)).not.toThrow();
  });
});

describe('registry columns through template, parser and planner (W9)', () => {
  it('round-trips text, number and date values, including a colliding header', async () => {
    const definitions = [
      definition({ id: 'cf-score', name: 'Risk score', key: 'riskScore', type: 'number' }),
      definition({ id: 'cf-review', name: 'Review date', key: 'reviewDate', type: 'date' }),
      definition({ id: 'cf-owner', name: 'Owner', key: 'owner', type: 'text' }),
    ];
    const { columns, fields } = openingFieldsFromRegistry(
      'projects',
      definitions,
      CLOSING_YEAR,
    );

    const template = buildCsvTemplate({
      dataSet: 'projects',
      closingFiscalYear: CLOSING_YEAR,
      ownerColumns: columns,
    });
    expect(template).toContain('Owner (custom field)');
    expect(template).toContain('custom-field number');

    // The minimal app-owned required columns, then one value per registry column
    // (a negative custom number is form-valid, and the date is ISO).
    const header = [
      'Name',
      'Originating program code',
      'Start fiscal year',
      'End fiscal year',
      'Full-life allocated budget (Rp)',
      ...columns.map((column) => column.label),
    ].join(',');
    const parsed = await parseOpeningImport({
      dataSet: 'projects',
      bytes: `${header}\r\nCore network,PRG-01,2027,2028,1000,-42,2026-03-31,Board`,
      ownerColumns: columns,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const planned = planProjectsLoad(parsed.rows, projectContext, fields);
    expect(planned.errors).toEqual([]);
    expect(planned.plan.projects[0]?.customFieldValues).toEqual({
      'cf-score': -42,
      'cf-review': '2026-03-31',
      'cf-owner': 'Board',
    });
  });
});
