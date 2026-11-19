import { describe, expect, it } from 'vitest';
import type { ParsedRow } from '@/lib/opening-import/parse';
import {
  planInitiativesLoad,
  planProgramsLoad,
  planProjectsLoad,
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

describe('planInitiativesLoad', () => {
  it('maps rows to initiative insert values', () => {
    const { plan, errors } = planInitiativesLoad([initiativeRow(2, 'SI-90')], context());
    expect(errors).toEqual([]);
    expect(plan.initiatives).toEqual([
      expect.objectContaining({
        planId: 'plan-1',
        code: 'SI-90',
        name: 'Initiative SI-90',
        envelopeAmount: 1_000,
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
    expect(plan.programs[0]).toMatchObject({
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
    expect(plan.projects.map((project) => project.code)).toEqual([
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
