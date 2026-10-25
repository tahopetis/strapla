import { assertRupiah, sumRupiah, type Rupiah } from './money';

/**
 * Plan-level rules (charter §6, W-1, BR-1..BR-4). Pure functions, no I/O.
 */

export const DEFAULT_PLAN_HORIZON_YEARS = 5;
export const MIN_FISCAL_YEAR = 2000;
export const MAX_FISCAL_YEAR = 2100;

export class PlanError extends Error {}

export function assertFiscalYear(value: number, label = 'fiscal year'): number {
  if (!Number.isInteger(value) || value < MIN_FISCAL_YEAR || value > MAX_FISCAL_YEAR) {
    throw new PlanError(`${label} must be a whole year between ${MIN_FISCAL_YEAR} and ${MAX_FISCAL_YEAR}`);
  }
  return value;
}

/** Returns an error message when the plan horizon is invalid, otherwise null. */
export function validatePlanYears(startFiscalYear: number, endFiscalYear: number): string | null {
  try {
    assertFiscalYear(startFiscalYear, 'start fiscal year');
    assertFiscalYear(endFiscalYear, 'end fiscal year');
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid plan horizon';
  }
  if (endFiscalYear < startFiscalYear) {
    return 'The end fiscal year must not be before the start fiscal year.';
  }
  const years = endFiscalYear - startFiscalYear + 1;
  if (years < 1 || years > 10) {
    return 'The plan horizon must be between 1 and 10 years.';
  }
  return null;
}

export function planYears(plan: { startFiscalYear: number; endFiscalYear: number }): number[] {
  const years: number[] = [];
  for (let year = plan.startFiscalYear; year <= plan.endFiscalYear; year += 1) {
    years.push(year);
  }
  return years;
}

export function planContainsFiscalYear(
  plan: { startFiscalYear: number; endFiscalYear: number },
  fiscalYear: number,
): boolean {
  return fiscalYear >= plan.startFiscalYear && fiscalYear <= plan.endFiscalYear;
}

const CODE_PREFIXES = {
  SI: 'SI',
  program: 'PRG',
  project: 'PRJ',
} as const;

export type EntityCodeKind = keyof typeof CODE_PREFIXES;

/** Human-readable codes, e.g. `PRJ-2027-001` (charter §11 Q9 / data-model conventions). */
export function formatEntityCode(kind: EntityCodeKind, fiscalYear: number, sequence: number): string {
  assertFiscalYear(fiscalYear);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new PlanError('sequence must be a positive integer');
  }
  return `${CODE_PREFIXES[kind]}-${fiscalYear}-${String(sequence).padStart(3, '0')}`;
}

export interface EnvelopeCheck {
  consumed: Rupiah;
  remaining: Rupiah;
  over: boolean;
}

/**
 * BR-2: prior program budget consumed plus cumulative program budgets may not
 * exceed the five-year SI envelope. Exceeding is flagged, never blocked.
 */
export function envelopeCheck(input: {
  envelopeAmount: Rupiah;
  priorProgramBudgetUsed: Rupiah;
  programBudgets: readonly Rupiah[];
}): EnvelopeCheck {
  const consumed = assertRupiah(input.priorProgramBudgetUsed) + sumRupiah(input.programBudgets);
  const remaining = assertRupiah(input.envelopeAmount) - consumed;
  return { consumed, remaining, over: remaining < 0 };
}

export interface ProgramAvailability {
  capexAvailable: Rupiah;
  opexAvailable: Rupiah;
}

/** Program money available for allocation: budget + carry-in, per component (BR-7). */
export function programAvailability(program: {
  capexBudget: Rupiah;
  opexBudget: Rupiah;
  carryInCapex: Rupiah;
  carryInOpex: Rupiah;
}): ProgramAvailability {
  return {
    capexAvailable: assertRupiah(program.capexBudget) + assertRupiah(program.carryInCapex),
    opexAvailable: assertRupiah(program.opexBudget) + assertRupiah(program.carryInOpex),
  };
}

export interface PricingFlags {
  overApprovedBudget: boolean;
  overSubmittedPrice: boolean;
}

/**
 * BR-9 / BR-18: pricing flags. A missing figure produces no flag; the flag
 * compares only known figures.
 */
export function pricingFlags(input: {
  approvedBudget: Rupiah | null;
  submittedPrice: Rupiah | null;
  finalDealPrice: Rupiah | null;
}): PricingFlags {
  const { approvedBudget, submittedPrice, finalDealPrice } = input;
  return {
    overApprovedBudget:
      approvedBudget !== null && finalDealPrice !== null && finalDealPrice > approvedBudget,
    overSubmittedPrice:
      submittedPrice !== null && finalDealPrice !== null && finalDealPrice > submittedPrice,
  };
}
