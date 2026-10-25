import { describe, expect, it } from 'vitest';
import {
  SettlementError,
  commitmentStatus,
  currentYearSpend,
  isCrossYearSettlement,
  openCommitmentAmount,
  spendExceedsFiscalYearCommitment,
  validateSettlementSplits,
} from './settlement';

describe('openCommitmentAmount and commitmentStatus', () => {
  it('computes the open amount and the lifecycle status', () => {
    expect(openCommitmentAmount({ amount: 1_000, settledAmount: 300 })).toBe(700);
    expect(commitmentStatus({ amount: 1_000, settledAmount: 0 })).toBe('open');
    expect(commitmentStatus({ amount: 1_000, settledAmount: 300 })).toBe('partially_settled');
    expect(commitmentStatus({ amount: 1_000, settledAmount: 1_000 })).toBe('settled');
  });

  it('rejects over-settlement and invalid amounts', () => {
    expect(() => openCommitmentAmount({ amount: 100, settledAmount: 101 })).toThrow(SettlementError);
    expect(() => openCommitmentAmount({ amount: -1, settledAmount: 0 })).toThrow();
  });
});

describe('validateSettlementSplits', () => {
  const base = { commitmentId: 'c1', amount: 300, commitmentAmount: 1_000, alreadySettled: 0 };

  it('accepts valid splits, including partial settlement', () => {
    expect(() =>
      validateSettlementSplits({
        spendAmount: 500,
        splits: [base, { commitmentId: 'c2', amount: 200, commitmentAmount: 400, alreadySettled: 100 }],
      }),
    ).not.toThrow();
  });

  it('rejects a split above the open commitment amount', () => {
    expect(() =>
      validateSettlementSplits({
        spendAmount: 1_000,
        splits: [{ ...base, alreadySettled: 800, amount: 300 }],
      }),
    ).toThrow(SettlementError);
  });

  it('rejects splits above the spend amount', () => {
    expect(() => validateSettlementSplits({ spendAmount: 200, splits: [base] })).toThrow(
      SettlementError,
    );
  });

  it('rejects duplicates and zero amounts', () => {
    expect(() =>
      validateSettlementSplits({ spendAmount: 500, splits: [base, { ...base }] }),
    ).toThrow(SettlementError);
    expect(() =>
      validateSettlementSplits({ spendAmount: 500, splits: [{ ...base, amount: 0 }] }),
    ).toThrow(SettlementError);
  });
});

describe('cross-year classification (ADR-0003 §4)', () => {
  it('classifies earlier-year commitments as cross-year settlements', () => {
    expect(
      isCrossYearSettlement({ commitmentFiscalYear: 2027, spendFiscalYear: 2028, settlementKind: 'current' }),
    ).toBe(true);
    expect(
      isCrossYearSettlement({ commitmentFiscalYear: 2028, spendFiscalYear: 2028, settlementKind: 'current' }),
    ).toBe(false);
    expect(
      isCrossYearSettlement({
        commitmentFiscalYear: 2026,
        spendFiscalYear: 2028,
        settlementKind: 'prior_year_opening',
      }),
    ).toBe(false);
  });
});

describe('currentYearSpend', () => {
  it('excludes cross-year settlement portions and prior-year opening payments', () => {
    const total = currentYearSpend([
      { amount: 500, settlementKind: 'current', crossYearSettled: 0, priorYearOpening: false },
      { amount: 300, settlementKind: 'current', crossYearSettled: 300, priorYearOpening: false },
      { amount: 200, settlementKind: 'prior_year_opening', crossYearSettled: 0, priorYearOpening: true },
    ]);
    expect(total).toBe(500);
  });

  it('rejects a cross-year portion larger than the spend', () => {
    expect(() =>
      currentYearSpend([
        { amount: 100, settlementKind: 'current', crossYearSettled: 150, priorYearOpening: false },
      ]),
    ).toThrow(SettlementError);
  });
});

describe('spendExceedsFiscalYearCommitment (BR-11)', () => {
  it('flags only when spend is above the commitment total', () => {
    expect(
      spendExceedsFiscalYearCommitment({ currentYearSpend: 1_000, fiscalYearCommitments: 1_000 }),
    ).toBe(false);
    expect(
      spendExceedsFiscalYearCommitment({ currentYearSpend: 1_001, fiscalYearCommitments: 1_000 }),
    ).toBe(true);
  });
});
