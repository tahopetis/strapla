'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPrograms,
  strategicInitiatives,
  strategicPlans,
  type StrategicInitiative,
  type StrategicPlan,
} from '@/db/schema';
import {
  initiativeCreateSchema,
  initiativeUpdateSchema,
  initiativeVoidSchema,
  planCreateSchema,
  planStatusSchema,
  planUpdateSchema,
  type InitiativeCreateInput,
  type InitiativeUpdateInput,
  type PlanCreateInput,
  type PlanUpdateInput,
} from '@/domain/inputs';
import { validatePlanYears } from '@/domain/plan';
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { getStrategicPlan } from './queries';

const PAGE = '/plan/strategic';

function planSnapshot(plan: StrategicPlan): Record<string, unknown> {
  return {
    name: plan.name,
    startFiscalYear: plan.startFiscalYear,
    endFiscalYear: plan.endFiscalYear,
    status: plan.status,
  };
}

function initiativeSnapshot(initiative: StrategicInitiative): Record<string, unknown> {
  return {
    code: initiative.code,
    name: initiative.name,
    owner: initiative.owner,
    objective: initiative.objective,
    envelopeAmount: initiative.envelopeAmount,
    priorProgramBudgetUsed: initiative.priorProgramBudgetUsed,
    notes: initiative.notes,
    voidedAt: initiative.voidedAt?.toISOString() ?? null,
  };
}

async function requireEditablePlan(id: string): Promise<StrategicPlan> {
  const plan = await getStrategicPlan(id);
  if (!plan) throw new FormError('Strategic plan not found.');
  if (plan.status === 'archived') {
    throw new FormError('This strategic plan is archived and read-only.');
  }
  return plan;
}

async function requireInitiative(id: string): Promise<StrategicInitiative> {
  const rows = await getDb()
    .select()
    .from(strategicInitiatives)
    .where(eq(strategicInitiatives.id, id))
    .limit(1);
  const initiative = rows[0];
  if (!initiative) throw new FormError('Strategic initiative not found.');
  if (initiative.voidedAt) throw new FormError('This initiative is voided and read-only.');
  return initiative;
}

// ---------------------------------------------------------------- strategic plan

async function createPlan(userId: string, input: PlanCreateInput): Promise<void> {
  const yearError = validatePlanYears(input.startFiscalYear, input.endFiscalYear);
  if (yearError) throw new FormError(yearError);

  await getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: strategicPlans.id }).from(strategicPlans).limit(1);
    if (existing.length > 0) {
      throw new FormError('A strategic plan already exists. Archive it before creating a new one.');
    }
    const [created] = await tx
      .insert(strategicPlans)
      .values({
        name: input.name,
        startFiscalYear: input.startFiscalYear,
        endFiscalYear: input.endFiscalYear,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the strategic plan');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'strategic_plan',
      entityId: created.id,
      after: planSnapshot(created),
    });
  });
}

async function updatePlan(userId: string, input: PlanUpdateInput): Promise<void> {
  const current = await requireEditablePlan(input.id);
  const yearError = validatePlanYears(input.startFiscalYear, input.endFiscalYear);
  if (yearError) throw new FormError(yearError);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(strategicPlans)
      .set({
        name: input.name,
        startFiscalYear: input.startFiscalYear,
        endFiscalYear: input.endFiscalYear,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(strategicPlans.id, input.id))
      .returning();
    if (!updated) throw new FormError('Strategic plan not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'strategic_plan',
      entityId: input.id,
      before: planSnapshot(current),
      after: planSnapshot(updated),
      reason: input.reason,
    });
  });
}

async function setPlanStatus(
  userId: string,
  id: string,
  reason: string,
  status: 'active' | 'archived',
): Promise<void> {
  const current = await requireEditablePlan(id);
  if (status === 'archived' && current.status === 'draft') {
    throw new FormError('Activate the plan before archiving it.');
  }
  if (current.status === status) throw new FormError(`The plan is already ${status}.`);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(strategicPlans)
      .set({ status, updatedBy: userId, updatedAt: new Date() })
      .where(eq(strategicPlans.id, id))
      .returning();
    if (!updated) throw new FormError('Strategic plan not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'status_change',
      entityType: 'strategic_plan',
      entityId: id,
      before: planSnapshot(current),
      after: planSnapshot(updated),
      reason,
    });
  });
}

// ---------------------------------------------------------------- strategic initiative

async function createInitiative(userId: string, input: InitiativeCreateInput): Promise<void> {
  await requireEditablePlan(input.planId);
  await getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(strategicInitiatives)
      .values({
        planId: input.planId,
        code: input.code,
        name: input.name,
        owner: input.owner,
        objective: input.objective,
        envelopeAmount: input.envelopeAmount,
        priorProgramBudgetUsed: input.priorProgramBudgetUsed,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the strategic initiative');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'strategic_initiative',
      entityId: created.id,
      after: initiativeSnapshot(created),
    });
  });
}

async function updateInitiative(userId: string, input: InitiativeUpdateInput): Promise<void> {
  const current = await requireInitiative(input.id);
  await requireEditablePlan(current.planId);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(strategicInitiatives)
      .set({
        code: input.code,
        name: input.name,
        owner: input.owner,
        objective: input.objective,
        envelopeAmount: input.envelopeAmount,
        priorProgramBudgetUsed: input.priorProgramBudgetUsed,
        notes: input.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(strategicInitiatives.id, input.id))
      .returning();
    if (!updated) throw new FormError('Strategic initiative not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'strategic_initiative',
      entityId: input.id,
      before: initiativeSnapshot(current),
      after: initiativeSnapshot(updated),
      reason: input.reason,
    });
  });
}

async function voidInitiative(userId: string, input: { id: string; reason: string }): Promise<void> {
  const current = await requireInitiative(input.id);
  await requireEditablePlan(current.planId);

  const programs = await getDb()
    .select({ id: annualPrograms.id })
    .from(annualPrograms)
    .where(and(eq(annualPrograms.siId, input.id), isNull(annualPrograms.voidedAt)))
    .limit(1);
  if (programs.length > 0) {
    throw new FormError('This initiative has annual programs. Void its programs first.');
  }

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(strategicInitiatives)
      .set({
        voidedAt: new Date(),
        voidedReason: input.reason,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(strategicInitiatives.id, input.id))
      .returning();
    if (!updated) throw new FormError('Strategic initiative not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'strategic_initiative',
      entityId: input.id,
      before: initiativeSnapshot(current),
      after: initiativeSnapshot(updated),
      reason: input.reason,
    });
  });
}

// ---------------------------------------------------------------- actions

export async function createPlanAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    await createPlan(user.id, parseForm(planCreateSchema, formData));
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic plan created.');
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    await updatePlan(user.id, parseForm(planUpdateSchema, formData));
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic plan updated.');
}

export async function activatePlanAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    const input = parseForm(planStatusSchema, formData);
    await setPlanStatus(user.id, input.id, input.reason, 'active');
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic plan activated.');
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    const input = parseForm(planStatusSchema, formData);
    await setPlanStatus(user.id, input.id, input.reason, 'archived');
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic plan archived.');
}

export async function createInitiativeAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    await createInitiative(user.id, parseForm(initiativeCreateSchema, formData));
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic initiative created.');
}

export async function updateInitiativeAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    await updateInitiative(user.id, parseForm(initiativeUpdateSchema, formData));
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic initiative updated.');
}

export async function voidInitiativeAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    const input = parseForm(initiativeVoidSchema, formData);
    await voidInitiative(user.id, input);
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Strategic initiative voided.');
}
