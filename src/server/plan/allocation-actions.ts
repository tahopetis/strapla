'use server';

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projectYearAllocations,
  projects,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type Project,
  type ProjectYearAllocation,
  type StrategicPlan,
} from '@/db/schema';
import {
  allocationCreateSchema,
  allocationUpdateSchema,
  allocationVoidSchema,
  type AllocationCreateInput,
  type AllocationUpdateInput,
} from '@/domain/inputs';
import {
  CORRECTION_WRITE,
} from '@/domain/corrections';
import { correctionAuditAction } from './correction-guards';
import { withCustomFields } from '@/domain/custom-fields';
import { isComponentShift } from '@/domain/revisions';
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  invalidCustomFieldState,
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

const PROJECTS_PAGE = '/plan/projects';

interface AllocationSaveResult {
  allocation: ProjectYearAllocation;
  fiscalYear: number;
}

function snapshot(allocation: ProjectYearAllocation): Record<string, unknown> {
  return {
    projectId: allocation.projectId,
    annualPlanId: allocation.annualPlanId,
    annualProgramId: allocation.annualProgramId,
    allocationCapex: allocation.allocationCapex,
    allocationOpex: allocation.allocationOpex,
    carryInCapex: allocation.carryInCapex,
    carryInOpex: allocation.carryInOpex,
    notes: allocation.notes,
    voidedAt: allocation.voidedAt?.toISOString() ?? null,
  };
}

interface ProjectContext {
  project: Project;
  originatingSiId: string;
  planId: string;
  strategicPlanStatus: StrategicPlan['status'];
}

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const rows = await getDb()
    .select({
      project: projects,
      originatingSiId: annualPrograms.siId,
      planId: annualPlans.planId,
      strategicPlanStatus: strategicPlans.status,
    })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Project not found.');
  return row;
}

interface AllocationContext {
  allocation: ProjectYearAllocation;
  project: Project;
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  originatingSiId: string;
}

async function loadAllocationContext(id: string): Promise<AllocationContext> {
  const rows = await getDb()
    .select({
      allocation: projectYearAllocations,
      project: projects,
      program: annualPrograms,
      annualPlan: annualPlans,
      strategicPlan: strategicPlans,
    })
    .from(projectYearAllocations)
    .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(projectYearAllocations.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) throw new FormError('Project year allocation not found.');

  const originatingRows = await getDb()
    .select({ siId: annualPrograms.siId })
    .from(annualPrograms)
    .where(eq(annualPrograms.id, row.project.originatingProgramId))
    .limit(1);

  return {
    ...row,
    originatingSiId: originatingRows[0]?.siId ?? row.program.siId,
  };
}

function requireProjectEditable(project: Project, strategicPlanStatus: StrategicPlan['status']): void {
  if (project.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
  if (strategicPlanStatus === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
}

/**
 * The allocation's editability guard. `allowClosed` is the correction path
 * (ADR-0007 §1): a closed fiscal year still accepts an in-place correction of an
 * allocation that already exists, with a reason. Only the six in-place update
 * operations pass it — a void keeps refusing, with its own wording.
 */
function requireAllocationEditable(
  context: AllocationContext,
  options: { allowClosed?: boolean } = {},
): void {
  requireProjectEditable(context.project, context.strategicPlan.status);
  if (context.annualPlan.status === 'closed' && !options.allowClosed) {
    throw new FormError('This fiscal year is closed and read-only.');
  }
}

/**
 * Capex and opex never shift into each other (ADR-0006 §4), on every path: an
 * allocation edit that raises one component while lowering the other is a
 * component shift, not an allocation change. This is the only refusal an
 * allocation correction adds; the warning-only flags keep their old semantics.
 */
function requireNoComponentShift(
  current: { allocationCapex: number; allocationOpex: number },
  next: { allocationCapex: number; allocationOpex: number },
): void {
  if (
    isComponentShift(
      { capex: current.allocationCapex, opex: current.allocationOpex },
      { capex: next.allocationCapex, opex: next.allocationOpex },
    )
  ) {
    throw new FormError(
      'Capex and opex never shift into each other: this change raises one component while lowering the other. Edit the components independently.',
    );
  }
}

function requireProjectActiveYear(project: Project, fiscalYear: number): void {
  if (project.startFiscalYear > fiscalYear || project.endFiscalYear < fiscalYear) {
    throw new FormError(
      `FY${fiscalYear} is outside the project's active years (${project.startFiscalYear}–${project.endFiscalYear}).`,
    );
  }
}

async function createAllocation(
  userId: string,
  input: AllocationCreateInput,
  custom: CustomFieldPayload,
): Promise<AllocationSaveResult> {
  const context = await loadProjectContext(input.projectId);
  requireProjectEditable(context.project, context.strategicPlanStatus);

  const programRows = await getDb()
    .select({
      program: annualPrograms,
      annualPlan: annualPlans,
      strategicPlan: strategicPlans,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPrograms.id, input.annualProgramId))
    .limit(1);
  const target = programRows[0];
  if (!target) throw new FormError('Annual program not found.');
  if (target.program.voidedAt) throw new FormError('That annual program is voided.');
  if (target.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (target.annualPlan.status === 'closed') {
    throw new FormError('That fiscal year is closed and read-only.');
  }
  if (target.annualPlan.planId !== context.planId) {
    throw new FormError('The program belongs to a different strategic plan.');
  }
  if (target.program.siId !== context.originatingSiId) {
    throw new FormError('The allocation must use a program for the same strategic initiative (BR-6).');
  }
  requireProjectActiveYear(context.project, target.annualPlan.fiscalYear);

  let allocation: ProjectYearAllocation | undefined;
  await getDb().transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(projectYearAllocations)
      .where(
        and(
          eq(projectYearAllocations.projectId, context.project.id),
          eq(projectYearAllocations.annualPlanId, target.annualPlan.id),
        ),
      )
      .limit(1);
    const existing = existingRows[0];

    if (existing && !existing.voidedAt) {
      throw new FormError(`An allocation for FY${target.annualPlan.fiscalYear} already exists.`);
    }

    if (existing) {
      const beforeValues = await readCustomFieldValues(
        'project_year_allocation',
        existing.id,
        tx,
      );
      const [restored] = await tx
        .update(projectYearAllocations)
        .set({
          annualProgramId: target.program.id,
          allocationCapex: input.allocationCapex,
          allocationOpex: input.allocationOpex,
          notes: input.notes,
          voidedAt: null,
          voidedReason: null,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(projectYearAllocations.id, existing.id))
        .returning();
      if (!restored) throw new Error('failed to restore the project year allocation');
      allocation = restored;
      await saveCustomFieldValues(tx, {
        entityType: 'project_year_allocation',
        entityId: restored.id,
        fields: custom.fields,
        values: custom.values,
        userId,
      });
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'restore',
        entityType: 'project_year_allocation',
        entityId: restored.id,
        before: withCustomFields(snapshot(existing), custom.fields, beforeValues),
        after: withCustomFields(snapshot(restored), custom.fields, custom.values),
      });
      return;
    }

    const [created] = await tx
      .insert(projectYearAllocations)
      .values({
        projectId: context.project.id,
        annualPlanId: target.annualPlan.id,
        annualProgramId: target.program.id,
        allocationCapex: input.allocationCapex,
        allocationOpex: input.allocationOpex,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the project year allocation');
    allocation = created;
    await saveCustomFieldValues(tx, {
      entityType: 'project_year_allocation',
      entityId: created.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'project_year_allocation',
      entityId: created.id,
      after: withCustomFields(snapshot(created), custom.fields, custom.values),
    });
  });
  if (!allocation) throw new Error('failed to save the project year allocation');
  return { allocation, fiscalYear: target.annualPlan.fiscalYear };
}

async function updateAllocation(
  userId: string,
  input: AllocationUpdateInput,
  custom: CustomFieldPayload,
): Promise<AllocationSaveResult> {
  const context = await loadAllocationContext(input.id);
  if (context.allocation.voidedAt) throw new FormError('This allocation is voided and read-only.');
  requireAllocationEditable(context, CORRECTION_WRITE);
  // ADR-0007 §5: the plan status names the audit action and a correction
  // needs its reason; one call keeps the six paths one rule.
  const auditAction = correctionAuditAction(context.annualPlan, input.reason);
  requireNoComponentShift(context.allocation, input);
  requireProjectActiveYear(context.project, context.annualPlan.fiscalYear);

  let updated: ProjectYearAllocation | undefined;
  await getDb().transaction(async (tx) => {
    const beforeValues = await readCustomFieldValues('project_year_allocation', input.id, tx);
    const [row] = await tx
      .update(projectYearAllocations)
      .set({
        allocationCapex: input.allocationCapex,
        allocationOpex: input.allocationOpex,
        notes: input.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectYearAllocations.id, input.id))
      .returning();
    if (!row) throw new FormError('Project year allocation not found.');
    updated = row;
    await saveCustomFieldValues(tx, {
      entityType: 'project_year_allocation',
      entityId: input.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: auditAction,
      entityType: 'project_year_allocation',
      entityId: input.id,
      before: withCustomFields(snapshot(context.allocation), custom.fields, beforeValues),
      after: withCustomFields(snapshot(row), custom.fields, custom.values),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Project year allocation not found.');
  return { allocation: updated, fiscalYear: context.annualPlan.fiscalYear };
}

async function voidAllocation(userId: string, id: string, reason: string): Promise<AllocationSaveResult> {
  const context = await loadAllocationContext(id);
  if (context.allocation.voidedAt) throw new FormError('This allocation is already voided.');
  // A void is not a correction (ADR-0007 §1): the closed-year refusal keeps its
  // own wording, ahead of the guard's general lock.
  if (context.annualPlan.status === 'closed') {
    throw new FormError('This fiscal year is closed; allocations cannot be voided.');
  }
  requireAllocationEditable(context);

  let updated: ProjectYearAllocation | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(projectYearAllocations)
      .set({
        voidedAt: new Date(),
        voidedReason: reason,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectYearAllocations.id, id))
      .returning();
    if (!row) throw new FormError('Project year allocation not found.');
    updated = row;
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'project_year_allocation',
      entityId: id,
      before: snapshot(context.allocation),
      after: snapshot(row),
      reason,
    });
  });
  if (!updated) throw new FormError('Project year allocation not found.');
  return { allocation: updated, fiscalYear: context.annualPlan.fiscalYear };
}

// ---------------------------------------------------------------- actions

export async function createAllocationAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, allocationCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('project_year_allocation', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let saved: AllocationSaveResult;
  try {
    saved = await createAllocation(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PROJECTS_PAGE}/${saved.allocation.projectId}`,
    `Project year allocation FY${saved.fiscalYear} created.`,
  );
}

export async function updateAllocationAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, allocationUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('project_year_allocation', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let saved: AllocationSaveResult;
  try {
    saved = await updateAllocation(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PROJECTS_PAGE}/${saved.allocation.projectId}`,
    `Project year allocation FY${saved.fiscalYear} updated.`,
  );
}

export async function voidAllocationAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, allocationVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let saved: AllocationSaveResult;
  try {
    saved = await voidAllocation(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PROJECTS_PAGE}/${saved.allocation.projectId}`,
    `Project year allocation FY${saved.fiscalYear} voided.`,
  );
}
