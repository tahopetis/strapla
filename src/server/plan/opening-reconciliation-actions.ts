'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  openingBalanceReconciliations,
  type OpeningBalanceReconciliation,
} from '@/db/schema';
import {
  openingReconciliationSaveSchema,
  openingReconciliationSignOffSchema,
} from '@/domain/inputs';
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { getOpeningReconciliation } from './opening-queries';
import { getStrategicPlan } from './queries';

const LANDING = '/plan/opening-balances';

const CONTROL_FIELDS = [
  'controlEnvelope',
  'controlPriorProgramBudgetUsed',
  'controlProgramBudgets',
  'controlProgramCarryIn',
  'controlProjectOpeningAllocated',
  'controlProjectOpeningCommitted',
  'controlProjectOpeningSpent',
  'controlProjectFullLifeAllocated',
] as const;

function reconciliationSnapshot(row: OpeningBalanceReconciliation): Record<string, unknown> {
  return {
    ...Object.fromEntries(CONTROL_FIELDS.map((field) => [field, row[field]])),
    signedOffAt: row.signedOffAt?.toISOString() ?? null,
    signOffReason: row.signOffReason,
  };
}

async function requirePlan(planId: string) {
  const plan = await getStrategicPlan(planId);
  if (!plan) throw new FormError('Strategic plan not found.');
  if (plan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  return plan;
}

export async function saveOpeningReconciliationAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let planId = '';
  try {
    const input = parseForm(openingReconciliationSaveSchema, formData);
    planId = input.planId;
    await requirePlan(planId);

    const existing = await getOpeningReconciliation(planId);
    if (existing?.signedOffAt) {
      throw new FormError('Opening balances are signed off; correct records with audited edits.');
    }

    const values = {
      controlEnvelope: input.controlEnvelope,
      controlPriorProgramBudgetUsed: input.controlPriorProgramBudgetUsed,
      controlProgramBudgets: input.controlProgramBudgets,
      controlProgramCarryIn: input.controlProgramCarryIn,
      controlProjectOpeningAllocated: input.controlProjectOpeningAllocated,
      controlProjectOpeningCommitted: input.controlProjectOpeningCommitted,
      controlProjectOpeningSpent: input.controlProjectOpeningSpent,
      controlProjectFullLifeAllocated: input.controlProjectFullLifeAllocated,
      updatedBy: user.id,
      updatedAt: new Date(),
    };

    await getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(openingBalanceReconciliations)
        .values({ planId, ...values, createdBy: user.id })
        .onConflictDoUpdate({
          target: openingBalanceReconciliations.planId,
          set: values,
        })
        .returning();
      if (!row) throw new Error('failed to save the opening-balance reconciliation');
      await recordAudit(tx, {
        actorUserId: user.id,
        action: existing ? 'update' : 'create',
        entityType: 'opening_balance_reconciliation',
        entityId: row.id,
        before: existing ? reconciliationSnapshot(existing) : null,
        after: reconciliationSnapshot(row),
        reason: input.reason,
      });
    });
  } catch (error) {
    failWith(LANDING, describeError(error));
  }
  finishWith(LANDING, 'Control totals saved; compare the differences below.');
}

export async function signOffOpeningBalancesAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let planId = '';
  try {
    const input = parseForm(openingReconciliationSignOffSchema, formData);
    planId = input.planId;
    await requirePlan(planId);

    const existing = await getOpeningReconciliation(planId);
    if (!existing) {
      throw new FormError('Save the control totals before signing off the opening balances.');
    }
    if (existing.signedOffAt) throw new FormError('Opening balances are already signed off.');

    await getDb().transaction(async (tx) => {
      const [row] = await tx
        .update(openingBalanceReconciliations)
        .set({
          signedOffAt: new Date(),
          signedOffBy: user.id,
          signOffReason: input.reason,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(openingBalanceReconciliations.planId, planId))
        .returning();
      if (!row) throw new FormError('Opening-balance reconciliation not found.');
      await recordAudit(tx, {
        actorUserId: user.id,
        action: 'status_change',
        entityType: 'opening_balance_reconciliation',
        entityId: row.id,
        before: reconciliationSnapshot(existing),
        after: reconciliationSnapshot(row),
        reason: input.reason,
      });
    });
  } catch (error) {
    failWith(LANDING, describeError(error));
  }
  finishWith(LANDING, 'Opening balances signed off.');
}

