import { describe, expect, it } from 'vitest';
import { programMoneyLine } from './program-money-line';

/**
 * The program money line identity (ADR-0006 §6, #115 acceptance):
 *
 *   initial + Σ revisions + carry-in = available
 *
 * and the two warning states (over-allocated, unfunded) are derived, never
 * stored. These are pure tests: no database, no page.
 */
describe('programMoneyLine (ADR-0006 §6)', () => {
  const base = {
    initial: { capex: 1_000, opex: 400 },
    revisions: { capex: 150, opex: -50 },
    carryIn: { capex: 300, opex: 100 },
    allocated: { capex: 800, opex: 0 },
    openCommitments: { capex: 500, opex: 0 },
    currentYearSpend: { capex: 100, opex: 0 },
  };

  it('reconciles initial + revisions + carry-in = available, per component', () => {
    const line = programMoneyLine(base);

    // initial + Σ revisions + carry-in = available (the acceptance identity).
    expect(line.capex.initial + line.capex.revision + line.capex.carryIn).toBe(
      line.capex.available,
    );
    expect(line.opex.initial + line.opex.revision + line.opex.carryIn).toBe(line.opex.available);
    expect(line.capex.effective).toBe(1_150);
    expect(line.capex.available).toBe(1_450);
    expect(line.opex.effective).toBe(350);
    expect(line.opex.available).toBe(450);
  });

  it('computes remaining as available − open commitments − current-year spend', () => {
    const line = programMoneyLine(base);

    expect(line.capex.remaining).toBe(1_450 - 500 - 100);
    expect(line.opex.remaining).toBe(450);
    expect(line.capex.overAllocated).toBe(false);
    expect(line.capex.unfunded).toBe(false);
    expect(line.opex.overAllocated).toBe(false);
    expect(line.opex.unfunded).toBe(false);
  });

  it('flags over-allocated when allocations exceed available money', () => {
    const line = programMoneyLine({
      ...base,
      allocated: { capex: 1_500, opex: 0 },
    });

    expect(line.capex.overAllocated).toBe(true);
    expect(line.capex.unfunded).toBe(false);
    expect(line.opex.overAllocated).toBe(false);
  });

  it('flags unfunded when a cut leaves remaining below zero, without blocking', () => {
    const line = programMoneyLine({
      ...base,
      revisions: { capex: -800, opex: 0 },
      openCommitments: { capex: 700, opex: 0 },
      currentYearSpend: { capex: 0, opex: 0 },
    });

    // capex available = 1.000 − 800 + 300 = 500; open commitments 700.
    expect(line.capex.available).toBe(500);
    expect(line.capex.remaining).toBe(-200);
    expect(line.capex.unfunded).toBe(true);
    // The cut is a flag, never a block: the line is still returned in full.
    expect(line.capex.effective).toBe(200);
    expect(line.opex.remaining).toBe(500);
  });

  it('keeps capex and opex independent: one component can be over without touching the other', () => {
    const line = programMoneyLine({
      ...base,
      allocated: { capex: 9_999, opex: 450 },
    });

    expect(line.capex.overAllocated).toBe(true);
    expect(line.capex.unfunded).toBe(false);
    expect(line.opex.overAllocated).toBe(false);
    expect(line.opex.remaining).toBe(450);
  });
});
