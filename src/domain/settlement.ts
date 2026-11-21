import { assertRupiah, type Rupiah } from './money';

/**
 * Settlement rules (charter §6.5, ADR-0003 §3/§4, §4a). Pure functions used by
 * the execution screens, the remaining computation and the reports.
 */

export class SettlementError extends Error {}

export type CommitmentStatus = 'open' | 'partially_settled' | 'settled';
export type SettlementKind = 'current' | 'prior_year_opening';

/**
 * The treatment chosen per transaction for the part of a spend that settles a
 * commitment from a closed annual plan (issue #98, ADR-0003 §4a).
 *
 * - `charge_current_year`: the closed-year portion counts as current-year spend
 *   and reduces the current year's remaining.
 * - `charge_closed_year_reserve`: the closed-year portion stays in the closed
 *   year — excluded from the current year's remaining, reported as a prior-year
 *   settlement and as a post-close reserve on the closed year's report.
 *
 * Splits against open-year commitments are always current-year, so the
 * treatment is `null` when no closed-year split is in play.
 */
export type PostCloseTreatment = 'charge_current_year' | 'charge_closed_year_reserve';

export function openCommitmentAmount(input: {
  amount: Rupiah;
  settledAmount: Rupiah;
}): Rupiah {
  const open = assertRupiah(input.amount) - assertRupiah(input.settledAmount);
  if (open < 0) {
    throw new SettlementError('settled amount exceeds the commitment amount');
  }
  return open;
}

export function commitmentStatus(input: {
  amount: Rupiah;
  settledAmount: Rupiah;
}): CommitmentStatus {
  const open = openCommitmentAmount(input);
  if (open === 0) return 'settled';
  if (assertRupiah(input.settledAmount) > 0) return 'partially_settled';
  return 'open';
}

export interface SettlementSplit {
  commitmentId: string;
  amount: Rupiah;
  commitmentAmount: Rupiah;
  alreadySettled: Rupiah;
}

/**
 * A spend entry may settle several commitments; each split may not exceed the
 * commitment's open amount and the splits may not exceed the spend amount.
 */
export function validateSettlementSplits(input: {
  spendAmount: Rupiah;
  splits: SettlementSplit[];
}): void {
  const spendAmount = assertRupiah(input.spendAmount);
  const seen = new Set<string>();
  let total = 0;

  for (const split of input.splits) {
    if (!split.commitmentId) throw new SettlementError('a settlement split needs a commitment');
    if (seen.has(split.commitmentId)) {
      throw new SettlementError('the same commitment cannot be settled twice in one spend entry');
    }
    seen.add(split.commitmentId);
    const amount = assertRupiah(split.amount);
    if (amount === 0) throw new SettlementError('a settlement amount must be positive');
    const open = openCommitmentAmount({
      amount: split.commitmentAmount,
      settledAmount: split.alreadySettled,
    });
    if (amount > open) {
      throw new SettlementError('a settlement cannot exceed the open commitment amount');
    }
    total += amount;
    if (!Number.isSafeInteger(total)) throw new SettlementError('settlement total is unsafe');
  }

  if (total > spendAmount) {
    throw new SettlementError('settlements cannot exceed the spend amount');
  }
}

/** A settlement is cross-year when it pays a commitment from an earlier fiscal year. */
export function isCrossYearSettlement(input: {
  commitmentFiscalYear: number;
  spendFiscalYear: number;
  settlementKind: SettlementKind;
}): boolean {
  return (
    input.settlementKind === 'current' && input.commitmentFiscalYear < input.spendFiscalYear
  );
}

/**
 * Resolves the treatment stored on a spend entry from the splits it carries.
 *
 * The treatment is relevant only when at least one split settles a commitment
 * from a closed annual plan; without one it must stay empty, so that an
 * open-year transaction can never claim a closed-year treatment. When relevant
 * and unchosen, the default is charging the closed-year portion to the current
 * year (ADR-0003 §4a).
 */
export function postCloseTreatmentFor(input: {
  /** Sum of the splits that settle commitments from closed annual plans. */
  closedYearSettled: Rupiah;
  /** The treatment submitted with the transaction, if any. */
  requested: PostCloseTreatment | null | undefined;
}): PostCloseTreatment | null {
  const closedYear = assertRupiah(input.closedYearSettled);
  const requested = input.requested ?? null;
  if (closedYear === 0) {
    if (requested !== null) {
      throw new SettlementError(
        'A post-close treatment only applies when the payment settles a commitment from a closed fiscal year.',
      );
    }
    return null;
  }
  if (requested === null) return 'charge_current_year';
  if (requested !== 'charge_current_year' && requested !== 'charge_closed_year_reserve') {
    throw new SettlementError('the post-close treatment is not recognised');
  }
  return requested;
}

export interface SpendSettlementInfo {
  amount: Rupiah;
  settlementKind: SettlementKind;
  /** Amount of this spend that settled commitments from earlier fiscal years. */
  crossYearSettled: Rupiah;
  /** Portion of `crossYearSettled` that settled commitments from closed annual plans. */
  closedYearSettled?: Rupiah;
  /** The stored treatment; null when no closed-year split is in play. */
  postCloseTreatment?: PostCloseTreatment | null;
  /** True when the spend pays commitments that predate the app (opening committed). */
  priorYearOpening: boolean;
}

/** How much of an earlier-year settlement is excluded from the current year. */
export function crossYearExcluded(spend: SpendSettlementInfo): Rupiah {
  const amount = assertRupiah(spend.amount);
  const crossYear = assertRupiah(spend.crossYearSettled);
  const closedYear = assertRupiah(spend.closedYearSettled ?? 0);
  if (crossYear > amount) {
    throw new SettlementError('cross-year settlement exceeds the spend amount');
  }
  if (closedYear > crossYear) {
    throw new SettlementError('closed-year settlement exceeds the cross-year settlement');
  }
  // A closed-year portion charged to the current year is not cross-year money
  // any more; every other earlier-year portion stays excluded.
  if (spend.postCloseTreatment === 'charge_current_year') return crossYear - closedYear;
  return crossYear;
}

/** The part of a spend that stays in the closed year as a post-close reserve. */
export function closedYearReserve(spend: SpendSettlementInfo): Rupiah {
  if (spend.postCloseTreatment !== 'charge_closed_year_reserve') return 0;
  return assertRupiah(spend.closedYearSettled ?? 0);
}

/** The part of a spend charged to the current year although it settles a closed year. */
export function closedYearChargedToCurrentYear(spend: SpendSettlementInfo): Rupiah {
  if (spend.postCloseTreatment !== 'charge_current_year') return 0;
  return assertRupiah(spend.closedYearSettled ?? 0);
}

/**
 * True when one settlement portion is excluded from the current year: an
 * ordinary cross-year settlement, or a closed-year settlement kept as a
 * reserve. A closed-year portion charged to the current year is not excluded,
 * and prior-year opening payments are handled by their own classification.
 */
export function settlementPortionIsCrossYear(input: {
  commitmentFiscalYear: number;
  spendFiscalYear: number;
  settlementKind: SettlementKind;
  commitmentPlanClosed: boolean;
  postCloseTreatment: PostCloseTreatment | null;
}): boolean {
  if (input.settlementKind !== 'current') return false;
  if (input.commitmentFiscalYear >= input.spendFiscalYear) return false;
  if (input.commitmentPlanClosed) return input.postCloseTreatment !== 'charge_current_year';
  return true;
}

/**
 * Current-year spend for the remaining formula and BR-11: current-year entries
 * count, cross-year settlement portions and prior-year opening payments do not.
 * A closed-year portion charged to the current year does count.
 */
export function currentYearSpend(spends: SpendSettlementInfo[]): Rupiah {
  let total = 0;
  for (const spend of spends) {
    if (spend.settlementKind !== 'current' || spend.priorYearOpening) continue;
    total += assertRupiah(spend.amount) - crossYearExcluded(spend);
    if (!Number.isSafeInteger(total)) throw new SettlementError('current-year spend is unsafe');
  }
  return total;
}

/** BR-11: current-year spend above the allocation's commitment total warns, never blocks. */
export function spendExceedsFiscalYearCommitment(input: {
  currentYearSpend: Rupiah;
  fiscalYearCommitments: Rupiah;
}): boolean {
  return assertRupiah(input.currentYearSpend) > assertRupiah(input.fiscalYearCommitments);
}
