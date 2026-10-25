/**
 * Money primitives. Every monetary value in Strapla is a whole Rupiah integer.
 * This module is framework-free and is the only place allowed to do money
 * arithmetic — see ADR-0003 and docs/data-model.md.
 */

export type Rupiah = number;

export class MoneyError extends Error {}

export function assertRupiah(value: number, label = 'amount'): Rupiah {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole-Rupiah safe integer (got ${value})`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative (got ${value})`);
  }
  return value;
}

/** Sum a list of Rupiah amounts, rejecting unsafe or negative input. */
export function sumRupiah(values: readonly Rupiah[]): Rupiah {
  let total = 0;
  for (const value of values) {
    total += assertRupiah(value);
    assertRupiah(total, 'total');
  }
  return total;
}

/** Display: "Rp 1.234.567". Grouping is done manually so the output does not depend on the host ICU locale data. */
export function formatRupiah(value: Rupiah): string {
  assertRupiah(value);
  const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${grouped}`;
}

/** Parse user input such as "1.234.567", "1234567" or "Rp 1 234 567" into whole Rupiah. */
export function parseRupiah(input: string): Rupiah {
  const cleaned = input
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replace(/[\s.]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    throw new MoneyError(`not a valid Rupiah amount: ${input}`);
  }
  return assertRupiah(Number.parseInt(cleaned, 10));
}

/** Remaining budget per component (ADR-0003 §3, INV-6). */
export function remaining(input: {
  allocation: Rupiah;
  carryIn: Rupiah;
  openCommitments: Rupiah;
  currentYearSpend: Rupiah;
}): Rupiah {
  const value =
    assertRupiah(input.allocation) +
    assertRupiah(input.carryIn) -
    assertRupiah(input.openCommitments) -
    assertRupiah(input.currentYearSpend);
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError('remaining is outside the safe integer range');
  }
  return value;
}

/** Program unallocated budget per component (charter BR-7). */
export function unallocatedBudget(input: {
  budget: Rupiah;
  carryIn: Rupiah;
  allocated: Rupiah;
}): Rupiah {
  return (
    assertRupiah(input.budget) + assertRupiah(input.carryIn) - assertRupiah(input.allocated)
  );
}
