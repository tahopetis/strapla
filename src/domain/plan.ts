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

/**
 * Strategic plan succession (#109, ADR-0008). A deployment runs one plan at a
 * time: a successor may only be created once the previous plan is archived, and
 * its horizon must start after every archived horizon ends, so no fiscal year is
 * ever owned by two plans.
 */

/** A plan as the succession rules need it: name, horizon and lifecycle status. */
export interface PlanBoundaryRow {
  name: string;
  startFiscalYear: number;
  endFiscalYear: number;
  status: 'draft' | 'active' | 'archived';
}

/** The end year of the latest horizon, or null when there is no plan at all. */
export function latestPlanEndYear(plans: readonly { endFiscalYear: number }[]): number | null {
  let latest: number | null = null;
  for (const plan of plans) {
    if (latest === null || plan.endFiscalYear > latest) latest = plan.endFiscalYear;
  }
  return latest;
}

/**
 * A successor plan must start after every archived plan's end year. Returns the
 * refusal message (naming the binding archived plan) or null when the start year
 * is acceptable.
 */
export function successorStartYearError(
  startFiscalYear: number,
  existing: readonly PlanBoundaryRow[],
): string | null {
  const archived = existing.filter((plan) => plan.status === 'archived');
  if (archived.length === 0) return null;
  let latest = archived[0]!;
  for (const plan of archived) {
    if (plan.endFiscalYear > latest.endFiscalYear) latest = plan;
  }
  if (startFiscalYear > latest.endFiscalYear) return null;
  return `The successor plan must start after FY${latest.endFiscalYear}, the end of “${latest.name}”.`;
}

/**
 * A strategic plan can only be archived once every annual plan under it is
 * closed (#109): an open annual plan would otherwise freeze uncloseable, with no
 * carry decision ever recorded. Returns the refusal message naming the first open
 * year, or null when archiving is allowed.
 */
export function archivePreconditionError(
  annualPlans: readonly { fiscalYear: number; status: 'draft' | 'active' | 'closed' }[],
): string | null {
  const open = annualPlans
    .filter((plan) => plan.status !== 'closed')
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  const first = open[0];
  if (!first) return null;
  return `Every annual plan must be closed before the strategic plan is archived: FY${first.fiscalYear} is still ${first.status}.`;
}

/**
 * A plan horizon edit must contain every annual plan year and every project's
 * full-life years (BR-1/BR-5). Shrinking a horizon that would orphan either is
 * refused and the offending record is named, so ending a plan early is an
 * explicit final close, not an orphaning (#109, ADR-0008).
 */
export function horizonContainmentError(
  horizon: { startFiscalYear: number; endFiscalYear: number },
  annualPlanYears: readonly number[],
  projects: readonly { code: string; startFiscalYear: number; endFiscalYear: number }[],
): string | null {
  const outsideYears = [...new Set(annualPlanYears)]
    .filter((year) => year < horizon.startFiscalYear || year > horizon.endFiscalYear)
    .sort((a, b) => a - b);
  const firstYear = outsideYears[0];
  if (firstYear !== undefined) {
    return `The new horizon excludes the FY${firstYear} annual plan. An annual plan must stay inside the plan horizon.`;
  }
  const outsideProject = projects.find(
    (project) =>
      project.startFiscalYear < horizon.startFiscalYear ||
      project.endFiscalYear > horizon.endFiscalYear,
  );
  if (outsideProject) {
    return `The new horizon excludes project ${outsideProject.code} (FY${outsideProject.startFiscalYear}–FY${outsideProject.endFiscalYear}). A project's full-life years must stay inside the plan horizon.`;
  }
  return null;
}
