import { carryOverAmountSchema } from '@/domain/inputs';
import {
  CloseError,
  carryOverCandidate,
  carryOverTotals,
  validateCarryOverAmount,
  type CarryOverTotalsByEntity,
} from '@/domain/close';

/**
 * The close form's carry-over field contract (W4a) and the close plan (#113,
 * ADR-0006 §3): the field names and the pure decision live here, so the form's
 * live preview and the server action use one definition and can never disagree
 * about which fields are carry-over.
 *
 * The plan turns the submitted amounts into the ledger entries and the close
 * snapshot rows (one per entity and component, including zero carry) and
 * applies the target restriction. It is pure: the action maps the loaded
 * candidates in, then writes the plan in one transaction.
 */

export type CarryOverEntityType = 'program' | 'allocation';
export type CarryOverComponent = 'capex' | 'opex';

const COMPONENTS: readonly CarryOverComponent[] = ['capex', 'opex'];

export function carryOverFieldName(
  entityType: CarryOverEntityType,
  entityId: string,
  component: CarryOverComponent,
): string {
  return `carry_${entityType}_${entityId}_${component}`;
}

/** Why the part of the available amount that is not carried stays behind. */
export function notCarriedReasonFieldName(
  entityType: CarryOverEntityType,
  entityId: string,
): string {
  return `not_carried_reason_${entityType}_${entityId}`;
}

/** The explicit target choice for a discontinued or merged source program. */
export function targetProgramFieldName(programId: string): string {
  return `target_program_${programId}`;
}

export type CarryOverFieldResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

/**
 * Validates one raw close-form carry-over field against the shared input schema.
 * A non-string value (a File, or a missing field) is treated as blank and left to
 * the schema to reject, so zero carry-over must always be an explicit "0".
 */
export function readCarryOverField(raw: unknown, label: string): CarryOverFieldResult {
  const result = carryOverAmountSchema(label).safeParse(typeof raw === 'string' ? raw : '');
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: result.error.issues[0]?.message ?? 'Enter a whole Rupiah amount (use 0 for none).',
  };
}

export interface ClosePlanProgram {
  id: string;
  code: string;
  name: string;
  /** The positive carry candidate, per component (unallocated budget). */
  availableCapex: number;
  availableOpex: number;
  /**
   * The source program's continuation program in the target year. When it
   * exists it is the only valid target (ADR-0006 §3).
   */
  continuationProgramId: string | null;
  /** Same-initiative target programs, selectable only when the source is discontinued. */
  targetProgramIds: readonly string[];
}

export interface ClosePlanAllocation {
  id: string;
  projectCode: string;
  /** The source program the allocation belongs to (its continuation is the target). */
  programId: string;
  /** The positive carry candidate, per component (allocation remaining). */
  availableCapex: number;
  availableOpex: number;
  targetAllocationId: string | null;
  canCreateTarget: boolean;
  note: string | null;
}

export interface ClosePlanInput {
  /** Phrases a receipt whose row carries nothing; the ledger needs a reason. */
  defaultEntryReason: string;
  programs: readonly ClosePlanProgram[];
  allocations: readonly ClosePlanAllocation[];
}

export interface ClosePlanSnapshotRow {
  entityType: CarryOverEntityType;
  entityId: string;
  component: CarryOverComponent;
  available: number;
  carried: number;
  notCarried: number;
  notCarriedReason: string;
}

export interface ClosePlanEntry {
  entityType: CarryOverEntityType;
  sourceEntityId: string;
  targetEntityId: string;
  component: CarryOverComponent;
  amount: number;
  reason: string;
}

export interface ClosePlan {
  entries: ClosePlanEntry[];
  snapshots: ClosePlanSnapshotRow[];
  /** Carried source programs and the target they carry into. */
  programTargets: Map<string, string>;
  totals: CarryOverTotalsByEntity;
}

function readSubmittedReason(formData: FormData, entityType: CarryOverEntityType, entityId: string): string {
  const raw = formData.get(notCarriedReasonFieldName(entityType, entityId));
  return typeof raw === 'string' ? raw.trim() : '';
}

function readSubmittedAmount(
  formData: FormData,
  entityType: CarryOverEntityType,
  entityId: string,
  component: CarryOverComponent,
  label: string,
): number {
  const parsed = readCarryOverField(formData.get(carryOverFieldName(entityType, entityId, component)), label);
  if (!parsed.ok) throw new CloseError(parsed.message);
  return parsed.value;
}

function requireNotCarriedReason(input: {
  label: string;
  entityType: CarryOverEntityType;
  entityId: string;
  component: CarryOverComponent;
  notCarried: number;
  reason: string;
}): void {
  if (input.notCarried === 0 || input.reason.length > 0) return;
  throw new CloseError(
    `${input.label} not-carried reason is required: ${input.notCarried} Rupiah of the available amount is not carried (field ${notCarriedReasonFieldName(
      input.entityType,
      input.entityId,
    )}).`,
  );
}

/**
 * A continued program may only carry into its continuation program. A program
 * without one is discontinued or merged, and then the owner must name another
 * program of the same strategic initiative explicitly — it is a reallocation
 * decision, not a default.
 */
function resolveProgramTarget(program: ClosePlanProgram, formData: FormData): string {
  if (program.continuationProgramId) return program.continuationProgramId;
  const raw = formData.get(targetProgramFieldName(program.id));
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0 || !program.targetProgramIds.includes(value)) {
    throw new CloseError(
      `Choose a target program for ${program.code}: it is discontinued or merged, so the carry target must be chosen explicitly within the same strategic initiative.`,
    );
  }
  return value;
}

/**
 * Builds the close decision from the submitted form: the ledger entries (only
 * the positive carry amounts) and the snapshot rows (one per entity and
 * component, zero carry included). Throws `CloseError` with a readable message
 * when a rule blocks the close, so the action can return form state.
 */
export function buildClosePlan(input: ClosePlanInput, formData: FormData): ClosePlan {
  const entries: ClosePlanEntry[] = [];
  const snapshots: ClosePlanSnapshotRow[] = [];
  const programTargets = new Map<string, string>();

  // Read every amount first: a program needs a target when it carries itself or
  // when one of its allocations carries, because a new target allocation is
  // created under the continuation program.
  const programAmounts = new Map<
    string,
    { carried: Record<CarryOverComponent, number>; available: Record<CarryOverComponent, number>; reason: string }
  >();
  for (const program of input.programs) {
    const available: Record<CarryOverComponent, number> = {
      capex: carryOverCandidate(program.availableCapex),
      opex: carryOverCandidate(program.availableOpex),
    };
    const carried: Record<CarryOverComponent, number> = { capex: 0, opex: 0 };
    for (const component of COMPONENTS) {
      carried[component] = readSubmittedAmount(
        formData,
        'program',
        program.id,
        component,
        `${program.code} ${component}`,
      );
    }
    programAmounts.set(program.id, {
      carried,
      available,
      reason: readSubmittedReason(formData, 'program', program.id),
    });
  }
  const allocationAmounts = new Map<
    string,
    { carried: Record<CarryOverComponent, number>; available: Record<CarryOverComponent, number>; reason: string }
  >();
  for (const allocation of input.allocations) {
    const available: Record<CarryOverComponent, number> = {
      capex: carryOverCandidate(allocation.availableCapex),
      opex: carryOverCandidate(allocation.availableOpex),
    };
    const carried: Record<CarryOverComponent, number> = { capex: 0, opex: 0 };
    for (const component of COMPONENTS) {
      carried[component] = readSubmittedAmount(
        formData,
        'allocation',
        allocation.id,
        component,
        `${allocation.projectCode} ${component}`,
      );
    }
    allocationAmounts.set(allocation.id, {
      carried,
      available,
      reason: readSubmittedReason(formData, 'allocation', allocation.id),
    });
  }

  for (const program of input.programs) {
    const amounts = programAmounts.get(program.id);
    if (!amounts) continue;
    const { carried, available, reason } = amounts;
    const ownCarried = carried.capex + carried.opex;
    const allocationCarried = input.allocations
      .filter((allocation) => allocation.programId === program.id)
      .reduce((total, allocation) => {
        const rows = allocationAmounts.get(allocation.id);
        return total + (rows ? rows.carried.capex + rows.carried.opex : 0);
      }, 0);
    const target =
      ownCarried + allocationCarried > 0 ? resolveProgramTarget(program, formData) : null;
    if (target) programTargets.set(program.id, target);

    for (const component of COMPONENTS) {
      const label = `${program.code} ${component}`;
      validateCarryOverAmount({
        amount: carried[component],
        available: available[component],
        label: `${label} carry-over`,
      });
      const notCarried = available[component] - carried[component];
      requireNotCarriedReason({
        label,
        entityType: 'program',
        entityId: program.id,
        component,
        notCarried,
        reason,
      });
      snapshots.push({
        entityType: 'program',
        entityId: program.id,
        component,
        available: available[component],
        carried: carried[component],
        notCarried,
        notCarriedReason: notCarried > 0 ? reason : '',
      });
      if (carried[component] > 0) {
        if (!target) throw new CloseError(`Choose a target program for ${program.code}.`);
        entries.push({
          entityType: 'program',
          sourceEntityId: program.id,
          targetEntityId: target,
          component,
          amount: carried[component],
          reason: input.defaultEntryReason,
        });
      }
    }
  }

  for (const allocation of input.allocations) {
    const amounts = allocationAmounts.get(allocation.id);
    if (!amounts) continue;
    const { carried, available, reason } = amounts;
    const totalCarried = carried.capex + carried.opex;
    let targetEntityId: string | null = null;
    if (totalCarried > 0) {
      if (allocation.targetAllocationId) targetEntityId = allocation.targetAllocationId;
      else if (allocation.canCreateTarget) targetEntityId = `new-allocation:${allocation.id}`;
      else {
        throw new CloseError(
          allocation.note ?? `Cannot carry ${allocation.projectCode} into the next fiscal year.`,
        );
      }
    }
    for (const component of COMPONENTS) {
      const label = `${allocation.projectCode} ${component}`;
      validateCarryOverAmount({
        amount: carried[component],
        available: available[component],
        label: `${label} carry-over`,
      });
      const notCarried = available[component] - carried[component];
      requireNotCarriedReason({
        label,
        entityType: 'allocation',
        entityId: allocation.id,
        component,
        notCarried,
        reason,
      });
      snapshots.push({
        entityType: 'allocation',
        entityId: allocation.id,
        component,
        available: available[component],
        carried: carried[component],
        notCarried,
        notCarriedReason: notCarried > 0 ? reason : '',
      });
      if (carried[component] > 0) {
        if (!targetEntityId) {
          throw new CloseError(`Cannot carry ${allocation.projectCode} into the next fiscal year.`);
        }
        entries.push({
          entityType: 'allocation',
          sourceEntityId: allocation.id,
          targetEntityId,
          component,
          amount: carried[component],
          reason: input.defaultEntryReason,
        });
      }
    }
  }

  return {
    entries,
    snapshots,
    programTargets,
    totals: carryOverTotals(
      entries.map((entry) => ({
        entityType: entry.entityType,
        component: entry.component,
        amount: entry.amount,
      })),
    ),
  };
}
