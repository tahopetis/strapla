import { describe, expect, it } from 'vitest';
import {
  CUSTOM_FIELD_ENTITIES,
  customFieldEntityLabel,
  customFieldSnapshot,
  deriveCustomFieldKey,
  customFieldTypeLabel,
  isCustomFieldEntityType,
  matchesCustomFieldFilter,
  parseCustomFieldValues,
  resolveCustomExportFields,
  selectCustomExportFields,
  withCustomFields,
  type CustomFieldDefinition,
} from './custom-fields';

function field(
  overrides: Partial<CustomFieldDefinition> &
    Pick<CustomFieldDefinition, 'id' | 'name' | 'type'>,
): CustomFieldDefinition {
  return {
    entityType: 'project',
    key: 'fieldKey',
    required: false,
    description: '',
    ...overrides,
  };
}

const procurementMethod = field({
  id: 'field-procurement',
  name: 'Procurement method',
  type: 'text',
});

describe('parseCustomFieldValues', () => {
  it('trims text and drops a blank optional value', () => {
    const result = parseCustomFieldValues([procurementMethod], {
      'field-procurement': '  Open tender  ',
    });

    expect(result).toEqual({ ok: true, values: { 'field-procurement': 'Open tender' } });
  });

  it('rejects a blank required value with the field name', () => {
    const required = { ...procurementMethod, required: true };
    const result = parseCustomFieldValues([required], { 'field-procurement': '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        { fieldId: required.id, message: 'Procurement method is required.' },
      ]);
    }
  });

  it('parses a whole number', () => {
    const risk = field({ id: 'field-risk', name: 'Risk score', type: 'number' });
    const result = parseCustomFieldValues([risk], { 'field-risk': '1234' });

    expect(result).toEqual({ ok: true, values: { 'field-risk': 1234 } });
  });

  it('accepts a negative whole number', () => {
    const variance = field({ id: 'field-variance', name: 'Variance', type: 'number' });
    const result = parseCustomFieldValues([variance], { 'field-variance': '-42' });

    expect(result).toEqual({ ok: true, values: { 'field-variance': -42 } });
  });

  it('rejects a non-numeric number and a misleading decimal', () => {
    const risk = field({ id: 'field-risk', name: 'Risk score', type: 'number' });

    for (const raw of ['low', '3.5', '1.234']) {
      const result = parseCustomFieldValues([risk], { 'field-risk': raw });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            fieldId: 'field-risk',
            message: 'Risk score must be a whole number (digits only).',
          },
        ]);
      }
    }
  });

  it('accepts a real ISO date and rejects an impossible one', () => {
    const reviewOn = field({ id: 'field-review', name: 'Review on', type: 'date' });

    expect(parseCustomFieldValues([reviewOn], { 'field-review': '2026-02-28' })).toEqual({
      ok: true,
      values: { 'field-review': '2026-02-28' },
    });

    const impossible = parseCustomFieldValues([reviewOn], { 'field-review': '2026-02-30' });
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) {
      expect(impossible.errors[0]?.message).toBe('Review on must be a real date (YYYY-MM-DD).');
    }
  });

  it('requires a number and a date when the field is required', () => {
    const fields = [
      field({ id: 'f-number', name: 'Risk score', type: 'number', required: true }),
      field({ id: 'f-date', name: 'Review on', type: 'date', required: true }),
    ];

    const result = parseCustomFieldValues(fields, { 'f-number': '', 'f-date': '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.message)).toEqual([
        'Risk score is required.',
        'Review on is required.',
      ]);
    }
  });

  it('ignores values that do not belong to a declared field', () => {
    const result = parseCustomFieldValues([procurementMethod], {
      'field-procurement': 'Tender',
      'field-unknown': 'ignored',
    });

    expect(result).toEqual({ ok: true, values: { 'field-procurement': 'Tender' } });
  });

  it('caps a text value at a sensible length', () => {
    const result = parseCustomFieldValues([procurementMethod], {
      'field-procurement': 'x'.repeat(2001),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toContain('at most 2000 characters');
    }
  });
});

describe('deriveCustomFieldKey', () => {
  it('turns a display name into a stable camel-case key', () => {
    expect(deriveCustomFieldKey('Delivery note', [])).toBe('deliveryNote');
    expect(deriveCustomFieldKey('Risk score 2', [])).toBe('riskScore2');
    expect(deriveCustomFieldKey('  Procurement method  ', [])).toBe('procurementMethod');
  });

  it('keeps keys unique per entity with a numeric suffix', () => {
    expect(deriveCustomFieldKey('Delivery note', ['deliveryNote'])).toBe('deliveryNote2');
    expect(deriveCustomFieldKey('Delivery note', ['deliveryNote', 'deliveryNote2'])).toBe(
      'deliveryNote3',
    );
  });

  it('falls back to a usable key when the name has no letters or digits', () => {
    expect(deriveCustomFieldKey('***', [])).toBe('field');
  });
});

describe('custom field registry vocabulary', () => {
  it('knows the four plan-record entities and their labels', () => {
    expect(CUSTOM_FIELD_ENTITIES.map((entity) => entity.type)).toEqual([
      'strategic_initiative',
      'annual_program',
      'project',
      'recurring_ops_item',
    ]);
    expect(customFieldEntityLabel('project')).toBe('Project');
    expect(customFieldEntityLabel('recurring_ops_item')).toBe('Recurring Ops Item');
    expect(isCustomFieldEntityType('project')).toBe(true);
    expect(isCustomFieldEntityType('commitment_entry')).toBe(false);
    expect(customFieldTypeLabel('date')).toBe('Date');
  });
});

describe('custom field snapshots', () => {
  it('indexes recorded values by field name for the audit trail', () => {
    const fields = [
      procurementMethod,
      field({ id: 'field-risk', name: 'Risk score', type: 'number' }),
    ];

    expect(
      customFieldSnapshot(fields, { 'field-procurement': 'Tender', 'field-risk': 4 }),
    ).toEqual({ 'Procurement method': 'Tender', 'Risk score': 4 });
  });

  it('returns null when no field is recorded', () => {
    expect(customFieldSnapshot([procurementMethod], {})).toBeNull();
  });

  it('adds the snapshot to an audit record only when something is recorded', () => {
    const snapshot = { name: 'Project one' };

    expect(withCustomFields(snapshot, [procurementMethod], {})).toEqual(snapshot);
    expect(
      withCustomFields(snapshot, [procurementMethod], { 'field-procurement': 'Tender' }),
    ).toEqual({ name: 'Project one', customFields: { 'Procurement method': 'Tender' } });
  });
});

describe('matchesCustomFieldFilter', () => {
  const values = {
    'field-procurement': 'Open tender',
    'field-risk': 1234,
    'field-review': '2026-02-28',
  };
  const fields = [
    procurementMethod,
    field({ id: 'field-risk', name: 'Risk score', type: 'number' }),
    field({ id: 'field-review', name: 'Review on', type: 'date' }),
  ];

  it('matches text case-insensitively as a substring', () => {
    expect(matchesCustomFieldFilter(values, fields[0]!, 'tender')).toBe(true);
    expect(matchesCustomFieldFilter(values, fields[0]!, 'auction')).toBe(false);
  });

  it('matches numbers through the typed parser and dates exactly', () => {
    expect(matchesCustomFieldFilter(values, fields[1]!, '1234')).toBe(true);
    expect(matchesCustomFieldFilter(values, fields[1]!, '1235')).toBe(false);
    expect(matchesCustomFieldFilter(values, fields[2]!, '2026-02-28')).toBe(true);
    expect(matchesCustomFieldFilter(values, fields[2]!, '2026-03-01')).toBe(false);
  });

  it('treats a blank query as no filter and a missing value as no match', () => {
    expect(matchesCustomFieldFilter(values, fields[0]!, '  ')).toBe(true);
    expect(matchesCustomFieldFilter({}, fields[0]!, 'tender')).toBe(false);
    expect(matchesCustomFieldFilter(undefined, fields[0]!, '')).toBe(true);
  });

  it('does not match when the query is invalid for the field type', () => {
    expect(matchesCustomFieldFilter(values, fields[1]!, 'low')).toBe(false);
    expect(matchesCustomFieldFilter(values, fields[2]!, '02/28/2026')).toBe(false);
  });
});

describe('selectCustomExportFields', () => {
  const fields = [
    field({ id: 'f-text', name: 'Procurement method', type: 'text' }),
    field({ id: 'f-number', name: 'Risk score', type: 'number' }),
    field({ id: 'f-date', name: 'Review on', type: 'date' }),
  ];

  it('keeps the registry order and ignores unknown or duplicate ids', () => {
    expect(
      selectCustomExportFields(fields, ['f-date', 'f-unknown', 'f-text', 'f-text']).map(
        (selected) => selected.id,
      ),
    ).toEqual(['f-text', 'f-date']);
  });

  it('selects nothing when nothing is requested', () => {
    expect(selectCustomExportFields(fields, [])).toEqual([]);
  });
});

describe('resolveCustomExportFields', () => {
  const fields = [
    field({ id: 'f-text', name: 'Procurement method', type: 'text' }),
    field({ id: 'f-number', name: 'Risk score', type: 'number' }),
    field({ id: 'f-date', name: 'Review on', type: 'date' }),
  ];

  it('selects every field when no column parameter is present', () => {
    expect(resolveCustomExportFields(fields, undefined).map((selected) => selected.id)).toEqual([
      'f-text',
      'f-number',
      'f-date',
    ]);
  });

  it('reads repeated parameters and comma lists in registry order', () => {
    expect(
      resolveCustomExportFields(fields, ['f-date', 'f-text,f-number']).map(
        (selected) => selected.id,
      ),
    ).toEqual(['f-text', 'f-number', 'f-date']);
  });

  it('selects none for an explicitly empty parameter', () => {
    expect(resolveCustomExportFields(fields, '')).toEqual([]);
    expect(resolveCustomExportFields(fields, ['', '  '])).toEqual([]);
  });
});
