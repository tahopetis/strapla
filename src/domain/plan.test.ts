import { describe, expect, it } from 'vitest';
import {
  PlanError,
  envelopeCheck,
  formatEntityCode,
  planContainsFiscalYear,
  planYears,
  pricingFlags,
  programAvailability,
  validatePlanYears,
} from './plan';

describe('validatePlanYears', () => {
  it('accepts a normal horizon', () => {
    expect(validatePlanYears(2026, 2030)).toBeNull();
    expect(validatePlanYears(2026, 2026)).toBeNull();
  });

  it('rejects reversed, out-of-range and absurd horizons', () => {
    expect(validatePlanYears(2030, 2026)).toMatch(/end fiscal year/i);
    expect(validatePlanYears(1990, 1995)).toMatch(/between 2000 and 2100/);
    expect(validatePlanYears(2026, 2040)).toMatch(/between 1 and 10 years/);
  });
});

describe('planYears', () => {
  it('lists every fiscal year in the horizon', () => {
    expect(planYears({ startFiscalYear: 2026, endFiscalYear: 2029 })).toEqual([
      2026, 2027, 2028, 2029,
    ]);
  });
});

describe('planContainsFiscalYear', () => {
  const plan = { startFiscalYear: 2026, endFiscalYear: 2030 };
  it('checks inclusive bounds (BR-1)', () => {
    expect(planContainsFiscalYear(plan, 2026)).toBe(true);
    expect(planContainsFiscalYear(plan, 2030)).toBe(true);
    expect(planContainsFiscalYear(plan, 2025)).toBe(false);
    expect(planContainsFiscalYear(plan, 2031)).toBe(false);
  });
});

describe('formatEntityCode', () => {
  it('formats padded, readable codes', () => {
    expect(formatEntityCode('project', 2027, 1)).toBe('PRJ-2027-001');
    expect(formatEntityCode('program', 2027, 12)).toBe('PRG-2027-012');
    expect(formatEntityCode('SI', 2026, 3)).toBe('SI-2026-003');
  });

  it('rejects invalid years and sequences', () => {
    expect(() => formatEntityCode('project', 1999, 1)).toThrow(PlanError);
    expect(() => formatEntityCode('project', 2027, 0)).toThrow(PlanError);
  });
});

describe('envelopeCheck (BR-2)', () => {
  it('computes consumed and remaining headroom', () => {
    const check = envelopeCheck({
      envelopeAmount: 10_000,
      priorProgramBudgetUsed: 2_000,
      programBudgets: [1_000, 1_500],
    });
    expect(check).toEqual({ consumed: 4_500, remaining: 5_500, over: false });
  });

  it('flags when consumed exceeds the envelope, never throws', () => {
    const check = envelopeCheck({
      envelopeAmount: 1_000,
      priorProgramBudgetUsed: 900,
      programBudgets: [200],
    });
    expect(check.over).toBe(true);
    expect(check.remaining).toBe(-100);
  });
});

describe('programAvailability (BR-7)', () => {
  it('adds budget and carry-in per component', () => {
    expect(
      programAvailability({
        capexBudget: 1_000,
        opexBudget: 400,
        carryInCapex: 100,
        carryInOpex: 50,
      }),
    ).toEqual({ capexAvailable: 1_100, opexAvailable: 450 });
  });
});

describe('pricingFlags (BR-9/BR-18)', () => {
  it('flags final above approved or submitted', () => {
    expect(
      pricingFlags({ approvedBudget: 100, submittedPrice: 120, finalDealPrice: 110 }),
    ).toEqual({ overApprovedBudget: true, overSubmittedPrice: false });
    expect(
      pricingFlags({ approvedBudget: 150, submittedPrice: 120, finalDealPrice: 110 }),
    ).toEqual({ overApprovedBudget: false, overSubmittedPrice: false });
    expect(
      pricingFlags({ approvedBudget: 100, submittedPrice: 100, finalDealPrice: 130 }),
    ).toEqual({ overApprovedBudget: true, overSubmittedPrice: true });
  });

  it('does not flag missing figures', () => {
    expect(
      pricingFlags({ approvedBudget: null, submittedPrice: null, finalDealPrice: null }),
    ).toEqual({ overApprovedBudget: false, overSubmittedPrice: false });
  });
});
