import { describe, expect, it } from 'vitest';
import {
  allocationRemaining,
  programBudgetPosition,
  projectFundingFlags,
} from './funding';

describe('programBudgetPosition (BR-7)', () => {
  it('computes available and unallocated per component', () => {
    const position = programBudgetPosition({
      capexBudget: 1_200,
      opexBudget: 300,
      carryInCapex: 100,
      carryInOpex: 25,
      allocatedCapex: 600,
      allocatedOpex: 200,
    });
    expect(position.capex).toEqual({ available: 1_300, unallocated: 700, over: false });
    expect(position.opex).toEqual({ available: 325, unallocated: 125, over: false });
  });

  it('flags over-allocation per component but returns the numbers', () => {
    const position = programBudgetPosition({
      capexBudget: 100,
      opexBudget: 100,
      carryInCapex: 0,
      carryInOpex: 0,
      allocatedCapex: 120,
      allocatedOpex: 100,
    });
    expect(position.capex.over).toBe(true);
    expect(position.capex.unallocated).toBe(-20);
    expect(position.opex.over).toBe(false);
    expect(position.opex.unallocated).toBe(0);
  });

  it('treats carry-in as part of the available budget', () => {
    const position = programBudgetPosition({
      capexBudget: 0,
      opexBudget: 0,
      carryInCapex: 500,
      carryInOpex: 0,
      allocatedCapex: 400,
      allocatedOpex: 0,
    });
    expect(position.capex.available).toBe(500);
    expect(position.capex.unallocated).toBe(100);
  });

  it('rejects negative or unsafe amounts', () => {
    expect(() =>
      programBudgetPosition({
        capexBudget: -1,
        opexBudget: 0,
        carryInCapex: 0,
        carryInOpex: 0,
        allocatedCapex: 0,
        allocatedOpex: 0,
      }),
    ).toThrow();
  });
});

describe('allocationRemaining (ADR-0003)', () => {
  it('equals allocation plus carry-in when nothing is committed or spent', () => {
    expect(
      allocationRemaining({
        allocationCapex: 600,
        allocationOpex: 200,
        carryInCapex: 50,
        carryInOpex: 10,
      }),
    ).toEqual({ capex: 650, opex: 210 });
  });

  it('subtracts open commitments and spend per component', () => {
    expect(
      allocationRemaining({
        allocationCapex: 600,
        allocationOpex: 200,
        carryInCapex: 0,
        carryInOpex: 0,
        openCommitmentsCapex: 100,
        spendCapex: 50,
        openCommitmentsOpex: 200,
        spendOpex: 25,
      }),
    ).toEqual({ capex: 450, opex: -25 });
  });
});

describe('projectFundingFlags', () => {
  const base = {
    approvedBudget: 1_000,
    submittedPrice: 950,
    finalDealPrice: 900,
    openingCommitted: 50,
    inAppCommitments: 0,
    allocatedFullLife: 1_000,
    totalAllocated: 600,
  };

  it('returns no flags for a healthy project', () => {
    expect(projectFundingFlags(base)).toEqual([]);
  });

  it('flags over approved budget and above submitted price (BR-9/BR-18)', () => {
    const flags = projectFundingFlags({ ...base, finalDealPrice: 1_200 });
    expect(flags.map((flag) => flag.code)).toEqual([
      'over_approved_budget',
      'above_submitted_price',
    ]);
  });

  it('flags lifetime commitments over the contract value (BR-8)', () => {
    const flags = projectFundingFlags({ ...base, openingCommitted: 800, inAppCommitments: 200 });
    expect(flags.map((flag) => flag.code)).toContain('commitments_over_contract');
  });

  it('flags allocations above the full-life allocated budget', () => {
    const flags = projectFundingFlags({ ...base, totalAllocated: 1_200 });
    expect(flags.map((flag) => flag.code)).toEqual(['project_allocations_over_full_life']);
  });

  it('does not flag missing figures', () => {
    expect(
      projectFundingFlags({
        ...base,
        approvedBudget: null,
        submittedPrice: null,
        finalDealPrice: null,
        openingCommitted: 0,
        allocatedFullLife: 0,
        totalAllocated: 0,
      }),
    ).toEqual([]);
  });
});
