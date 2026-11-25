import { describe, expect, it } from 'vitest';
import {
  NO_DELTAS,
  applyDeltas,
  effectiveBudget,
  formatRevisionNumber,
  isComponentShift,
  programNet,
  sumByComponent,
  validateRevisionFloor,
  validateRevisionLines,
  type RevisionLine,
} from './revisions';

/**
 * Budget revisions (ADR-0006 §4, #112). The tests read like the register's
 * arithmetic: a program's effective budget is its initial budget plus every
 * posted delta, per component, because capex and opex never offset each other.
 */

describe('effectiveBudget', () => {
  it('returns the initial budget when nothing has been revised', () => {
    expect(effectiveBudget({ capex: 1_000_000, opex: 250_000 }, [])).toEqual({
      capex: 1_000_000,
      opex: 250_000,
    });
  });

  it('adds the deltas to their own component only', () => {
    expect(
      effectiveBudget({ capex: 1_000_000, opex: 250_000 }, [
        { component: 'capex', delta: 200_000 },
        { component: 'capex', delta: -50_000 },
        { component: 'opex', delta: -100_000 },
      ]),
    ).toEqual({ capex: 1_150_000, opex: 150_000 });
  });
});

describe('line sums', () => {
  const LINES: RevisionLine[] = [
    { entityType: 'program', entityId: 'p1', component: 'capex', delta: 100 },
    { entityType: 'program', entityId: 'p2', component: 'capex', delta: -100 },
    { entityType: 'program', entityId: 'p1', component: 'opex', delta: -30 },
    { entityType: 'allocation', entityId: 'a1', component: 'capex', delta: -40 },
  ];

  it('sums every line into its component', () => {
    expect(sumByComponent(LINES)).toEqual({ capex: -40, opex: -30 });
  });

  it('nets one program across both components', () => {
    expect(programNet(LINES, 'p1')).toEqual({ capex: 100, opex: -30 });
    expect(programNet(LINES, 'missing')).toEqual({ capex: 0, opex: 0 });
  });
});

describe('formatRevisionNumber', () => {
  it('renders the per-plan sequence with the fiscal year', () => {
    expect(formatRevisionNumber(2027, 1)).toBe('REV-2027-001');
    expect(formatRevisionNumber(2027, 12)).toBe('REV-2027-012');
    expect(formatRevisionNumber(2027, 1_234)).toBe('REV-2027-1234');
  });
});

describe('validateRevisionLines', () => {
  const program = (entityId: string, component: 'capex' | 'opex', delta: number): RevisionLine => ({
    entityType: 'program',
    entityId,
    component,
    delta,
  });
  const allocation = (entityId: string, component: 'capex' | 'opex', delta: number): RevisionLine => ({
    entityType: 'allocation',
    entityId,
    component,
    delta,
  });

  it('refuses a revision without lines', () => {
    const issues = validateRevisionLines([]);
    expect(issues.map((issue) => issue.code)).toEqual(['empty']);
    expect(issues[0]?.message).toMatch(/at least one/i);
  });

  it('accepts a balanced switch within one component', () => {
    expect(
      validateRevisionLines([program('p1', 'capex', -400), program('p2', 'capex', 400)]),
    ).toEqual([]);
  });

  it('accepts a pure cut or a pure addition', () => {
    expect(validateRevisionLines([program('p1', 'capex', -400), program('p2', 'capex', -100)]))
      .toEqual([]);
    expect(validateRevisionLines([program('p1', 'capex', 400), program('p2', 'capex', 100)]))
      .toEqual([]);
  });

  it('refuses mixed signs that do not balance', () => {
    const issues = validateRevisionLines([
      program('p1', 'capex', -400),
      program('p2', 'capex', 250),
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(['mixed_signs']);
    expect(issues[0]?.message).toMatch(/balance/i);
    expect(issues[0]?.lineIndexes).toEqual([0, 1]);
  });

  it('refuses a capex/opex shift disguised as a cut plus an addition', () => {
    const issues = validateRevisionLines([
      program('p1', 'capex', -400),
      program('p2', 'opex', 400),
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(['component_shift']);
    expect(issues[0]?.message).toMatch(/capex and opex/i);
  });

  it('accepts a de-allocation line only when it is negative', () => {
    expect(validateRevisionLines([allocation('a1', 'capex', -400)])).toEqual([]);

    const issues = validateRevisionLines([allocation('a1', 'capex', 400)]);
    expect(issues.map((issue) => issue.code)).toEqual(['allocation_not_negative']);
    expect(issues[0]?.message).toMatch(/de-allocat/i);
    expect(issues[0]?.lineIndexes).toEqual([0]);
  });

  it('refuses two lines for the same entity and component', () => {
    const issues = validateRevisionLines([
      program('p1', 'capex', -400),
      program('p2', 'capex', 400),
      program('p1', 'capex', -50),
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(['duplicate_line']);
    expect(issues[0]?.lineIndexes).toEqual([0, 2]);
  });
});

describe('validateRevisionFloor', () => {
  const program = (entityId: string, component: 'capex' | 'opex', delta: number): RevisionLine => ({
    entityType: 'program',
    entityId,
    component,
    delta,
  });
  const deallocate = (entityId: string, component: 'capex' | 'opex', delta: number): RevisionLine => ({
    entityType: 'allocation',
    entityId,
    component,
    delta,
  });

  /** PRG-A is fully allocated; PRG-B has nothing yet. */
  function context(overrides: {
    allocatedCapex?: number;
    capexBudget?: number;
    allocationCapex?: number;
    openCommitmentsCapex?: number;
    spendCapex?: number;
  } = {}) {
    return {
      programs: [
        {
          programId: 'p-a',
          code: 'PRG-A',
          name: 'Programme A',
          capexBudget: overrides.capexBudget ?? 1_000_000,
          opexBudget: 0,
          carryInCapex: 0,
          carryInOpex: 0,
          allocatedCapex: overrides.allocatedCapex ?? 1_000_000,
          allocatedOpex: 0,
        },
        {
          programId: 'p-b',
          code: 'PRG-B',
          name: 'Programme B',
          capexBudget: 0,
          opexBudget: 0,
          carryInCapex: 0,
          carryInOpex: 0,
          allocatedCapex: 0,
          allocatedOpex: 0,
        },
      ],
      allocations: [
        {
          allocationId: 'alloc-1',
          programId: 'p-a',
          label: 'PRJ-2027-001 · capex',
          capexAmount: overrides.allocationCapex ?? 1_000_000,
          opexAmount: 0,
          openCommitmentsCapex: overrides.openCommitmentsCapex ?? 200_000,
          openCommitmentsOpex: 0,
          spendCapex: overrides.spendCapex ?? 100_000,
          spendOpex: 0,
        },
      ],
    };
  }

  it('refuses a switch that needs more unallocated budget than the donor has', () => {
    const issues = validateRevisionFloor({
      lines: [program('p-a', 'capex', -400_000), program('p-b', 'capex', 400_000)],
      ...context(),
    });
    expect(issues.map((issue) => issue.code)).toEqual(['switch_floor']);
    expect(issues[0]?.message).toMatch(/PRG-A/);
    expect(issues[0]?.message).toMatch(/unallocated/);
  });

  it('accepts the same switch once an allocation is de-allocated', () => {
    const issues = validateRevisionFloor({
      lines: [
        program('p-a', 'capex', -400_000),
        program('p-b', 'capex', 400_000),
        deallocate('alloc-1', 'capex', -400_000),
      ],
      ...context(),
    });
    expect(issues).toEqual([]);
  });

  it('accepts a switch covered by the donor program unallocated budget', () => {
    const issues = validateRevisionFloor({
      lines: [program('p-a', 'capex', -400_000), program('p-b', 'capex', 400_000)],
      ...context({ allocatedCapex: 400_000 }),
    });
    expect(issues).toEqual([]);
  });

  it('refuses a de-allocation below open commitments plus current-year spend', () => {
    const issues = validateRevisionFloor({
      lines: [
        program('p-a', 'capex', -800_000),
        program('p-b', 'capex', 800_000),
        deallocate('alloc-1', 'capex', -800_000),
      ],
      ...context(),
    });
    expect(issues.map((issue) => issue.code)).toEqual(['deallocation_below_floor']);
    expect(issues[0]?.message).toMatch(/PRJ-2027-001/);
    expect(issues[0]?.message).toMatch(/open commitments/);
  });

  it('refuses a budget that would fall below zero', () => {
    const issues = validateRevisionFloor({
      lines: [program('p-a', 'capex', -2_000_000)],
      ...context(),
    });
    expect(issues.map((issue) => issue.code)).toEqual(['negative_budget']);
    expect(issues[0]?.message).toMatch(/below zero/);
  });

  it('lets a pure cut over-allocate: over-allocation is a flag, never a refusal', () => {
    const issues = validateRevisionFloor({
      lines: [program('p-a', 'capex', -400_000)],
      ...context(),
    });
    expect(issues).toEqual([]);
  });
});

describe('applyDeltas', () => {
  it('adds a per-component delta pair, including a cut below the initial amount', () => {
    expect(applyDeltas({ capex: 1_000, opex: 500 }, { capex: -300, opex: 200 })).toEqual({
      capex: 700,
      opex: 700,
    });
  });

  it('leaves the initial amounts alone when nothing changed', () => {
    expect(applyDeltas({ capex: 1_000, opex: 500 }, NO_DELTAS)).toEqual({ capex: 1_000, opex: 500 });
  });
});

describe('isComponentShift', () => {
  it('flags a change that lowers one component while raising the other', () => {
    expect(
      isComponentShift(
        { capex: 1_000_000, opex: 200_000 },
        { capex: 900_000, opex: 300_000 },
      ),
    ).toBe(true);
    expect(
      isComponentShift(
        { capex: 1_000_000, opex: 200_000 },
        { capex: 1_100_000, opex: 100_000 },
      ),
    ).toBe(true);
  });

  it('does not flag changes within one component or no change', () => {
    expect(
      isComponentShift(
        { capex: 1_000_000, opex: 200_000 },
        { capex: 1_100_000, opex: 200_000 },
      ),
    ).toBe(false);
    expect(
      isComponentShift(
        { capex: 1_000_000, opex: 200_000 },
        { capex: 900_000, opex: 200_000 },
      ),
    ).toBe(false);
    expect(
      isComponentShift(
        { capex: 1_000_000, opex: 200_000 },
        { capex: 1_000_000, opex: 200_000 },
      ),
    ).toBe(false);
  });
});
