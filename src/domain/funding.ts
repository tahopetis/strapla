import { assertRupiah, remaining, type Rupiah } from './money';

/**
 * Funding rules for M2 (charter §6.5–6.7, ADR-0003). Pure functions used by
 * the allocation screens, the flag engine and (later) reports.
 */

export type Component = 'capex' | 'opex';

export interface BudgetPosition {
  available: Rupiah;
  unallocated: Rupiah;
  over: boolean;
}

export interface ProgramBudgetPosition {
  capex: BudgetPosition;
  opex: BudgetPosition;
}

/**
 * BR-7: program available money is budget + carry-in per component; what is
 * not yet allocated to project year allocations is the unallocated budget.
 * Allocation above it is flagged, never blocked (BR-17).
 */
export function programBudgetPosition(input: {
  capexBudget: Rupiah;
  opexBudget: Rupiah;
  carryInCapex: Rupiah;
  carryInOpex: Rupiah;
  allocatedCapex: Rupiah;
  allocatedOpex: Rupiah;
}): ProgramBudgetPosition {
  const position = (budget: Rupiah, carryIn: Rupiah, allocated: Rupiah): BudgetPosition => {
    const available = assertRupiah(budget) + assertRupiah(carryIn);
    const unallocated = available - assertRupiah(allocated);
    if (!Number.isSafeInteger(unallocated)) {
      throw new Error('program budget position is outside the safe integer range');
    }
    return { available, unallocated, over: unallocated < 0 };
  };
  return {
    capex: position(input.capexBudget, input.carryInCapex, input.allocatedCapex),
    opex: position(input.opexBudget, input.carryInOpex, input.allocatedOpex),
  };
}

export interface AllocationPosition {
  capex: Rupiah;
  opex: Rupiah;
}

/**
 * Remaining per component for a project year allocation (ADR-0003 §3).
 * Commitments and spend default to zero until M3 adds them.
 */
export function allocationRemaining(input: {
  allocationCapex: Rupiah;
  allocationOpex: Rupiah;
  carryInCapex: Rupiah;
  carryInOpex: Rupiah;
  openCommitmentsCapex?: Rupiah;
  openCommitmentsOpex?: Rupiah;
  spendCapex?: Rupiah;
  spendOpex?: Rupiah;
}): AllocationPosition {
  return {
    capex: remaining({
      allocation: input.allocationCapex,
      carryIn: input.carryInCapex,
      openCommitments: input.openCommitmentsCapex ?? 0,
      currentYearSpend: input.spendCapex ?? 0,
    }),
    opex: remaining({
      allocation: input.allocationOpex,
      carryIn: input.carryInOpex,
      openCommitments: input.openCommitmentsOpex ?? 0,
      currentYearSpend: input.spendOpex ?? 0,
    }),
  };
}

export type FundingFlagCode =
  | 'over_approved_budget'
  | 'above_submitted_price'
  | 'commitments_over_contract'
  | 'project_allocations_over_full_life';

export interface FundingFlag {
  code: FundingFlagCode;
  severity: 'warning';
  message: string;
}

/**
 * Project-level flags from ADR-0003 §6. Flags never block data entry (BR-17).
 * Commitment figures include the opening committed amount; in-app commitments
 * arrive in M3 and are passed in by the caller.
 */
export function projectFundingFlags(input: {
  approvedBudget: Rupiah | null;
  submittedPrice: Rupiah | null;
  finalDealPrice: Rupiah | null;
  openingCommitted: Rupiah;
  inAppCommitments?: Rupiah;
  allocatedFullLife: Rupiah;
  totalAllocated: Rupiah;
}): FundingFlag[] {
  const flags: FundingFlag[] = [];
  const { approvedBudget, submittedPrice, finalDealPrice } = input;

  if (approvedBudget !== null && finalDealPrice !== null && finalDealPrice > approvedBudget) {
    flags.push({
      code: 'over_approved_budget',
      severity: 'warning',
      message: 'Final deal price exceeds the ijin prinsip approved budget (BR-9).',
    });
  }
  if (submittedPrice !== null && finalDealPrice !== null && finalDealPrice > submittedPrice) {
    flags.push({
      code: 'above_submitted_price',
      severity: 'warning',
      message: 'Final deal price is above the highest submitted price (BR-18).',
    });
  }

  const lifetimeCommitments = assertRupiah(input.openingCommitted) + (input.inAppCommitments ?? 0);
  if (finalDealPrice !== null && lifetimeCommitments > finalDealPrice) {
    flags.push({
      code: 'commitments_over_contract',
      severity: 'warning',
      message: 'Lifetime commitments exceed the contract value (BR-8).',
    });
  }

  if (assertRupiah(input.totalAllocated) > assertRupiah(input.allocatedFullLife)) {
    flags.push({
      code: 'project_allocations_over_full_life',
      severity: 'warning',
      message: 'Annual allocations exceed the project full-life allocated budget.',
    });
  }

  return flags;
}
