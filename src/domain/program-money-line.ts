import { revisedProgramBudgetPosition, type ProgramBudgetPosition } from '@/domain/funding';
import { remaining } from '@/domain/money';
import { applyDeltas, type ComponentAmounts } from '@/domain/revisions';

/**
 * The program money line (ADR-0006 §6, #115).
 *
 *   initial budget | carry-in received | revisions (+/−)
 *   | effective budget | allocations | open commitments
 *   | current-year spend | remaining
 *
 * per component. It is a pure projection of figures the page already loads, so
 * the reconciliation is testable without a database:
 *
 *   effective  = initial + Σ revisions
 *   available  = effective + carry-in            (the identity the page proves)
 *   remaining  = available − open commitments − current-year spend
 *
 * Carry-in is passed in from the ledger (`getCarryInForPlan`), never typed.
 * `overAllocated` and `unfunded` are the two BR-17 warning states: a program can
 * be over-allocated (allocations above available) or unfunded (remaining below
 * zero after a cut); neither blocks entry.
 */

export interface ProgramMoneyLineInput {
  initial: ComponentAmounts;
  revisions: ComponentAmounts;
  /** Carry-in received from the ledger, per component. */
  carryIn: ComponentAmounts;
  allocated: ComponentAmounts;
  openCommitments: ComponentAmounts;
  /** Spend that counts against this fiscal year (cross-year portions excluded). */
  currentYearSpend: ComponentAmounts;
}

export interface ProgramMoneyLineComponent {
  initial: number;
  carryIn: number;
  revision: number;
  effective: number;
  /** effective + carry-in: the program's available money this year. */
  available: number;
  allocated: number;
  openCommitments: number;
  currentYearSpend: number;
  remaining: number;
  /** Allocations above available money (BR-7): flagged, never blocked. */
  overAllocated: boolean;
  /** Remaining below zero after a budget cut (ADR-0006 §4): flagged, never blocked. */
  unfunded: boolean;
}

export interface ProgramMoneyLine {
  capex: ProgramMoneyLineComponent;
  opex: ProgramMoneyLineComponent;
}

function component(
  input: {
    initial: number;
    revision: number;
    effective: number;
    carryIn: number;
    allocated: number;
    openCommitments: number;
    currentYearSpend: number;
  },
  position: { available: number; over: boolean },
): ProgramMoneyLineComponent {

  const remainingValue = remaining({
    allocation: input.effective,
    carryIn: input.carryIn,
    openCommitments: input.openCommitments,
    currentYearSpend: input.currentYearSpend,
  });
  return {
    initial: input.initial,
    carryIn: input.carryIn,
    revision: input.revision,
    effective: input.effective,
    available: position.available,
    allocated: input.allocated,
    openCommitments: input.openCommitments,
    currentYearSpend: input.currentYearSpend,
    remaining: remainingValue,
    overAllocated: position.over,
    unfunded: remainingValue < 0,
  };
}

export function programMoneyLine(input: ProgramMoneyLineInput): ProgramMoneyLine {
  const effective = applyDeltas(input.initial, input.revisions);
  const position: ProgramBudgetPosition = revisedProgramBudgetPosition({
    capexBudget: input.initial.capex,
    opexBudget: input.initial.opex,
    revision: input.revisions,
    carryInCapex: input.carryIn.capex,
    carryInOpex: input.carryIn.opex,
    allocatedCapex: input.allocated.capex,
    allocatedOpex: input.allocated.opex,
  });
  return {
    capex: component(
      {
        initial: input.initial.capex,
        revision: input.revisions.capex,
        effective: effective.capex,
        carryIn: input.carryIn.capex,
        allocated: input.allocated.capex,
        openCommitments: input.openCommitments.capex,
        currentYearSpend: input.currentYearSpend.capex,
      },
      position.capex,
    ),
    opex: component(
      {
        initial: input.initial.opex,
        revision: input.revisions.opex,
        effective: effective.opex,
        carryIn: input.carryIn.opex,
        allocated: input.allocated.opex,
        openCommitments: input.openCommitments.opex,
        currentYearSpend: input.currentYearSpend.opex,
      },
      position.opex,
    ),
  };
}
