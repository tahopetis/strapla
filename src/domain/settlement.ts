import { assertRupiah, type Rupiah } from './money';

/**
 * Settlement rules (charter §6.5, ADR-0003 §3/§4). Pure functions used by the
 * execution screens, the remaining computation and the reports.
 */

export class SettlementError extends Error {}

export type CommitmentStatus = 'open' | 'partially_settled' | 'settled';
export type SettlementKind = 'current' | 'prior_year_opening';

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

export interface SpendSettlementInfo {
  amount: Rupiah;
  settlementKind: SettlementKind;
  /** Amount of this spend that settled commitments from earlier fiscal years. */
  crossYearSettled: Rupiah;
  /** True when the spend pays commitments that predate the app (opening committed). */
  priorYearOpening: boolean;
}

/**
 * Current-year spend for the remaining formula and BR-11: current-year entries
 * count, cross-year settlement portions and prior-year opening payments do not.
 */
export function currentYearSpend(spends: SpendSettlementInfo[]): Rupiah {
  let total = 0;
  for (const spend of spends) {
    if (spend.settlementKind !== 'current' || spend.priorYearOpening) continue;
    const crossYear = assertRupiah(spend.crossYearSettled);
    const amount = assertRupiah(spend.amount);
    if (crossYear > amount) {
      throw new SettlementError('cross-year settlement exceeds the spend amount');
    }
    total += amount - crossYear;
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
