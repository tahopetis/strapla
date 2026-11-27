import type { Rupiah } from './money';

/**
 * Year close and carry-over rules (charter §6.7, ADR-0003 §7). Open commitments
 * are not carry-over: only remaining budget and unallocated program budget can
 * be carried, per component, with an approval reference.
 *
 * Closing is irreversible, so the form requires a typed confirmation phrase and
 * an explicit amount for every carry-over field (0 for none) — a blank submit is
 * not a valid zero carry-over (W4a).
 */

export class CloseError extends Error {}

function safeRupiah(value: number, label: string): Rupiah {
  if (!Number.isSafeInteger(value)) {
    throw new CloseError(`${label} must be whole Rupiah numbers.`);
  }
  return value;
}

/** Carry-over candidates are the positive remaining amounts only. */
export function carryOverCandidate(remaining: Rupiah): Rupiah {
  const value = safeRupiah(remaining, 'carry-over amounts');
  return value > 0 ? value : 0;
}

export function validateCarryOverAmount(input: {
  amount: Rupiah;
  available: Rupiah;
  label: string;
}): void {
  const amount = safeRupiah(input.amount, input.label);
  if (amount < 0) {
    throw new CloseError(`${input.label} cannot be negative.`);
  }
  const available = carryOverCandidate(input.available);
  if (amount > available) {
    throw new CloseError(`${input.label} cannot exceed the available ${available} Rupiah.`);
  }
}

export interface CarryOverTotal {
  capex: number;
  opex: number;
}

export function totalCarryOver(
  entries: Array<{ component: 'capex' | 'opex'; amount: number }>,
): CarryOverTotal {
  const total: CarryOverTotal = { capex: 0, opex: 0 };
  for (const entry of entries) {
    const amount = safeRupiah(entry.amount, 'carry-over amounts');
    if (amount < 0) throw new CloseError('carry-over amounts cannot be negative');
    total[entry.component] = safeRupiah(
      total[entry.component] + amount,
      'carry-over total',
    );
  }
  return total;
}

/** The exact phrase the owner must type to confirm the close. */
export function closeConfirmationPhrase(fiscalYear: number): string {
  return `CLOSE FY${fiscalYear}`;
}

/** The typed confirmation is compared exactly: no trimming, no case folding. */
export function assertCloseConfirmation(confirmation: string, fiscalYear: number): void {
  const expected = closeConfirmationPhrase(fiscalYear);
  if (confirmation !== expected) {
    throw new CloseError(`Type "${expected}" exactly to confirm the close.`);
  }
}

export interface CarryOverTotalsByEntity {
  program: CarryOverTotal;
  allocation: CarryOverTotal;
}

export interface CarryOverAmount {
  entityType: 'program' | 'allocation';
  component: 'capex' | 'opex';
  amount: Rupiah;
}

/** Totals of the carry-over amounts entered, split by entity and component. */
export function carryOverTotals(entries: readonly CarryOverAmount[]): CarryOverTotalsByEntity {
  return {
    program: totalCarryOver(entries.filter((entry) => entry.entityType === 'program')),
    allocation: totalCarryOver(entries.filter((entry) => entry.entityType === 'allocation')),
  };
}

/**
 * The next fiscal year's plan is the only valid close target. Closing is blocked
 * when it does not exist, which keeps the carry-over figures from being lost.
 */
export function nextFiscalYear(current: number): number {
  return current + 1;
}

/**
 * The final close (#109, ADR-0008 §3): the annual plan in the strategic plan's
 * end year has no next year inside the horizon, so it closes with no target and
 * nothing carried across the plan boundary. A year beyond the end year is
 * treated as final too — it has no inside-horizon target either.
 */
export function isFinalCloseYear(annualPlanFiscalYear: number, planEndFiscalYear: number): boolean {
  return annualPlanFiscalYear >= planEndFiscalYear;
}
