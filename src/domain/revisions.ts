import { formatRupiah, formatRupiahSigned, type Rupiah } from './money';

/**
 * Budget revisions (ADR-0006 §4, #112).
 *
 * Once an annual plan is active its program budgets are frozen; a change is an
 * immutable, numbered revision: a header plus signed lines, one component per
 * line. This module is framework-free and holds the arithmetic and the rules
 * that do not need a database. `effectiveBudget` is the one function every
 * screen and report uses: initial budget + Σ posted deltas, per component.
 */

export type RevisionComponent = 'capex' | 'opex';
export type RevisionEntityType = 'program' | 'allocation';

/** One signed delta on a program budget or a project year allocation amount. */
export interface RevisionLine {
  entityType: RevisionEntityType;
  entityId: string;
  component: RevisionComponent;
  /** Signed whole Rupiah; negative is a cut or a de-allocation, never zero. */
  delta: number;
}

/** A capex/opex pair. Components never offset each other. */
export interface ComponentAmounts {
  capex: number;
  opex: number;
}

function safeAdd(total: number, value: number): number {
  const next = total + value;
  if (!Number.isSafeInteger(next)) {
    throw new RangeError('the amount is outside the safe integer range');
  }
  return next;
}

/** Initial budget plus every posted delta, per component (ADR-0006 §4). */
export function effectiveBudget(
  initial: ComponentAmounts,
  deltas: readonly { component: RevisionComponent; delta: number }[],
): ComponentAmounts {
  let capex: Rupiah = initial.capex;
  let opex: Rupiah = initial.opex;
  for (const line of deltas) {
    if (line.component === 'capex') capex = safeAdd(capex, line.delta);
    else opex = safeAdd(opex, line.delta);
  }
  return { capex, opex };
}

/** Every line's delta, per component. */
export function sumByComponent(lines: readonly RevisionLine[]): ComponentAmounts {
  return {
    capex: lines
      .filter((line) => line.component === 'capex')
      .reduce((total, line) => safeAdd(total, line.delta), 0),
    opex: lines
      .filter((line) => line.component === 'opex')
      .reduce((total, line) => safeAdd(total, line.delta), 0),
  };
}

function netFor(
  lines: readonly RevisionLine[],
  entityType: RevisionEntityType,
  entityId: string,
): ComponentAmounts {
  const own = lines.filter((line) => line.entityType === entityType && line.entityId === entityId);
  return sumByComponent(own);
}

/** One program's net delta across both components. */
export function programNet(lines: readonly RevisionLine[], programId: string): ComponentAmounts {
  return netFor(lines, 'program', programId);
}

/** `REV-2027-001`: the per-plan sequence, rendered with the fiscal year. */
export function formatRevisionNumber(fiscalYear: number, number: number): string {
  return `REV-${fiscalYear}-${String(number).padStart(3, '0')}`;
}

export type RevisionIssueCode =
  | 'empty'
  | 'duplicate_line'
  | 'allocation_not_negative'
  | 'mixed_signs'
  | 'component_shift'
  | 'deallocation_below_floor'
  | 'switch_floor'
  | 'negative_budget';

/** A refused line set. `lineIndexes` point at the inputs the message is about. */
export interface RevisionIssue {
  code: RevisionIssueCode;
  message: string;
  lineIndexes: number[];
}

const COMPONENTS: readonly RevisionComponent[] = ['capex', 'opex'];

function componentLabel(component: RevisionComponent): string {
  return component === 'capex' ? 'Capex' : 'Opex';
}

/**
 * The no-shift and balance rules for one revision document (ADR-0006 §4):
 *
 * - A line names one component, so no single line can shift capex into opex.
 * - Per component the program deltas either net to zero (a switch: one program
 *   down, another up in the same component) or all point the same way (a pure
 *   cut or a pure addition).
 * - The two components never offset each other: a revision cannot cut capex
 *   while adding opex.
 * - An allocation line is always a de-allocation (negative); money never flows
 *   back into a project year allocation through a revision.
 *
 * The switch floor needs database context, so it lives in
 * `validateRevisionFloor`; this function only reads the document.
 */
export function validateRevisionLines(lines: readonly RevisionLine[]): RevisionIssue[] {
  if (lines.length === 0) {
    return [{ code: 'empty', message: 'Add at least one revision line.', lineIndexes: [] }];
  }

  const seen = new Map<string, number>();
  const duplicates: RevisionIssue[] = [];
  lines.forEach((line, index) => {
    const key = `${line.entityType}:${line.entityId}:${line.component}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      return;
    }
    duplicates.push({
      code: 'duplicate_line',
      message:
        line.entityType === 'program'
          ? `This program already has a ${line.component} line; combine both amounts into one delta.`
          : `This allocation already has a ${line.component} line; combine both amounts into one delta.`,
      lineIndexes: [first, index],
    });
  });
  // A duplicated line makes every sum below ambiguous, so it is reported alone.
  if (duplicates.length > 0) return duplicates;

  const issues: RevisionIssue[] = [];

  const positiveAllocationIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.entityType === 'allocation' && line.delta > 0)
    .map(({ index }) => index);
  if (positiveAllocationIndexes.length > 0) {
    issues.push({
      code: 'allocation_not_negative',
      message:
        'A revision can only de-allocate a project year allocation; it cannot add money to one. Use a negative amount.',
      lineIndexes: positiveAllocationIndexes,
    });
  }

  for (const component of COMPONENTS) {
    const indexes = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.entityType === 'program' && line.component === component)
      .map(({ index }) => index);
    if (indexes.length < 2) continue;
    const deltas = indexes.map((index) => lines[index]!.delta);
    const net = deltas.reduce((total, delta) => safeAdd(total, delta), 0);
    const hasPositive = deltas.some((delta) => delta > 0);
    const hasNegative = deltas.some((delta) => delta < 0);
    if (hasPositive && hasNegative && net !== 0) {
      issues.push({
        code: 'mixed_signs',
        message: `${componentLabel(
          component,
        )} lines do not balance: a switch must net to zero, and a pure cut or addition must not mix directions.`,
        lineIndexes: indexes,
      });
    }
  }

  const capexNet = sumByComponent(lines.filter((line) => line.entityType === 'program')).capex;
  const opexNet = sumByComponent(lines.filter((line) => line.entityType === 'program')).opex;
  const shifts =
    (capexNet > 0 && opexNet < 0) || (capexNet < 0 && opexNet > 0);
  if (shifts) {
    issues.push({
      code: 'component_shift',
      message: `Capex and opex never offset each other: capex nets ${formatRupiahSigned(
        capexNet,
      )} while opex nets ${formatRupiahSigned(opexNet)}.`,
      lineIndexes: lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.entityType === 'program')
        .map(({ index }) => index),
    });
  }

  return issues;
}

/** A program's position before the revision: effective budget and allocations. */
export interface RevisionProgramPosition {
  programId: string;
  code: string;
  name: string;
  capexBudget: number;
  opexBudget: number;
  carryInCapex: number;
  carryInOpex: number;
  allocatedCapex: number;
  allocatedOpex: number;
}

/** An allocation's position before the revision and its de-allocation floor. */
export interface RevisionAllocationPosition {
  allocationId: string;
  programId: string;
  /** For messages, for example `PRJ-2027-001 · capex`. */
  label: string;
  capexAmount: number;
  opexAmount: number;
  openCommitmentsCapex: number;
  openCommitmentsOpex: number;
  spendCapex: number;
  spendOpex: number;
}

function componentOf(position: {
  capex: number;
  opex: number;
}, component: RevisionComponent): number {
  return component === 'capex' ? position.capex : position.opex;
}

/**
 * The money floor a revision may not cross (ADR-0006 §4):
 *
 * - A de-allocation may not push a project year allocation below its open
 *   commitments plus current-year spend.
 * - A switch (the component's program deltas net to zero) may take only the
 *   donor program's unallocated budget — effective budget + carry-in −
 *   allocations — plus what explicit de-allocation lines free.
 * - A program budget may never go below zero.
 *
 * A pure cut that leaves a program over-allocated or unfunded is allowed: those
 * are flags, never refusals (BR-17).
 */
export function validateRevisionFloor(input: {
  lines: readonly RevisionLine[];
  programs: readonly RevisionProgramPosition[];
  allocations: readonly RevisionAllocationPosition[];
}): RevisionIssue[] {
  const issues: RevisionIssue[] = [];
  const allocationById = new Map(
    input.allocations.map((allocation) => [allocation.allocationId, allocation]),
  );

  input.lines.forEach((line, index) => {
    if (line.entityType !== 'allocation') return;
    const allocation = allocationById.get(line.entityId);
    if (!allocation) return;
    const amount = componentOf(
      { capex: allocation.capexAmount, opex: allocation.opexAmount },
      line.component,
    );
    const floor = componentOf(
      {
        capex: allocation.openCommitmentsCapex + allocation.spendCapex,
        opex: allocation.openCommitmentsOpex + allocation.spendOpex,
      },
      line.component,
    );
    const after = safeAdd(amount, line.delta);
    if (after < floor) {
      issues.push({
        code: 'deallocation_below_floor',
        message: `${allocation.label} · ${line.component}: de-allocating ${formatRupiah(
          Math.abs(line.delta),
        )} would leave ${formatRupiahSigned(
          after,
        )}, below its open commitments plus current-year spend (${formatRupiah(floor)}).`,
        lineIndexes: [index],
      });
    }
  });

  const programLineNet = sumByComponent(
    input.lines.filter((line) => line.entityType === 'program'),
  );

  for (const program of input.programs) {
    const net = programNet(input.lines, program.programId);
    for (const component of COMPONENTS) {
      const budget = componentOf(
        { capex: program.capexBudget, opex: program.opexBudget },
        component,
      );
      const delta = componentOf(net, component);
      if (delta === 0) continue;
      const indexes = input.lines
        .map((line, index) => ({ line, index }))
        .filter(
          ({ line }) =>
            line.entityType === 'program' &&
            line.entityId === program.programId &&
            line.component === component,
        )
        .map(({ index }) => index);

      const after = safeAdd(budget, delta);
      if (after < 0) {
        issues.push({
          code: 'negative_budget',
          message: `${program.code} · ${component}: the revision would leave the program budget at ${formatRupiahSigned(
            after,
          )}; a budget cannot go below zero.`,
          lineIndexes: indexes,
        });
        continue;
      }

      // Only a balanced component is a switch: a one-sided cut is allowed to
      // over-allocate (BR-17), a switch may not take money that is not there.
      if (componentOf(programLineNet, component) !== 0 || delta >= 0) continue;

      const unallocated =
        budget +
        componentOf({ capex: program.carryInCapex, opex: program.carryInOpex }, component) -
        componentOf(
          { capex: program.allocatedCapex, opex: program.allocatedOpex },
          component,
        );
      const deallocated = input.lines
        .filter(
          (line) =>
            line.entityType === 'allocation' &&
            line.component === component &&
            (allocationById.get(line.entityId)?.programId ?? null) === program.programId,
        )
        .reduce((total, line) => safeAdd(total, Math.abs(line.delta)), 0);
      const coverage = unallocated + deallocated;
      if (coverage < Math.abs(delta)) {
        issues.push({
          code: 'switch_floor',
          message: `${program.code} · ${component}: this switch takes ${formatRupiah(
            Math.abs(delta),
          )}, but only ${formatRupiahSigned(
            coverage,
          )} is unallocated (budget + carry-in − allocations). De-allocate a project allocation or reduce the line.`,
          lineIndexes: indexes,
        });
      }
    }
  }

  return issues;
}

/** Initial amounts plus a per-component delta pair. */
export function applyDeltas(
  initial: ComponentAmounts,
  deltas: ComponentAmounts,
): ComponentAmounts {
  return effectiveBudget(initial, [
    { component: 'capex', delta: deltas.capex },
    { component: 'opex', delta: deltas.opex },
  ]);
}

/**
 * True when a change lowers one component while raising the other. Capex and
 * opex never shift into each other, on any path (ADR-0006 §4): draft program
 * edits, allocation edits and revision lines all call this one rule.
 */
export function isComponentShift(
  before: ComponentAmounts,
  after: ComponentAmounts,
): boolean {
  const capex = after.capex - before.capex;
  const opex = after.opex - before.opex;
  return (capex > 0 && opex < 0) || (capex < 0 && opex > 0);
}

/** An all-zero delta pair, for entities a plan has not revised yet. */
export const NO_DELTAS: ComponentAmounts = { capex: 0, opex: 0 };
