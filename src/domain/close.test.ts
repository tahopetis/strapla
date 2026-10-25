import { describe, expect, it } from 'vitest';
import {
  CloseError,
  carryOverCandidate,
  nextFiscalYear,
  totalCarryOver,
  validateCarryOverAmount,
} from './close';

describe('carryOverCandidate', () => {
  it('carries only positive remaining amounts', () => {
    expect(carryOverCandidate(1_000)).toBe(1_000);
    expect(carryOverCandidate(0)).toBe(0);
    expect(carryOverCandidate(-500)).toBe(0);
  });
});

describe('validateCarryOverAmount', () => {
  it('accepts amounts within the candidate and rejects negative or excessive ones', () => {
    expect(() =>
      validateCarryOverAmount({ amount: 500, available: 1_000, label: 'Program capex' }),
    ).not.toThrow();
    expect(() =>
      validateCarryOverAmount({ amount: 1_001, available: 1_000, label: 'Program capex' }),
    ).toThrow(CloseError);
    expect(() =>
      validateCarryOverAmount({ amount: -1, available: 1_000, label: 'Program capex' }),
    ).toThrow(CloseError);
  });

  it('treats a negative available as zero', () => {
    expect(() =>
      validateCarryOverAmount({ amount: 1, available: -300, label: 'Allocation opex' }),
    ).toThrow(CloseError);
  });
});

describe('totalCarryOver', () => {
  it('splits the totals per component', () => {
    expect(
      totalCarryOver([
        { component: 'capex', amount: 100 },
        { component: 'capex', amount: 50 },
        { component: 'opex', amount: 25 },
      ]),
    ).toEqual({ capex: 150, opex: 25 });
  });

  it('rejects negative amounts', () => {
    expect(() => totalCarryOver([{ component: 'capex', amount: -1 }])).toThrow(CloseError);
  });
});

describe('nextFiscalYear', () => {
  it('returns the following year', () => {
    expect(nextFiscalYear(2027)).toBe(2028);
  });
});
