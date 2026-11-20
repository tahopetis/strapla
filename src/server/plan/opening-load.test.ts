import { describe, expect, it } from 'vitest';
import type { CustomFieldDefinition } from '@/domain/custom-fields';
import type { ParsedRow } from '@/lib/opening-import/parse';
import {
  planInitiativesLoad,
  planProgramsLoad,
  planProjectsLoad,
  type OpeningCustomField,
  type OpeningLoadContext,
} from './opening-load';

function context(overrides: Partial<OpeningLoadContext> = {}): OpeningLoadContext {
  return {
    planId: 'plan-1',
    annualPlanId: 'annual-1',
    annualPlanFiscalYear: 2027,
    planStartFiscalYear: 2026,
    planEndFiscalYear: 2030,
    initiativeIdByCode: new Map([['SI-01', 'si-1']]),
    programIdByCode: new Map([['PRG-01', 'program-1']]),
    existingInitiativeCodes: new Set<string>(),
    existingProgramCodes: new Set<string>(),
    existingProjectCodes: new Set<string>(),
    ...overrides,
  };
}

function row(line: number, values: Record<string, string | number | null>): ParsedRow {
  return { line, values };
}

function initiativeRow(line: number, code: string, extra: Record<string, string | number | null> = {}) {
  return row(line, {
    code,
    name: `Initiative ${code}`,
    owner: null,
    objective: null,
    envelopeAmount: 1_000,
    priorProgramBudgetUsed: 0,
    notes: null,
    ...extra,
  });
}

function programRow(line: number, code: string, extra: Record<string, string | number | null> = {}) {
  return row(line, {
    code,
    name: `Program ${code}`,
    siCode: 'SI-01',
    prevProgramCode: null,
    capexBudget: 500,
    opexBudget: 200,
    carryInCapex: 0,
    carryInOpex: 0,
    notes: null,
    ...extra,
  });
}

function projectRow(line: number, extra: Record<string, string | number | null> = {}) {
  return row(line, {
    code: null,
    name: `Project ${line}`,
    originatingProgramCode: 'PRG-01',
    externalReference: null,
    owner: null,
    description: null,
    startFiscalYear: 2027,
    endFiscalYear: 2028,
    allocatedBudgetFullLife: 1_000,
    submittedPrice: null,
    finalDealPrice: null,
    openingAllocated: 100,
    openingCommitted: 50,
    openingSpent: 25,
    ijinPrinsipDocumentNumber: null,
    ijinPrinsipDocumentDate: null,
    ijinPrinsipApprovedAmount: null,
    ijinPrinsipApprover: null,
    ijinPrinsipDocumentUrl: null,
    ijinPrinsipNotes: null,
    ...extra,
  });
}

function customField(
  overrides: Partial<CustomFieldDefinition> = {},
  column?: string,
): OpeningCustomField {
  const definition: CustomFieldDefinition = {
    id: 'field-procurement',
    entityType: 'project',
    name: 'Procurement method',
    key: 'procurementMethod',
    type: 'text',
    required: false,
    description: 'How the project is procured.',
    example: '',
    position: 0,
    ...overrides,
  };
  return { column: column ?? definition.key, label: definition.name, definition };
}

describe('planInitiativesLoad', () => {
  it('maps rows to initiative insert values', () => {
    const { plan, errors } = planInitiativesLoad([initiativeRow(2, 'SI-90')], context());
    expect(errors).toEqual([]);
    expect(plan.initiatives).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          planId: 'plan-1',
          code: 'SI-90',
          name: 'Initiative SI-90',
          envelopeAmount: 1_000,
        }),
      }),
    ]);
  });

  it('rejects a code that already exists or repeats within the file', () => {
    const existing = planInitiativesLoad(
      [initiativeRow(2, 'SI-01')],
      context({ existingInitiativeCodes: new Set(['SI-01']) }),
    );
    expect(existing.errors[0]).toMatchObject({ line: 2, column: 'Code' });
    expect(existing.errors[0]?.message).toContain('already exists');

    const repeated = planInitiativesLoad(
      [initiativeRow(2, 'SI-90'), initiativeRow(3, 'SI-90')],
      context(),
    );
    expect(repeated.errors[0]).toMatchObject({ line: 3, column: 'Code' });
  });
});

describe('planProgramsLoad', () => {
  it('resolves the SI and an in-plan continuation code', () => {
    const { plan, errors } = planProgramsLoad(
      [programRow(2, 'PRG-90', { prevProgramCode: 'PRG-01' })],
      context(),
    );
    expect(errors).toEqual([]);
    expect(plan.programs[0]?.values).toMatchObject({
      annualPlanId: 'annual-1',
      siId: 'si-1',
      prevProgramId: 'program-1',
      code: 'PRG-90',
      capexBudget: 500,
    });
  });

  it('rejects an unknown SI code and a duplicate program code', () => {
    const unknown = planProgramsLoad([programRow(2, 'PRG-90', { siCode: 'SI-99' })], context());
    expect(unknown.errors[0]).toMatchObject({ line: 2, column: 'Strategic initiative code' });

    const duplicate = planProgramsLoad(
      [programRow(2, 'PRG-01')],
      context({ existingProgramCodes: new Set(['PRG-01']) }),
    );
    expect(duplicate.errors[0]).toMatchObject({ line: 2, column: 'Code' });
  });
});

describe('planProjectsLoad', () => {
  it('generates codes in sequence and avoids existing ones', () => {
    const { plan, errors } = planProjectsLoad(
      [projectRow(2), projectRow(3), projectRow(4)],
      context({ existingProjectCodes: new Set(['PRJ-2027-001']) }),
    );
    expect(errors).toEqual([]);
    expect(plan.projects.map((project) => project.values.code)).toEqual([
      'PRJ-2027-002',
      'PRJ-2027-003',
      'PRJ-2027-004',
    ]);
  });

  it('rejects unknown programs, duplicate supplied codes and invalid years', () => {
    const unknown = planProjectsLoad(
      [projectRow(2, { originatingProgramCode: 'PRG-99' })],
      context(),
    );
    expect(unknown.errors[0]).toMatchObject({ line: 2, column: 'Originating program code' });

    const duplicate = planProjectsLoad(
      [projectRow(2, { code: 'PRJ-2027-001' })],
      context({ existingProjectCodes: new Set(['PRJ-2027-001']) }),
    );
    expect(duplicate.errors[0]).toMatchObject({ line: 2, column: 'Code' });

    const badYears = planProjectsLoad(
      [projectRow(2, { startFiscalYear: 2031, endFiscalYear: 2032 })],
      context(),
    );
    expect(badYears.errors[0]).toMatchObject({ line: 2, column: 'Start fiscal year' });

    const beforeProgram = planProjectsLoad(
      [projectRow(2, { startFiscalYear: 2026, endFiscalYear: 2027 })],
      context(),
    );
    expect(beforeProgram.errors[0]).toMatchObject({ line: 2, column: 'Start fiscal year' });
  });

  it('plans the ijin prinsip record and requires an approved amount with other ijin fields', () => {
    const withIjin = planProjectsLoad(
      [
        projectRow(2, {
          ijinPrinsipDocumentNumber: '002/IP/2026',
          ijinPrinsipDocumentDate: '2026-03-31',
          ijinPrinsipApprovedAmount: 900,
          ijinPrinsipApprover: 'Board',
        }),
      ],
      context(),
    );
    expect(withIjin.errors).toEqual([]);
    expect(withIjin.plan.ijins).toEqual([
      expect.objectContaining({
        line: 2,
        projectCode: 'PRJ-2027-001',
        ijin: expect.objectContaining({ approvedAmount: 900, documentDate: '2026-03-31' }),
      }),
    ]);

    const missingAmount = planProjectsLoad(
      [projectRow(2, { ijinPrinsipDocumentNumber: '002/IP/2026' })],
      context(),
    );
    expect(missingAmount.errors[0]).toMatchObject({
      line: 2,
      column: 'Ijin prinsip approved amount (Rp)',
    });
  });
});

describe('planOpeningLoad — custom-field registry values (W9)', () => {
  it('attaches an optional registry value to the planned record, keyed by field id', () => {
    const { plan, errors } = planProjectsLoad(
      [projectRow(2, { procurementMethod: 'Tender' })],
      context(),
      [customField()],
    );
    expect(errors).toEqual([]);
    expect(plan.projects[0]?.customFieldValues).toEqual({ 'field-procurement': 'Tender' });
  });

  it('fails the row when a required registry value is missing, whether the column or the cell is absent', () => {
    const required = customField({ required: true });

    const missingColumn = planProjectsLoad([projectRow(2)], context(), [required]);
    expect(missingColumn.errors).toEqual([
      { line: 2, column: 'Procurement method', message: 'Procurement method is required.' },
    ]);
    expect(missingColumn.plan.projects).toEqual([]);

    const blankCell = planProjectsLoad([projectRow(3, { procurementMethod: null })], context(), [
      required,
    ]);
    expect(blankCell.errors).toEqual([
      { line: 3, column: 'Procurement method', message: 'Procurement method is required.' },
    ]);
    expect(blankCell.plan.projects).toEqual([]);
  });

  it('reports the failing row only, attributing the error to its line', () => {
    const required = customField({ required: true });
    const { plan, errors } = planProjectsLoad(
      [projectRow(2, { procurementMethod: 'Tender' }), projectRow(3)],
      context(),
      [required],
    );
    expect(errors).toEqual([
      { line: 3, column: 'Procurement method', message: 'Procurement method is required.' },
    ]);
    expect(plan.projects.map((record) => record.values.code)).toEqual(['PRJ-2027-001']);
  });

  it('applies the form rules too, so an imported record stays editable', () => {
    const { plan, errors } = planProjectsLoad(
      [projectRow(2, { procurementMethod: 'x'.repeat(2001) })],
      context(),
      [customField()],
    );
    expect(errors[0]).toMatchObject({ line: 2, column: 'Procurement method' });
    expect(errors[0]?.message).toContain('at most 2000');
    expect(plan.projects).toEqual([]);
  });

  it('attaches registry values to initiatives and programs as well', () => {
    const initiative = planInitiativesLoad(
      [initiativeRow(2, 'SI-90', { portfolioNote: 'Watch' })],
      context(),
      [
        customField({
          id: 'field-si-note',
          entityType: 'strategic_initiative',
          name: 'Portfolio note',
          key: 'portfolioNote',
        }),
      ],
    );
    expect(initiative.plan.initiatives[0]?.customFieldValues).toEqual({
      'field-si-note': 'Watch',
    });

    const program = planProgramsLoad(
      [programRow(2, 'PRG-90', { fundSource: 'APBN' })],
      context(),
      [
        customField({
          id: 'field-program-fund',
          entityType: 'annual_program',
          name: 'Funding source',
          key: 'fundSource',
        }),
      ],
    );
    expect(program.plan.programs[0]?.customFieldValues).toEqual({
      'field-program-fund': 'APBN',
    });
  });
});
