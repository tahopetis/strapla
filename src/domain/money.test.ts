import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  assertRupiah,
  formatRupiah,
  formatRupiahSigned,
  parseRupiah,
  remaining,
  sumRupiah,
  unallocatedBudget,
} from './money';

describe('assertRupiah', () => {
  it('accepts whole non-negative safe integers', () => {
    expect(assertRupiah(0)).toBe(0);
    expect(assertRupiah(1_234_567)).toBe(1_234_567);
  });

  it('rejects negatives, fractions, NaN and unsafe integers', () => {
    expect(() => assertRupiah(-1)).toThrow(MoneyError);
    expect(() => assertRupiah(1.5)).toThrow(MoneyError);
    expect(() => assertRupiah(Number.NaN)).toThrow(MoneyError);
    expect(() => assertRupiah(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });
});

describe('sumRupiah', () => {
  it('sums safely', () => {
    expect(sumRupiah([1, 2, 3])).toBe(6);
    expect(sumRupiah([])).toBe(0);
  });

  it('rejects an unsafe running total', () => {
    expect(() => sumRupiah([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });
});

describe('formatRupiah', () => {
  it('formats with Indonesian thousands separators', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(1_234_567)).toBe('Rp 1.234.567');
    expect(formatRupiah(1_000_000_000)).toBe('Rp 1.000.000.000');
  });
});

describe('formatRupiahSigned', () => {
  it('formats negative computed amounts with a leading sign', () => {
    expect(formatRupiahSigned(-100_000_000)).toBe('-Rp 100.000.000');
    expect(formatRupiahSigned(0)).toBe('Rp 0');
    expect(formatRupiahSigned(1_234_567)).toBe('Rp 1.234.567');
  });

  it('rejects unsafe integers', () => {
    expect(() => formatRupiahSigned(1.5)).toThrow(MoneyError);
  });
});

describe('parseRupiah', () => {
  it('parses common input formats', () => {
    expect(parseRupiah('1234567')).toBe(1_234_567);
    expect(parseRupiah('1.234.567')).toBe(1_234_567);
    expect(parseRupiah(' Rp 1 234 567 ')).toBe(1_234_567);
  });

  it('rejects malformed input', () => {
    expect(() => parseRupiah('12,5')).toThrow(MoneyError);
    expect(() => parseRupiah('abc')).toThrow(MoneyError);
    expect(() => parseRupiah('-5')).toThrow(MoneyError);
  });

  it('round-trips with formatRupiah', () => {
    const amount = 987_654_321;
    expect(parseRupiah(formatRupiah(amount))).toBe(amount);
  });
});

describe('remaining (INV-6)', () => {
  it('computes allocation plus carry-in minus open commitments minus spend', () => {
    expect(
      remaining({ allocation: 1_000, carryIn: 200, openCommitments: 300, currentYearSpend: 400 }),
    ).toBe(500);
  });

  it('is unchanged when a same-year commitment is settled', () => {
    const before = remaining({ allocation: 1_000, carryIn: 0, openCommitments: 300, currentYearSpend: 0 });
    const after = remaining({ allocation: 1_000, carryIn: 0, openCommitments: 200, currentYearSpend: 100 });
    expect(after).toBe(before);
  });

  it('does not accept negative or unsafe input', () => {
    expect(() =>
      remaining({ allocation: -1, carryIn: 0, openCommitments: 0, currentYearSpend: 0 }),
    ).toThrow(MoneyError);
  });
});

describe('unallocatedBudget (BR-7)', () => {
  it('computes budget plus carry-in minus allocations', () => {
    expect(unallocatedBudget({ budget: 1_000, carryIn: 200, allocated: 400 })).toBe(800);
  });
});
