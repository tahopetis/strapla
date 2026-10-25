import type { Rupiah } from './money';

/**
 * Year close and carry-over rules (charter §6.7, ADR-0003 §7). Open commitments
 * are not carry-over: only remaining budget and unallocated program budget can
 * be carried, per component, with an approval reference.
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
    total[entry.component] += amount;
  }
  return total;
}

/**
 * The next fiscal year's plan is the only valid close target. Closing is blocked
 * when it does not exist, which keeps the carry-over figures from being lost.
 */
export function nextFiscalYear(current: number): number {
  return current + 1;
}
