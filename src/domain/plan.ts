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

export interface EnvelopeComponentCheck {
  /** The component's five-year ceiling. */
  envelope: Rupiah;
  /** Program budget already consumed before the first in-app fiscal year. */
  prior: Rupiah;
  /** Sum of the component's effective in-app program budgets. */
  programs: Rupiah;
  /** prior + programs. Carry-in is deliberately absent (ADR-0006 §5). */
  consumed: Rupiah;
  remaining: Rupiah;
  over: boolean;
}

export interface EnvelopeCheck {
  capex: EnvelopeComponentCheck;
  opex: EnvelopeComponentCheck;
  /** Either component is over its envelope; the flag never blocks (BR-17). */
  over: boolean;
}

/**
 * BR-2 for one component: prior program budget consumed plus the cumulative
 * program budgets may not exceed the component's five-year envelope. Exceeding
 * is flagged, never blocked. Carry-in is not part of the check: it was already
 * counted in the source year's program budget (ADR-0006 §5).
 */
export function envelopeComponentCheck(input: {
  envelope: Rupiah;
  prior: Rupiah;
  programBudgets: readonly Rupiah[];
}): EnvelopeComponentCheck {
  const envelope = assertRupiah(input.envelope);
  const prior = assertRupiah(input.prior);
  const programs = sumRupiah(input.programBudgets);
  const consumed = prior + programs;
  const remaining = envelope - consumed;
  return { envelope, prior, programs, consumed, remaining, over: remaining < 0 };
}

/**
 * The SI envelope and the BR-2 check are held per component (ADR-0006 §5):
 * capex and opex never share headroom, so an overrun in one component leaves
 * the other's remaining headroom untouched.
 */
export function envelopeCheck(input: {
  envelopeCapex: Rupiah;
  envelopeOpex: Rupiah;
  priorCapex: Rupiah;
  priorOpex: Rupiah;
  programCapex: readonly Rupiah[];
  programOpex: readonly Rupiah[];
}): EnvelopeCheck {
  const capex = envelopeComponentCheck({
    envelope: input.envelopeCapex,
    prior: input.priorCapex,
    programBudgets: input.programCapex,
  });
  const opex = envelopeComponentCheck({
    envelope: input.envelopeOpex,
    prior: input.priorOpex,
    programBudgets: input.programOpex,
  });
  return { capex, opex, over: capex.over || opex.over };
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

/**
 * Project years must sit inside the strategic plan horizon (BR-1/BR-5) and a
 * project spans at most ten fiscal years.
 */
export function validateProjectYears(input: {
  startFiscalYear: number;
  endFiscalYear: number;
  horizon: { startFiscalYear: number; endFiscalYear: number };
}): string | null {
  try {
    assertFiscalYear(input.startFiscalYear, 'start fiscal year');
    assertFiscalYear(input.endFiscalYear, 'end fiscal year');
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid project years';
  }
  if (input.endFiscalYear < input.startFiscalYear) {
    return 'The project end fiscal year must not be before its start.';
  }
  if (input.endFiscalYear - input.startFiscalYear + 1 > 10) {
    return 'A project can span at most 10 fiscal years.';
  }
  if (
    input.startFiscalYear < input.horizon.startFiscalYear ||
    input.endFiscalYear > input.horizon.endFiscalYear
  ) {
    return `The project years must be inside the strategic plan horizon (${input.horizon.startFiscalYear}–${input.horizon.endFiscalYear}).`;
  }
  return null;
}
