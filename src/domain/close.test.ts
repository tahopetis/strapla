import { describe, expect, it } from 'vitest';
import {
  CloseError,
  assertCloseConfirmation,
  carryOverCandidate,
  carryOverTotals,
  closeConfirmationPhrase,
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

  it('rejects negative amounts and an unsafe running total', () => {
    expect(() => totalCarryOver([{ component: 'capex', amount: -1 }])).toThrow(CloseError);
    expect(() =>
      totalCarryOver([
        { component: 'capex', amount: Number.MAX_SAFE_INTEGER },
        { component: 'capex', amount: 1 },
      ]),
    ).toThrow(CloseError);
  });
});

describe('nextFiscalYear', () => {
  it('returns the following year', () => {
    expect(nextFiscalYear(2027)).toBe(2028);
  });
});

describe('closeConfirmationPhrase', () => {
  it('renders the exact phrase for the fiscal year', () => {
    expect(closeConfirmationPhrase(2027)).toBe('CLOSE FY2027');
    expect(closeConfirmationPhrase(2030)).toBe('CLOSE FY2030');
  });

});

describe('assertCloseConfirmation', () => {
  it('accepts only the exact phrase', () => {
    expect(() => assertCloseConfirmation('CLOSE FY2027', 2027)).not.toThrow();
    expect(() => assertCloseConfirmation('  CLOSE FY2027  ', 2027)).toThrow(CloseError);
  });

  it('rejects a wrong, empty or differently cased phrase with the expected phrase', () => {
    expect(() => assertCloseConfirmation('CLOSE FY2026', 2027)).toThrow(/"CLOSE FY2027"/);
    expect(() => assertCloseConfirmation('close fy2027', 2027)).toThrow(CloseError);
    expect(() => assertCloseConfirmation('', 2027)).toThrow(CloseError);
  });
});

describe('carryOverTotals', () => {
  it('splits the carry-over totals by entity and component for the preview', () => {
    expect(
      carryOverTotals([
        { entityType: 'program', component: 'capex', amount: 100 },
        { entityType: 'program', component: 'capex', amount: 50 },
        { entityType: 'program', component: 'opex', amount: 25 },
        { entityType: 'allocation', component: 'capex', amount: 10 },
        { entityType: 'allocation', component: 'opex', amount: 5 },
      ]),
    ).toEqual({
      program: { capex: 150, opex: 25 },
      allocation: { capex: 10, opex: 5 },
    });
  });

  it('returns zeros for an empty form', () => {
    expect(carryOverTotals([])).toEqual({
      program: { capex: 0, opex: 0 },
      allocation: { capex: 0, opex: 0 },
    });
  });

  it('rejects negative or fractional amounts', () => {
    expect(() =>
      carryOverTotals([{ entityType: 'program', component: 'capex', amount: -1 }]),
    ).toThrow(CloseError);
    expect(() =>
      carryOverTotals([{ entityType: 'allocation', component: 'opex', amount: 1.5 }]),
    ).toThrow(CloseError);
  });
});
