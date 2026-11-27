'use server';

import { and, eq, ilike, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  ijinPrinsipRecords,
  projects,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type IjinPrinsipRecord,
  type Project,
  type StrategicPlan,
} from '@/db/schema';
import {
  ijinPrinsipSaveSchema,
  projectCancelSchema,
  projectCreateSchema,
  projectUpdateSchema,
  type IjinPrinsipSaveInput,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from '@/domain/inputs';
import {
  CORRECTION_WRITE,
  isCorrectionAfterClose,
  updateAuditAction,
} from '@/domain/corrections';
import { requireCorrectionReason } from './correction-guards';
import { withCustomFields } from '@/domain/custom-fields';
import { formatEntityCode, validateProjectYears } from '@/domain/plan';
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

function projectSnapshot(project: Project): Record<string, unknown> {
  return {
    code: project.code,
    name: project.name,
    externalReference: project.externalReference,
    owner: project.owner,
    startFiscalYear: project.startFiscalYear,
    endFiscalYear: project.endFiscalYear,
    status: project.status,
    allocatedBudgetFullLife: project.allocatedBudgetFullLife,
    submittedPrice: project.submittedPrice,
    finalDealPrice: project.finalDealPrice,
    openingAllocated: project.openingAllocated,
    openingCommitted: project.openingCommitted,
    openingSpent: project.openingSpent,
    cancelledReason: project.cancelledReason,
  };
}

function ijinSnapshot(ijin: IjinPrinsipRecord): Record<string, unknown> {
  return {
    documentNumber: ijin.documentNumber,
    documentDate: ijin.documentDate,
    approvedAmount: ijin.approvedAmount,
    approver: ijin.approver,
    documentUrl: ijin.documentUrl,
    notes: ijin.notes,
  };
}

interface ProgramContext {
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}

async function loadProgramContext(programId: string): Promise<ProgramContext> {
  const rows = await getDb()
    .select({ program: annualPrograms, annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPrograms.id, programId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Originating program not found.');
  return row;
}

interface ProjectContext {
  project: Project;
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}

async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const rows = await getDb()
    .select({ project: projects, program: annualPrograms, annualPlan: annualPlans, strategicPlan: strategicPlans })
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

/**
 * Saving an ijin prinsip record doubles as its create form. A closed year only
 * corrects records that already exist (ADR-0007 §1), so the create branch keeps
 * refusing — it does not inherit the correction allowance.
 */
function requireIjinCreateContext(context: {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}): void {
  if (context.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (context.annualPlan.status === 'closed') {
    throw new FormError(
      'The fiscal year is closed; the ijin prinsip record cannot be created after the close.',
    );
  }
}

/**
 * The project-side editability guard. `allowClosed` is the correction path
 * (ADR-0007 §1): a closed fiscal year still accepts an in-place correction of a
 * project that already exists, with a reason. Creates, voids and cancellation
 * keep refusing.
 */
function requireEditableContext(
  context: { annualPlan: AnnualPlan; strategicPlan: StrategicPlan },
  options: { allowClosed?: boolean } = {},
): void {
  if (context.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (context.annualPlan.status === 'closed' && !options.allowClosed) {
    throw new FormError('The originating fiscal year is closed and read-only.');
  }
}

function requireActiveStrategicPlan(context: { strategicPlan: StrategicPlan }): void {
  if (context.strategicPlan.status !== 'active') {
    throw new FormError('Activate the strategic plan before creating projects.');
  }
}

function checkProjectYears(input: {
  startFiscalYear: number;
  endFiscalYear: number;
  programFiscalYear: number;
  horizon: { startFiscalYear: number; endFiscalYear: number };
}): void {
  const yearError = validateProjectYears({ ...input, horizon: input.horizon });
  if (yearError) throw new FormError(yearError);
  if (input.programFiscalYear < input.startFiscalYear || input.programFiscalYear > input.endFiscalYear) {
    throw new FormError("The originating program's fiscal year must fall inside the project's start and end years.");
  }
  if (input.startFiscalYear < input.programFiscalYear) {
    throw new FormError("A project cannot start before its originating program's fiscal year.");
  }
}

async function nextProjectCode(fiscalYear: number): Promise<string> {
  const prefix = `PRJ-${fiscalYear}-`;
  const rows = await getDb()
    .select({ code: projects.code })
    .from(projects)
    .where(ilike(projects.code, `${prefix}%`));
  let highest = 0;
  for (const row of rows) {
    const parsed = Number.parseInt(row.code.slice(prefix.length), 10);
    if (Number.isSafeInteger(parsed) && parsed > highest) highest = parsed;
  }
  return formatEntityCode('project', fiscalYear, highest + 1);
}

async function createProject(
  userId: string,
  input: ProjectCreateInput,
  custom: CustomFieldPayload,
): Promise<Project> {
  const context = await loadProgramContext(input.originatingProgramId);
  if (context.program.voidedAt) throw new FormError('The originating program is voided.');
  requireActiveStrategicPlan(context);
  requireEditableContext(context);
  checkProjectYears({
    startFiscalYear: input.startFiscalYear,
    endFiscalYear: input.endFiscalYear,
    programFiscalYear: context.annualPlan.fiscalYear,
    horizon: context.strategicPlan,
  });

  let created: Project | undefined;
  await getDb().transaction(async (tx) => {
    const code = input.code ?? (await nextProjectCode(input.startFiscalYear));
    const duplicate = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.code, code))
      .limit(1);
    if (duplicate.length > 0) throw new FormError(`Project code ${code} is already used.`);

    const [row] = await tx
      .insert(projects)
      .values({
        originatingProgramId: context.program.id,
        code,
        externalReference: input.externalReference,
        name: input.name,
        description: input.description,
        owner: input.owner,
        startFiscalYear: input.startFiscalYear,
        endFiscalYear: input.endFiscalYear,
        allocatedBudgetFullLife: input.allocatedBudgetFullLife,
        submittedPrice: input.submittedPrice,
        finalDealPrice: input.finalDealPrice,
        openingAllocated: input.openingAllocated,
        openingCommitted: input.openingCommitted,
        openingSpent: input.openingSpent,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!row) throw new Error('failed to create the project');
    created = row;
    await saveCustomFieldValues(tx, {
      entityType: 'project',
      entityId: row.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'project',
      entityId: row.id,
      after: withCustomFields(projectSnapshot(row), custom.fields, custom.values),
    });
  });
  if (!created) throw new Error('failed to create the project');
  return created;
}

async function updateProject(
  userId: string,
  input: ProjectUpdateInput,
  custom: CustomFieldPayload,
): Promise<Project> {
  const context = await loadProjectContext(input.id);
  if (context.project.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
  requireEditableContext(context, CORRECTION_WRITE);
  // ADR-0007 §5: the originating plan's status at write time names the audit
  // action, so a closed year records exactly one `correction` entry.
  const auditAction = updateAuditAction(context.annualPlan);
  requireCorrectionReason(context.annualPlan, input.reason);
  checkProjectYears({
    startFiscalYear: input.startFiscalYear,
    endFiscalYear: input.endFiscalYear,
    programFiscalYear: context.annualPlan.fiscalYear,
    horizon: context.strategicPlan,
  });

  let updated: Project | undefined;
  await getDb().transaction(async (tx) => {
    const beforeValues = await readCustomFieldValues('project', input.id, tx);
    const duplicate = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.code, input.code), ne(projects.id, input.id)))
      .limit(1);
    if (duplicate.length > 0) throw new FormError(`Project code ${input.code} is already used.`);

    const [row] = await tx
      .update(projects)
      .set({
        code: input.code,
        externalReference: input.externalReference,
        name: input.name,
        description: input.description,
        owner: input.owner,
        startFiscalYear: input.startFiscalYear,
        endFiscalYear: input.endFiscalYear,
        allocatedBudgetFullLife: input.allocatedBudgetFullLife,
        submittedPrice: input.submittedPrice,
        finalDealPrice: input.finalDealPrice,
        openingAllocated: input.openingAllocated,
        openingCommitted: input.openingCommitted,
        openingSpent: input.openingSpent,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.id))
      .returning();
    if (!row) throw new FormError('Project not found.');
    updated = row;
    await saveCustomFieldValues(tx, {
      entityType: 'project',
      entityId: input.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: auditAction,
      entityType: 'project',
      entityId: input.id,
      before: withCustomFields(projectSnapshot(context.project), custom.fields, beforeValues),
      after: withCustomFields(projectSnapshot(row), custom.fields, custom.values),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Project not found.');
  return updated;
}

async function cancelProject(userId: string, id: string, reason: string): Promise<Project> {
  const context = await loadProjectContext(id);
  if (context.project.status === 'cancelled') throw new FormError('This project is already cancelled.');
  requireEditableContext(context);

  let updated: Project | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(projects)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledReason: reason,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    if (!row) throw new FormError('Project not found.');
    updated = row;
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'project',
      entityId: id,
      before: projectSnapshot(context.project),
      after: projectSnapshot(row),
      reason,
    });
  });
  if (!updated) throw new FormError('Project not found.');
  return updated;
}

async function saveIjinPrinsip(
  userId: string,
  input: IjinPrinsipSaveInput,
  custom: CustomFieldPayload,
): Promise<string> {
  const context = await loadProjectContext(input.projectId);
  if (context.project.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }

  const existingRows = await getDb()
    .select()
    .from(ijinPrinsipRecords)
    .where(eq(ijinPrinsipRecords.projectId, input.projectId))
    .limit(1);
  const existing = existingRows[0] ?? null;

  // A correction corrects a record that already exists (ADR-0007 §1), so the
  // create fallback keeps refusing in a closed year while the rewrite is the
  // correction path.
  if (existing) {
    requireEditableContext(context, CORRECTION_WRITE);
    requireCorrectionReason(context.annualPlan, input.reason);
    // An open year keeps its own ijin wording; the correction rule above already
    // refused a closed-year rewrite without a reason.
    if (
      !isCorrectionAfterClose(context.annualPlan) &&
      (!input.reason || input.reason.trim().length < 3)
    ) {
      throw new FormError('Give a reason for changing the ijin prinsip record.');
    }
  } else {
    requireIjinCreateContext(context);
  }
  // ADR-0007 §5: the governing plan's status at write time names the audit
  // action of the rewrite; only the create branch keeps the plain `create`.
  const updateAction = updateAuditAction(context.annualPlan);

  await getDb().transaction(async (tx) => {
    const values = {
      documentNumber: input.documentNumber,
      documentDate: input.documentDate,
      approvedAmount: input.approvedAmount,
      approver: input.approver,
      documentUrl: input.documentUrl,
      notes: input.notes,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    if (existing) {
      const beforeValues = await readCustomFieldValues('ijin_prinsip', existing.id, tx);
      const [updated] = await tx
        .update(ijinPrinsipRecords)
        .set(values)
        .where(eq(ijinPrinsipRecords.id, existing.id))
        .returning();
      if (!updated) throw new FormError('Ijin prinsip record not found.');
      await saveCustomFieldValues(tx, {
        entityType: 'ijin_prinsip',
        entityId: updated.id,
        fields: custom.fields,
        values: custom.values,
        userId,
      });
      await recordAudit(tx, {
        actorUserId: userId,
        action: updateAction,
        entityType: 'ijin_prinsip',
        entityId: updated.id,
        before: withCustomFields(ijinSnapshot(existing), custom.fields, beforeValues),
        after: withCustomFields(ijinSnapshot(updated), custom.fields, custom.values),
        reason: input.reason ?? null,
      });
      return;
    }

    const [created] = await tx
      .insert(ijinPrinsipRecords)
      .values({ projectId: input.projectId, ...values, createdBy: userId })
      .returning();
    if (!created) throw new Error('failed to save the ijin prinsip record');
    await saveCustomFieldValues(tx, {
      entityType: 'ijin_prinsip',
      entityId: created.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'ijin_prinsip',
      entityId: created.id,
      after: withCustomFields(ijinSnapshot(created), custom.fields, custom.values),
    });
  });
  return context.project.code;
}

// ---------------------------------------------------------------- actions

export async function createProjectAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, projectCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('project', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let created: Project;
  try {
    created = await createProject(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PROJECTS_PAGE, `Project ${created.code} created.`);
}

export async function updateProjectAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, projectUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('project', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let updated: Project;
  try {
    updated = await updateProject(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(`${PROJECTS_PAGE}/${parsed.data.id}`, `Project ${updated.code} updated.`);
}

export async function cancelProjectAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, projectCancelSchema, formData);
  if (!parsed.ok) return parsed.state;

  let cancelled: Project;
  try {
    cancelled = await cancelProject(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(`${PROJECTS_PAGE}/${parsed.data.id}`, `Project ${cancelled.code} cancelled.`);
}

export async function saveIjinPrinsipAction(previous: FormState, formData: FormData): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, ijinPrinsipSaveSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('ijin_prinsip', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let projectCode: string;
  try {
    projectCode = await saveIjinPrinsip(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PROJECTS_PAGE}/${parsed.data.projectId}`,
    `Ijin prinsip for ${projectCode} saved.`,
  );
}
