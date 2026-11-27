'use server';

import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  annualPlans,
  closeSnapshots,
  projectYearAllocations,
  type AnnualPlan,
} from '@/db/schema';
import { closeFiscalYearSchema } from '@/domain/inputs';
import {
  CloseError,
  assertCloseConfirmation,
  type CarryOverTotalsByEntity,
} from '@/domain/close';
import { buildClosePlan, finalCloseReason, type ClosePlan } from '@/lib/close-form';
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import {
  appendCarryEntry,
  assertCarryCacheMatches,
  recomputeCarryCache,
} from './carry-ledger';
import {
  carryInvariantKey,
  listReceiptEntriesForEntities,
  summarizeCloseEntries,
} from './carry-queries';
import { getCloseState } from './close-queries';

/**
 * The year close (#113, ADR-0006 §3). One transaction writes the ledger
 * receipts (origin `close`), one immutable snapshot row per source entity and
 * component — zero carry included — the recomputed `carry_in_*` cache, and the
 * closed status. The snapshot invariants are checked against the ledger in the
 * same transaction, so a partially applied close can never exist.
 *
 * The strategic plan's end year is a final close (#109, ADR-0008 §3): it needs no next-year
 * target, writes no receipt, and snapshots every available amount as not carried
 * with the fixed plan-boundary reason.
 */

/** The typed phrase is a form error (shown on the close page). */
function requireConfirmation(confirmation: string, fiscalYear: number): void {
  try {
    assertCloseConfirmation(confirmation, fiscalYear);
  } catch (error) {
    if (error instanceof CloseError) throw new FormError(error.message);
    throw error;
  }
}

/**
 * The carry target: the same strategic plan's next fiscal year. Only a
 * non-final close writes a receipt, and it always has this target loaded.
 */
function requireCarryTarget(plan: AnnualPlan | null, fiscalYear: number): AnnualPlan {
  if (!plan) {
    throw new FormError(
      `The FY${fiscalYear + 1} annual plan does not exist yet; create it before closing.`,
    );
  }
  return plan;
}

function requireNoCloseError(build: () => ClosePlan): ClosePlan {
  try {
    return build();
  } catch (error) {
    if (error instanceof CloseError) throw new FormError(error.message);
    throw error;
  }
}

/** One receipt's lineage parent: the single receipt that funded the source entity, if any. */
function receiptAncestors(
  entries: Awaited<ReturnType<typeof listReceiptEntriesForEntities>>,
): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    // The receipt's target is the entity that received the carry-in; that is the
    // entity this close is now carrying out. Grouping by the receipt's own
    // source would look one year too far back (and skip opening/manual receipts,
    // whose source is null).
    const key = carryInvariantKey(entry.entityType, entry.targetEntityId, entry.component);
    const list = grouped.get(key) ?? [];
    list.push(entry.id);
    grouped.set(key, list);
  }
  const single = new Map<string, string>();
  for (const [key, ids] of grouped) {
    // Carry of carry is one hop per entry. With a single receipt the lineage is
    // unambiguous; with several the amount is a fungible pool and the chain is
    // not invented here.
    if (ids.length === 1) single.set(key, ids[0]!);
  }
  return single;
}

interface WrittenClose {
  closed: AnnualPlan;
  totals: CarryOverTotalsByEntity;
  entryCount: number;
  snapshotCount: number;
  /** True when this was the strategic plan's end-year final close (#109, ADR-0008 §3). */
  finalClose: boolean;
}

async function closeFiscalYear(
  userId: string,
  input: { annualPlanId: string; reference: string; confirmation: string },
  formData: FormData,
): Promise<WrittenClose> {
  const state = await getCloseState(input.annualPlanId);
  if (!state) throw new FormError('Annual plan not found.');
  if (state.plan.status === 'closed') throw new FormError('This fiscal year is already closed.');
  if (state.plan.status !== 'active') {
    throw new FormError('Only an active annual plan can be closed.');
  }
  if (state.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  // A final close (#109, ADR-0008 §3) needs no next-year target: the end year carries nothing
  // across the plan boundary, so there is nowhere for a carry to land. A state
  // without the flag is an ordinary close.
  const isFinalClose = state.isFinalClose === true;
  const targetPlan = isFinalClose
    ? null
    : requireCarryTarget(state.targetPlan, state.plan.fiscalYear);
  if (targetPlan && targetPlan.status === 'closed') {
    throw new FormError('The target fiscal year is already closed.');
  }
  if (state.carryOvers.length > 0) {
    throw new FormError('Carry-over for this fiscal year is already recorded.');
  }
  requireConfirmation(input.confirmation, state.plan.fiscalYear);

  const closePlan = requireNoCloseError(() =>
    buildClosePlan(
      {
        defaultEntryReason: targetPlan
          ? `Carried into FY${targetPlan.fiscalYear} at the FY${state.plan.fiscalYear} close (${input.reference})`
          : '',
        finalClose: isFinalClose
          ? { reason: finalCloseReason(state.plan.fiscalYear) }
          : undefined,
        programs: state.programs.map((row) => ({
          id: row.program.id,
          code: row.program.code,
          name: row.program.name,
          availableCapex: row.availableCapex,
          availableOpex: row.availableOpex,
          continuationProgramId: row.continuationProgramId,
          targetProgramIds: row.targetProgramIds,
        })),
        allocations: state.allocations.map((row) => ({
          id: row.allocation.id,
          projectCode: row.project.code,
          programId: row.allocation.annualProgramId,
          availableCapex: row.availableCapex,
          availableOpex: row.availableOpex,
          targetAllocationId: row.targetAllocation?.id ?? null,
          canCreateTarget: row.canCreateTarget,
          note: row.note,
        })),
      },
      formData,
    ),
  );

  const receipts = await listReceiptEntriesForEntities(
    state.plan.id,
    [
      ...state.programs.map((row) => ({ entityType: 'program' as const, entityId: row.program.id })),
      ...state.allocations.map((row) => ({
        entityType: 'allocation' as const,
        entityId: row.allocation.id,
      })),
    ],
  );
  const ancestors = receiptAncestors(receipts);

  let written: WrittenClose | undefined;
  await getDb().transaction(async (tx) => {
    const entryIds: string[] = [];
    const touchedTargets = new Map<string, { entityType: 'program' | 'allocation'; entityId: string }>();

    // New target allocations referenced by a `new-allocation:` marker are
    // created first, so the receipts point at real rows.
    const resolvedTargets = new Map<string, string>();
    const allocationEntries = closePlan.entries.filter((entry) => entry.entityType === 'allocation');
    for (const entry of allocationEntries) {
      if (!entry.targetEntityId.startsWith('new-allocation:')) {
        resolvedTargets.set(entry.targetEntityId, entry.targetEntityId);
      }
    }
    for (const sourceAllocationId of new Set(allocationEntries.map((entry) => entry.sourceEntityId))) {
      const marker = allocationEntries.find(
        (entry) => entry.sourceEntityId === sourceAllocationId,
      )?.targetEntityId;
      if (!marker || !marker.startsWith('new-allocation:')) continue;
      const row = state.allocations.find(
        (candidate) => candidate.allocation.id === sourceAllocationId,
      );
      if (!row) throw new FormError('An allocation to carry over was not found.');
      const targetProgramId = closePlan.programTargets.get(row.allocation.annualProgramId);
      if (!targetProgramId) {
        throw new FormError(`No target program for ${row.project.code}.`);
      }
      // Only a non-final close carries allocations, and it always has a target.
      const carryTarget = requireCarryTarget(targetPlan, state.plan.fiscalYear);
      const [created] = await tx
        .insert(projectYearAllocations)
        .values({
          projectId: row.project.id,
          annualPlanId: carryTarget.id,
          annualProgramId: targetProgramId,
          allocationCapex: 0,
          allocationOpex: 0,
          notes: `Carry-over from FY${state.plan.fiscalYear} (${input.reference}).`,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      if (!created) throw new Error('failed to create the target allocation');
      resolvedTargets.set(marker, created.id);
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'create',
        entityType: 'project_year_allocation',
        entityId: created.id,
        after: {
          projectId: row.project.id,
          annualPlanId: carryTarget.id,
          annualProgramId: targetProgramId,
        },
        reason: `Created by the FY${state.plan.fiscalYear} close: ${input.reference}`,
      });
    }

    for (const entry of closePlan.entries) {
      // Only a non-final close writes receipts, and it always has a target.
      const carryTarget = requireCarryTarget(targetPlan, state.plan.fiscalYear);
      const targetEntityId =
        entry.entityType === 'allocation'
          ? (resolvedTargets.get(entry.targetEntityId) ?? entry.targetEntityId)
          : entry.targetEntityId;
      const receipt = await appendCarryEntry(tx, {
        origin: 'close',
        sourceAnnualPlanId: state.plan.id,
        sourceEntityId: entry.sourceEntityId,
        targetAnnualPlanId: carryTarget.id,
        entityType: entry.entityType,
        targetEntityId,
        component: entry.component,
        amount: entry.amount,
        reason: entry.reason,
        approvalReference: input.reference,
        sourceEntryId:
          ancestors.get(carryInvariantKey(entry.entityType, entry.sourceEntityId, entry.component)) ??
          null,
        actorUserId: userId,
      });
      entryIds.push(receipt.id);
      touchedTargets.set(`${entry.entityType}:${targetEntityId}`, {
        entityType: entry.entityType,
        entityId: targetEntityId,
      });
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'carry_over',
        entityType: entry.entityType === 'program' ? 'annual_program' : 'project_year_allocation',
        entityId: targetEntityId,
        after: {
          origin: 'close',
          amount: entry.amount,
          component: entry.component,
          sourceAnnualPlanId: state.plan.id,
          sourceEntityId: entry.sourceEntityId,
          targetAnnualPlanId: carryTarget.id,
          carryOverEntryId: receipt.id,
          sourceEntryId: receipt.sourceEntryId,
        },
        reason: input.reference,
      });
    }

    // One immutable snapshot row per source entity and component, zero included.
    for (const snapshot of closePlan.snapshots) {
      await tx.insert(closeSnapshots).values({
        annualPlanId: state.plan.id,
        entityType: snapshot.entityType,
        entityId: snapshot.entityId,
        component: snapshot.component,
        available: snapshot.available,
        carried: snapshot.carried,
        notCarried: snapshot.notCarried,
        notCarriedReason: snapshot.notCarriedReason,
      });
    }

    // The guarded cache is written only here, from the ledger sum.
    for (const target of touchedTargets.values()) {
      await recomputeCarryCache(tx, { ...target, actorUserId: userId });
      await assertCarryCacheMatches(tx, target);
    }

    await assertCloseInvariants(tx, state.plan.id, closePlan);

    const [row] = await tx
      .update(annualPlans)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedBy: userId,
        closeReference: input.reference,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(annualPlans.id, state.plan.id))
      .returning();
    if (!row) throw new FormError('Annual plan not found.');

    await recordAudit(tx, {
      actorUserId: userId,
      action: 'close',
      entityType: 'annual_plan',
      entityId: state.plan.id,
      before: { status: state.plan.status },
      after: {
        status: 'closed',
        closeReference: input.reference,
        targetAnnualPlanId: targetPlan?.id ?? null,
        carryOverEntries: entryIds.length,
        closeSnapshots: closePlan.snapshots.length,
        // Only a final close (#109, ADR-0008 §3) sets this, so earlier years keep the same
        // audit payload they have always written.
        ...(isFinalClose ? { finalClose: true } : {}),
      },
      reason: input.reference,
    });

    written = {
      closed: row,
      totals: closePlan.totals,
      entryCount: entryIds.length,
      snapshotCount: closePlan.snapshots.length,
      finalClose: isFinalClose,
    };
  });

  if (!written) throw new FormError('Annual plan not found.');
  return written;
}

/**
 * ADR-0006 §3, checked inside the close transaction: for every snapshot row,
 * carried equals the sum of the entries written for that source entity and
 * component, and available equals carried plus not-carried.
 */
async function assertCloseInvariants(
  tx: Pick<Db, 'select'>,
  sourceAnnualPlanId: string,
  closePlan: ClosePlan,
): Promise<void> {
  const ledger = await summarizeCloseEntries(tx, sourceAnnualPlanId);
  for (const snapshot of closePlan.snapshots) {
    const key = carryInvariantKey(snapshot.entityType, snapshot.entityId, snapshot.component);
    const written = ledger.get(key) ?? 0;
    if (written !== snapshot.carried) {
      throw new FormError(
        `The close could not be recorded: the snapshot carries ${snapshot.carried} Rupiah for ${key}, but the ledger wrote ${written}.`,
      );
    }
    if (snapshot.available !== snapshot.carried + snapshot.notCarried) {
      throw new FormError(
        `The close could not be recorded: available ${snapshot.available} Rupiah is not carried plus not-carried for ${key}.`,
      );
    }
  }
}

export async function closeFiscalYearAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, closeFiscalYearSchema, formData);
  if (!parsed.ok) return parsed.state;

  let written: WrittenClose;
  try {
    written = await closeFiscalYear(actor.id, parsed.data, formData);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `/plan/annual/${written.closed.id}`,
    written.finalClose
      ? `Fiscal year FY${written.closed.fiscalYear} closed as the final close: no carry-over, ${written.snapshotCount} snapshot rows.`
      : `Fiscal year FY${written.closed.fiscalYear} closed and carry-over recorded (${written.entryCount} receipt${written.entryCount === 1 ? '' : 's'}, ${written.snapshotCount} snapshot rows).`,
  );
}
