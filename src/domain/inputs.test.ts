import { describe, expect, it } from 'vitest';
import { carryOverAmountSchema, closeFiscalYearSchema } from './inputs';

const base = {
  annualPlanId: '00000000-0000-4000-8000-000000000000',
  reference: 'Board memo 12/2027',
};

describe('carryOverAmountSchema', () => {
  it('accepts an explicit zero and whole Rupiah amounts', () => {
    expect(carryOverAmountSchema('PRG-01 capex').parse('0')).toBe(0);
    expect(carryOverAmountSchema('PRG-01 capex').parse('1.234.567')).toBe(1_234_567);
  });

  it('rejects a blank field so a zero carry-over is explicit', () => {
    for (const raw of ['', '   ']) {
      const result = carryOverAmountSchema('PRG-01 capex').safeParse(raw);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toMatch(/use 0 for none/);
    }
  });

  it('rejects values that are not whole, non-negative Rupiah', () => {
    for (const raw of ['abc', '-5']) {
      expect(carryOverAmountSchema('PRG-01 capex').safeParse(raw).success).toBe(false);
    }
  });
});

describe('closeFiscalYearSchema', () => {
  it('requires a non-blank typed confirmation field', () => {
    expect(closeFiscalYearSchema.safeParse({ ...base, confirmation: '' }).success).toBe(false);
    expect(closeFiscalYearSchema.safeParse({ ...base, confirmation: 'CLOSE FY2027' }).success).toBe(
      true,
    );
  });

  it('requires the approval reference', () => {
    expect(
      closeFiscalYearSchema.safeParse({ ...base, reference: '  ', confirmation: 'CLOSE FY2027' })
        .success,
    ).toBe(false);
  });
});
