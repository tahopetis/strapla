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
import { withCustomFields } from '@/domain/custom-fields';
import { validatePlanYears } from '@/domain/plan';
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  customFieldState,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { readCustomFieldValues, saveCustomFieldValues } from '@/server/custom-fields/data';
import {
  readCustomFieldPayloadState,
  type CustomFieldPayload,
} from '@/server/custom-fields/form';
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

async function createPlan(userId: string, input: PlanCreateInput): Promise<StrategicPlan> {
  const yearError = validatePlanYears(input.startFiscalYear, input.endFiscalYear);
  if (yearError) throw new FormError(yearError);

  let created: StrategicPlan | undefined;
  await getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: strategicPlans.id }).from(strategicPlans).limit(1);
    if (existing.length > 0) {
      throw new FormError('A strategic plan already exists. Archive it before creating a new one.');
    }
    [created] = await tx
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
  if (!created) throw new Error('failed to create the strategic plan');
  return created;
}

async function updatePlan(userId: string, input: PlanUpdateInput): Promise<StrategicPlan> {
  const current = await requireEditablePlan(input.id);
  const yearError = validatePlanYears(input.startFiscalYear, input.endFiscalYear);
  if (yearError) throw new FormError(yearError);

  let updated: StrategicPlan | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Strategic plan not found.');
  return updated;
}

async function setPlanStatus(
  userId: string,
  id: string,
  reason: string,
  status: 'active' | 'archived',
): Promise<StrategicPlan> {
  const current = await requireEditablePlan(id);
  if (status === 'archived' && current.status === 'draft') {
    throw new FormError('Activate the plan before archiving it.');
  }
  if (current.status === status) throw new FormError(`The plan is already ${status}.`);

  let updated: StrategicPlan | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Strategic plan not found.');
  return updated;
}

// ---------------------------------------------------------------- strategic initiative

async function createInitiative(
  userId: string,
  input: InitiativeCreateInput,
  custom: CustomFieldPayload,
): Promise<StrategicInitiative> {
  await requireEditablePlan(input.planId);
  let created: StrategicInitiative | undefined;
  await getDb().transaction(async (tx) => {
    [created] = await tx
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
    await saveCustomFieldValues(tx, {
      entityType: 'strategic_initiative',
      entityId: created.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'strategic_initiative',
      entityId: created.id,
      after: withCustomFields(initiativeSnapshot(created), custom.fields, custom.values),
    });
  });
  if (!created) throw new Error('failed to create the strategic initiative');
  return created;
}

async function updateInitiative(
  userId: string,
  input: InitiativeUpdateInput,
  custom: CustomFieldPayload,
): Promise<StrategicInitiative> {
  const current = await requireInitiative(input.id);
  await requireEditablePlan(current.planId);

  let updated: StrategicInitiative | undefined;
  await getDb().transaction(async (tx) => {
    const beforeValues = await readCustomFieldValues('strategic_initiative', input.id, tx);
    [updated] = await tx
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
    await saveCustomFieldValues(tx, {
      entityType: 'strategic_initiative',
      entityId: input.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'strategic_initiative',
      entityId: input.id,
      before: withCustomFields(initiativeSnapshot(current), custom.fields, beforeValues),
      after: withCustomFields(initiativeSnapshot(updated), custom.fields, custom.values),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Strategic initiative not found.');
  return updated;
}

async function voidInitiative(
  userId: string,
  input: { id: string; reason: string },
): Promise<StrategicInitiative> {
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

  let updated: StrategicInitiative | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Strategic initiative not found.');
  return updated;
}

// ---------------------------------------------------------------- actions

function planName(plan: StrategicPlan): string {
  return `“${plan.name}”`;
}

export async function createPlanAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, planCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let created: StrategicPlan;
  try {
    created = await createPlan(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic plan ${planName(created)} created.`);
}

export async function updatePlanAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, planUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: StrategicPlan;
  try {
    updated = await updatePlan(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic plan ${planName(updated)} updated.`);
}

export async function activatePlanAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, planStatusSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: StrategicPlan;
  try {
    updated = await setPlanStatus(user.id, parsed.data.id, parsed.data.reason, 'active');
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic plan ${planName(updated)} activated.`);
}

export async function archivePlanAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, planStatusSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: StrategicPlan;
  try {
    updated = await setPlanStatus(user.id, parsed.data.id, parsed.data.reason, 'archived');
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic plan ${planName(updated)} archived.`);
}

export async function createInitiativeAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, initiativeCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('strategic_initiative', formData);
  const customError = customFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let created: StrategicInitiative;
  try {
    created = await createInitiative(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic initiative ${created.code} created.`);
}

export async function updateInitiativeAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, initiativeUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('strategic_initiative', formData);
  const customError = customFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let updated: StrategicInitiative;
  try {
    updated = await updateInitiative(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic initiative ${updated.code} updated.`);
}

export async function voidInitiativeAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, initiativeVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: StrategicInitiative;
  try {
    updated = await voidInitiative(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Strategic initiative ${updated.code} voided.`);
}
