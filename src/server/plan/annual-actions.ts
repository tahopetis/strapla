'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projects,
  strategicInitiatives,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type StrategicPlan,
} from '@/db/schema';
import {
  annualPlanCreateSchema,
  annualPlanStatusSchema,
  programCreateSchema,
  programUpdateSchema,
  programVoidSchema,
  type AnnualPlanCreateInput,
  type ProgramCreateInput,
  type ProgramUpdateInput,
} from '@/domain/inputs';
import { withCustomFields } from '@/domain/custom-fields';
import { planContainsFiscalYear } from '@/domain/plan';
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

const ANNUAL_PAGE = '/plan/annual';

function annualPlanSnapshot(plan: AnnualPlan): Record<string, unknown> {
  return { fiscalYear: plan.fiscalYear, status: plan.status, notes: plan.notes };
}

function programSnapshot(program: AnnualProgram): Record<string, unknown> {
  return {
    code: program.code,
    name: program.name,
    siId: program.siId,
    prevProgramId: program.prevProgramId,
    capexBudget: program.capexBudget,
    opexBudget: program.opexBudget,
    carryInCapex: program.carryInCapex,
    carryInOpex: program.carryInOpex,
    notes: program.notes,
    voidedAt: program.voidedAt?.toISOString() ?? null,
  };
}

interface AnnualPlanWithStrategic {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}

async function loadAnnualPlan(id: string): Promise<AnnualPlanWithStrategic> {
  const rows = await getDb()
    .select({ annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Annual plan not found.');
  return row;
}

async function requireEditableAnnualPlan(
  id: string,
  options: { allowClosed?: boolean } = {},
): Promise<AnnualPlanWithStrategic> {
  const loaded = await loadAnnualPlan(id);
  if (loaded.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (loaded.annualPlan.status === 'closed' && !options.allowClosed) {
    throw new FormError('This fiscal year is closed and read-only.');
  }
  return loaded;
}

async function createAnnualPlan(
  userId: string,
  input: AnnualPlanCreateInput,
): Promise<AnnualPlan> {
  const strategicPlan = await getStrategicPlan(input.planId);
  if (!strategicPlan) throw new FormError('Strategic plan not found.');
  if (strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (strategicPlan.status !== 'active') {
    throw new FormError('Activate the strategic plan before creating annual plans.');
  }
  if (!planContainsFiscalYear(strategicPlan, input.fiscalYear)) {
    throw new FormError(
      `Fiscal year ${input.fiscalYear} is outside the plan horizon (${strategicPlan.startFiscalYear}–${strategicPlan.endFiscalYear}).`,
    );
  }

  let created: AnnualPlan | undefined;
  await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: annualPlans.id })
      .from(annualPlans)
      .where(eq(annualPlans.fiscalYear, input.fiscalYear))
      .limit(1);
    if (existing.length > 0) {
      throw new FormError(`An annual plan for FY${input.fiscalYear} already exists.`);
    }
    [created] = await tx
      .insert(annualPlans)
      .values({
        planId: input.planId,
        fiscalYear: input.fiscalYear,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the annual plan');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'annual_plan',
      entityId: created.id,
      after: annualPlanSnapshot(created),
    });
  });
  if (!created) throw new Error('failed to create the annual plan');
  return created;
}

async function activateAnnualPlan(
  userId: string,
  id: string,
  reason: string,
): Promise<AnnualPlan> {
  const loaded = await loadAnnualPlan(id);
  if (loaded.strategicPlan.status !== 'active') {
    throw new FormError('Activate the strategic plan before activating an annual plan.');
  }
  if (loaded.annualPlan.status === 'closed') throw new FormError('This fiscal year is closed.');
  if (loaded.annualPlan.status === 'active') {
    throw new FormError('This annual plan is already active.');
  }

  let updated: AnnualPlan | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(annualPlans)
      .set({ status: 'active', updatedBy: userId, updatedAt: new Date() })
      .where(eq(annualPlans.id, id))
      .returning();
    if (!updated) throw new FormError('Annual plan not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'status_change',
      entityType: 'annual_plan',
      entityId: id,
      before: annualPlanSnapshot(loaded.annualPlan),
      after: annualPlanSnapshot(updated),
      reason,
    });
  });
  if (!updated) throw new FormError('Annual plan not found.');
  return updated;
}

async function validateInitiative(
  siId: string,
  strategicPlanId: string,
): Promise<void> {
  const rows = await getDb()
    .select({
      id: strategicInitiatives.id,
      planId: strategicInitiatives.planId,
      voidedAt: strategicInitiatives.voidedAt,
    })
    .from(strategicInitiatives)
    .where(eq(strategicInitiatives.id, siId))
    .limit(1);
  const initiative = rows[0];
  if (!initiative) throw new FormError('Strategic initiative not found.');
  if (initiative.voidedAt) throw new FormError('That strategic initiative is voided.');
  if (initiative.planId !== strategicPlanId) {
    throw new FormError('The initiative belongs to a different strategic plan.');
  }
}

async function validateContinuation(input: {
  prevProgramId: string | null;
  programId?: string;
  siId: string;
  annualPlanId: string;
  strategicPlanId: string;
}): Promise<void> {
  if (!input.prevProgramId) return;
  if (input.programId && input.prevProgramId === input.programId) {
    throw new FormError('A program cannot continue itself.');
  }
  const rows = await getDb()
    .select({
      id: annualPrograms.id,
      siId: annualPrograms.siId,
      voidedAt: annualPrograms.voidedAt,
      annualPlanId: annualPlans.id,
      fiscalYear: annualPlans.fiscalYear,
      planId: annualPlans.planId,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(eq(annualPrograms.id, input.prevProgramId))
    .limit(1);
  const previous = rows[0];
  if (!previous) throw new FormError('The program to continue was not found.');
  if (previous.voidedAt) throw new FormError('The program to continue is voided.');
  if (previous.planId !== input.strategicPlanId) {
    throw new FormError('The program to continue belongs to a different strategic plan.');
  }
  if (previous.siId !== input.siId) {
    throw new FormError('The continuing program must be linked to the same strategic initiative.');
  }
  const target = await loadAnnualPlan(input.annualPlanId);
  if (previous.fiscalYear >= target.annualPlan.fiscalYear) {
    throw new FormError('A program can only continue a program from an earlier fiscal year.');
  }
}

async function createProgram(
  userId: string,
  input: ProgramCreateInput,
  custom: CustomFieldPayload,
): Promise<AnnualProgram> {
  const { annualPlan, strategicPlan } = await requireEditableAnnualPlan(input.annualPlanId);
  await validateInitiative(input.siId, strategicPlan.id);
  await validateContinuation({
    prevProgramId: input.prevProgramId,
    siId: input.siId,
    annualPlanId: annualPlan.id,
    strategicPlanId: strategicPlan.id,
  });

  let created: AnnualProgram | undefined;
  await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: annualPrograms.id })
      .from(annualPrograms)
      .where(
        and(
          eq(annualPrograms.annualPlanId, annualPlan.id),
          eq(annualPrograms.code, input.code),
          isNull(annualPrograms.voidedAt),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new FormError(`Program code ${input.code} is already used in FY${annualPlan.fiscalYear}.`);
    }
    [created] = await tx
      .insert(annualPrograms)
      .values({
        annualPlanId: annualPlan.id,
        siId: input.siId,
        prevProgramId: input.prevProgramId,
        code: input.code,
        name: input.name,
        capexBudget: input.capexBudget,
        opexBudget: input.opexBudget,
        carryInCapex: input.carryInCapex,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the annual program');
    await saveCustomFieldValues(tx, {
      entityType: 'annual_program',
      entityId: created.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'annual_program',
      entityId: created.id,
      after: withCustomFields(programSnapshot(created), custom.fields, custom.values),
    });
  });
  if (!created) throw new Error('failed to create the annual program');
  return created;
}

async function loadProgram(id: string): Promise<{
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}> {
  const rows = await getDb()
    .select({
      program: annualPrograms,
      annualPlan: annualPlans,
      strategicPlan: strategicPlans,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPrograms.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Annual program not found.');
  return row;
}

async function updateProgram(
  userId: string,
  input: ProgramUpdateInput,
  custom: CustomFieldPayload,
): Promise<AnnualProgram> {
  const loaded = await loadProgram(input.id);
  if (loaded.program.voidedAt) throw new FormError('This program is voided and read-only.');
  await requireEditableAnnualPlan(loaded.annualPlan.id);
  await validateInitiative(input.siId, loaded.strategicPlan.id);
  await validateContinuation({
    prevProgramId: input.prevProgramId,
    programId: loaded.program.id,
    siId: input.siId,
    annualPlanId: loaded.annualPlan.id,
    strategicPlanId: loaded.strategicPlan.id,
  });

  let updated: AnnualProgram | undefined;
  await getDb().transaction(async (tx) => {
    const beforeValues = await readCustomFieldValues('annual_program', input.id, tx);
    [updated] = await tx
      .update(annualPrograms)
      .set({
        siId: input.siId,
        prevProgramId: input.prevProgramId,
        code: input.code,
        name: input.name,
        capexBudget: input.capexBudget,
        opexBudget: input.opexBudget,
        carryInCapex: input.carryInCapex,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(annualPrograms.id, input.id))
      .returning();
    if (!updated) throw new FormError('Annual program not found.');
    await saveCustomFieldValues(tx, {
      entityType: 'annual_program',
      entityId: input.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'annual_program',
      entityId: input.id,
      before: withCustomFields(programSnapshot(loaded.program), custom.fields, beforeValues),
      after: withCustomFields(programSnapshot(updated), custom.fields, custom.values),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Annual program not found.');
  return updated;
}

async function voidProgram(userId: string, id: string, reason: string): Promise<AnnualProgram> {
  const loaded = await loadProgram(id);
  if (loaded.program.voidedAt) throw new FormError('This program is already voided.');
  await requireEditableAnnualPlan(loaded.annualPlan.id);

  const dependents = await getDb()
    .select({ id: annualPrograms.id })
    .from(annualPrograms)
    .where(and(eq(annualPrograms.prevProgramId, id), isNull(annualPrograms.voidedAt)))
    .limit(1);
  if (dependents.length > 0) {
    throw new FormError('A later program continues this one. Remove the continuation link first.');
  }
  const dependentProjects = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.originatingProgramId, id))
    .limit(1);
  if (dependentProjects.length > 0) {
    throw new FormError('This program has projects and cannot be voided.');
  }

  let updated: AnnualProgram | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(annualPrograms)
      .set({ voidedAt: new Date(), voidedReason: reason, updatedBy: userId, updatedAt: new Date() })
      .where(eq(annualPrograms.id, id))
      .returning();
    if (!updated) throw new FormError('Annual program not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'annual_program',
      entityId: id,
      before: programSnapshot(loaded.program),
      after: programSnapshot(updated),
      reason,
    });
  });
  if (!updated) throw new FormError('Annual program not found.');
  return updated;
}

// ---------------------------------------------------------------- actions

export async function createAnnualPlanAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, annualPlanCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let created: AnnualPlan;
  try {
    created = await createAnnualPlan(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(ANNUAL_PAGE, `Annual plan FY${created.fiscalYear} created.`);
}

export async function activateAnnualPlanAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, annualPlanStatusSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: AnnualPlan;
  try {
    updated = await activateAnnualPlan(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${ANNUAL_PAGE}/${updated.id}`,
    `Annual plan FY${updated.fiscalYear} activated.`,
  );
}

export async function createProgramAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, programCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('annual_program', formData);
  const customError = customFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let created: AnnualProgram;
  try {
    created = await createProgram(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${ANNUAL_PAGE}/${created.annualPlanId}`,
    `Annual program ${created.code} created.`,
  );
}

export async function updateProgramAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, programUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('annual_program', formData);
  const customError = customFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let updated: AnnualProgram;
  try {
    updated = await updateProgram(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${ANNUAL_PAGE}/${updated.annualPlanId}`,
    `Annual program ${updated.code} updated.`,
  );
}

export async function voidProgramAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, programVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: AnnualProgram;
  try {
    updated = await voidProgram(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${ANNUAL_PAGE}/${updated.annualPlanId}`,
    `Annual program ${updated.code} voided.`,
  );
}
