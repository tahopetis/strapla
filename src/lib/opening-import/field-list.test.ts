import { describe, expect, it } from 'vitest';
import {
  OPENING_DATA_SETS,
  OpeningFieldListError,
  isOpeningDataSetId,
  openingFieldList,
  openingReasonConvention,
  type OpeningField,
} from './field-list';
import { OWNER_COLUMNS } from './owner-columns';

const ownerColumn: OpeningField = {
  name: 'procurementMethod',
  label: 'Procurement method',
  type: 'text',
  required: false,
  description: 'Owner-added column: how the project is procured.',
  example: 'Tender',
};

describe('opening data sets', () => {
  it('declares exactly the three opening edit surfaces', () => {
    expect(Object.keys(OPENING_DATA_SETS)).toEqual([
      'strategic-initiatives',
      'annual-programs',
      'projects',
    ]);
    expect(isOpeningDataSetId('projects')).toBe(true);
    expect(isOpeningDataSetId('allocations')).toBe(false);
  });

  it('declares the opening figures on their own surfaces', () => {
    const initiativeFields = names('strategic-initiatives');
    expect(initiativeFields).toContain('envelopeCapex');
    expect(initiativeFields).toContain('envelopeOpex');
    expect(initiativeFields).toContain('priorCapex');
    expect(initiativeFields).toContain('priorOpex');
    expect(initiativeFields).not.toContain('envelopeAmount');
    expect(initiativeFields).not.toContain('priorProgramBudgetUsed');

    const programFields = names('annual-programs');
    expect(programFields).toContain('carryInCapex');
    expect(programFields).toContain('carryInOpex');

    const projectFields = names('projects');
    expect(projectFields).toContain('openingAllocated');
    expect(projectFields).toContain('openingCommitted');
    expect(projectFields).toContain('openingSpent');
  });

  it('keeps allocation carry-in out of the project data set', () => {
    // Decision documented in docs/OPENING-BALANCE-LOAD.md: allocation carry-in is
    // per project *per fiscal year*, stored on the annual allocation, not the project.
    expect(names('projects')).not.toContain('carryInCapex');
    expect(names('projects')).not.toContain('carryInOpex');
  });

  it('declares a date column so every declared type is exercised', () => {
    expect(types('projects')).toContain('date');
    expect(types('strategic-initiatives')).toContain('text');
    expect(types('annual-programs')).toContain('number');
  });

  it('gives every field a unique name and label, type, description and example', () => {
    for (const id of Object.keys(OPENING_DATA_SETS) as Array<keyof typeof OPENING_DATA_SETS>) {
      const fields = openingFieldList(id);
      expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length);
      expect(new Set(fields.map((field) => field.label.toLowerCase())).size).toBe(fields.length);
      for (const field of fields) {
        expect(['text', 'number', 'date']).toContain(field.type);
        expect(field.required).toBeTypeOf('boolean');
        expect(field.description.trim()).not.toBe('');
        expect(field.example).not.toBe('');
        expect(typeof field.owner).toBe('boolean');
      }
      expect(fields.filter((field) => field.owner)).toHaveLength(OWNER_COLUMNS[id].length);
    }
  });
});

describe('owner-added columns', () => {
  it('commits one owner column on projects as the acceptance demonstration', () => {
    const fields = openingFieldList('projects');
    expect(fields.find((field) => field.name === 'procurementMethod')?.owner).toBe(true);
  });

  it('merges a typed owner column into the declared field list', () => {
    const fields = openingFieldList('projects', [ownerColumn]);
    const merged = fields.find((field) => field.name === 'procurementMethod');
    expect(merged).toMatchObject({
      label: 'Procurement method',
      type: 'text',
      required: false,
      owner: true,
    });
    expect(fields).toHaveLength(openingFieldList('projects', []).length + 1);
  });

  it('validates owner columns like app-owned columns', () => {
    expect(() =>
      openingFieldList('projects', [{ ...ownerColumn, type: 'boolean' as never }]),
    ).toThrow(OpeningFieldListError);
    expect(() => openingFieldList('projects', [{ ...ownerColumn, name: '' }])).toThrow(
      OpeningFieldListError,
    );
    expect(() => openingFieldList('projects', [{ ...ownerColumn, example: '' }])).toThrow(
      OpeningFieldListError,
    );
  });

  it('rejects an owner column that collides with an app-owned column', () => {
    expect(() => openingFieldList('projects', [{ ...ownerColumn, name: 'openingSpent' }])).toThrow(
      /openingSpent/,
    );
    expect(() => openingFieldList('projects', [{ ...ownerColumn, label: 'Name' }])).toThrow(/Name/);
  });
});

describe('openingReasonConvention', () => {
  it('renders the documented reason convention for the closing year', () => {
    expect(openingReasonConvention(2026)).toBe('Opening balance — FY2026 close / <reference>');
    expect(openingReasonConvention(2030)).toBe('Opening balance — FY2030 close / <reference>');
  });

  it('rejects an implausible fiscal year', () => {
    expect(() => openingReasonConvention(0)).toThrow(OpeningFieldListError);
    expect(() => openingReasonConvention(2026.5)).toThrow(OpeningFieldListError);
  });
});

function names(id: 'strategic-initiatives' | 'annual-programs' | 'projects'): string[] {
  return openingFieldList(id).map((field) => field.name);
}

function types(id: 'strategic-initiatives' | 'annual-programs' | 'projects'): string[] {
  return openingFieldList(id).map((field) => field.type);
}
