import { describe, expect, it } from 'vitest';
import {
  SettlementError,
  closedYearChargedToCurrentYear,
  closedYearReserve,
  commitmentStatus,
  crossYearExcluded,
  currentYearSpend,
  isCrossYearSettlement,
  openCommitmentAmount,
  postCloseTreatmentFor,
  settlementPortionIsCrossYear,
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

describe('post-close settlement treatment (ADR-0003 §4a, #98)', () => {
  it('stays empty when no split settles a commitment from a closed annual plan', () => {
    expect(postCloseTreatmentFor({ closedYearSettled: 0, requested: undefined })).toBeNull();
    expect(postCloseTreatmentFor({ closedYearSettled: 0, requested: null })).toBeNull();
  });

  it('defaults a closed-year split to charging the current year', () => {
    expect(postCloseTreatmentFor({ closedYearSettled: 5_000, requested: undefined })).toBe(
      'charge_current_year',
    );
    expect(postCloseTreatmentFor({ closedYearSettled: 5_000, requested: null })).toBe(
      'charge_current_year',
    );
  });

  it('keeps an explicit treatment for closed-year splits', () => {
    expect(
      postCloseTreatmentFor({
        closedYearSettled: 5_000,
        requested: 'charge_closed_year_reserve',
      }),
    ).toBe('charge_closed_year_reserve');
    expect(
      postCloseTreatmentFor({ closedYearSettled: 5_000, requested: 'charge_current_year' }),
    ).toBe('charge_current_year');
  });

  it('refuses a treatment on a transaction with no closed-year split', () => {
    expect(() =>
      postCloseTreatmentFor({
        closedYearSettled: 0,
        requested: 'charge_current_year',
      }),
    ).toThrow(SettlementError);
    expect(() =>
      postCloseTreatmentFor({
        closedYearSettled: 0,
        requested: 'charge_closed_year_reserve',
      }),
    ).toThrow(SettlementError);
  });

  it('rejects a treatment outside the two agreed values', () => {
    expect(() =>
      postCloseTreatmentFor({
        closedYearSettled: 1_000,
        requested: 'charge_somewhere_else' as never,
      }),
    ).toThrow(SettlementError);
  });
});

describe('current-year spend with a closed-year portion', () => {
  const mixed = {
    amount: 10_000,
    settlementKind: 'current' as const,
    // 6,000 settles an earlier year: 4,000 a closed plan, 2,000 an open one
    crossYearSettled: 6_000,
    closedYearSettled: 4_000,
    priorYearOpening: false,
  };

  it('counts the closed-year portion when it is charged to the current year', () => {
    const spend = { ...mixed, postCloseTreatment: 'charge_current_year' as const };
    // only the ordinary earlier-year portion stays excluded
    expect(crossYearExcluded(spend)).toBe(2_000);
    expect(currentYearSpend([spend])).toBe(8_000);
  });

  it('excludes the closed-year portion when it is reserved in the closed year', () => {
    const spend = { ...mixed, postCloseTreatment: 'charge_closed_year_reserve' as const };
    expect(crossYearExcluded(spend)).toBe(6_000);
    expect(currentYearSpend([spend])).toBe(4_000);
  });

  it('treats a missing treatment like today: every earlier-year portion is excluded', () => {
    expect(crossYearExcluded(mixed)).toBe(6_000);
    expect(currentYearSpend([mixed])).toBe(4_000);
  });

  it('reports the reserve and current-year-charge portions separately', () => {
    expect(
      closedYearReserve({ ...mixed, postCloseTreatment: 'charge_closed_year_reserve' }),
    ).toBe(4_000);
    expect(closedYearReserve({ ...mixed, postCloseTreatment: 'charge_current_year' })).toBe(0);
    expect(
      closedYearChargedToCurrentYear({ ...mixed, postCloseTreatment: 'charge_current_year' }),
    ).toBe(4_000);
    expect(
      closedYearChargedToCurrentYear({ ...mixed, postCloseTreatment: 'charge_closed_year_reserve' }),
    ).toBe(0);
  });

  it('rejects a closed-year portion larger than the cross-year settlement', () => {
    expect(() =>
      crossYearExcluded({
        amount: 10_000,
        settlementKind: 'current',
        crossYearSettled: 2_000,
        closedYearSettled: 3_000,
        priorYearOpening: false,
      }),
    ).toThrow(SettlementError);
  });

  it('still excludes prior-year opening payments and ordinary cross-year settlements', () => {
    expect(
      currentYearSpend([
        { amount: 500, settlementKind: 'current', crossYearSettled: 0, priorYearOpening: false },
        {
          amount: 300,
          settlementKind: 'current',
          crossYearSettled: 300,
          closedYearSettled: 0,
          postCloseTreatment: null,
          priorYearOpening: false,
        },
        { amount: 200, settlementKind: 'prior_year_opening', crossYearSettled: 0, priorYearOpening: true },
      ]),
    ).toBe(500);
  });
});

describe('settlementPortionIsCrossYear', () => {
  const base = {
    commitmentFiscalYear: 2027,
    spendFiscalYear: 2028,
    settlementKind: 'current' as const,
    commitmentPlanClosed: false,
    postCloseTreatment: null,
  };

  it('keeps an ordinary earlier-year settlement cross-year', () => {
    expect(settlementPortionIsCrossYear(base)).toBe(true);
  });

  it('keeps a reserved closed-year portion cross-year and a charged one current', () => {
    expect(
      settlementPortionIsCrossYear({
        ...base,
        commitmentPlanClosed: true,
        postCloseTreatment: 'charge_closed_year_reserve',
      }),
    ).toBe(true);
    expect(
      settlementPortionIsCrossYear({
        ...base,
        commitmentPlanClosed: true,
        postCloseTreatment: 'charge_current_year',
      }),
    ).toBe(false);
    // no reachable path stores a closed-year split without a treatment, but a
    // missing one must behave like today (reserve) rather than count as spend
    expect(
      settlementPortionIsCrossYear({ ...base, commitmentPlanClosed: true, postCloseTreatment: null }),
    ).toBe(true);
  });

  it('never treats a same-year or opening-payment settlement as cross-year', () => {
    expect(settlementPortionIsCrossYear({ ...base, commitmentFiscalYear: 2028 })).toBe(false);
    expect(
      settlementPortionIsCrossYear({
        ...base,
        settlementKind: 'prior_year_opening',
        commitmentPlanClosed: true,
      }),
    ).toBe(false);
  });
});

describe('post-close aggregation split (the settlement loop)', () => {
  // Mirrors the per-settlement classification in execution-aggregates.ts: one
  // FY2028 payment settles a closed FY2027 commitment and an open FY2028 one.
  const spendFiscalYear = 2028;
  const settlementKind = 'current' as const;
  const portions = [
    { commitmentFiscalYear: 2027, commitmentPlanClosed: true, amount: 10_000 },
    { commitmentFiscalYear: 2028, commitmentPlanClosed: false, amount: 5_000 },
  ];

  function split(treatment: 'charge_current_year' | 'charge_closed_year_reserve') {
    let crossYear = 0;
    let current = 0;
    let reserve = 0;
    let charged = 0;
    for (const portion of portions) {
      if (
        settlementPortionIsCrossYear({
          commitmentFiscalYear: portion.commitmentFiscalYear,
          spendFiscalYear,
          settlementKind,
          commitmentPlanClosed: portion.commitmentPlanClosed,
          postCloseTreatment: treatment,
        })
      ) {
        crossYear += portion.amount;
        if (portion.commitmentPlanClosed) reserve += portion.amount;
      } else if (portion.commitmentPlanClosed) {
        current += portion.amount;
        charged += portion.amount;
      } else {
        current += portion.amount;
      }
    }
    return { crossYear, current, reserve, charged };
  }

  it('charges only the closed-year portion to the current year under option A', () => {
    expect(split('charge_current_year')).toEqual({
      crossYear: 0,
      current: 15_000,
      reserve: 0,
      charged: 10_000,
    });
  });

  it('keeps the closed-year portion as a reserve under option B', () => {
    expect(split('charge_closed_year_reserve')).toEqual({
      crossYear: 10_000,
      current: 5_000,
      reserve: 10_000,
      charged: 0,
    });
  });
});
