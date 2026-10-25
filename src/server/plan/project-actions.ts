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
import { formatEntityCode, validateProjectYears } from '@/domain/plan';
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
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

async function createProject(userId: string, input: ProjectCreateInput): Promise<void> {
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

  await getDb().transaction(async (tx) => {
    const code = input.code ?? (await nextProjectCode(input.startFiscalYear));
    const duplicate = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.code, code))
      .limit(1);
    if (duplicate.length > 0) throw new FormError(`Project code ${code} is already used.`);

    const [created] = await tx
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
    if (!created) throw new Error('failed to create the project');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'project',
      entityId: created.id,
      after: projectSnapshot(created),
    });
  });
}

async function updateProject(userId: string, input: ProjectUpdateInput): Promise<void> {
  const context = await loadProjectContext(input.id);
  if (context.project.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
  requireEditableContext(context);
  checkProjectYears({
    startFiscalYear: input.startFiscalYear,
    endFiscalYear: input.endFiscalYear,
    programFiscalYear: context.annualPlan.fiscalYear,
    horizon: context.strategicPlan,
  });

  await getDb().transaction(async (tx) => {
    const duplicate = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.code, input.code), ne(projects.id, input.id)))
      .limit(1);
    if (duplicate.length > 0) throw new FormError(`Project code ${input.code} is already used.`);

    const [updated] = await tx
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
    if (!updated) throw new FormError('Project not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'project',
      entityId: input.id,
      before: projectSnapshot(context.project),
      after: projectSnapshot(updated),
      reason: input.reason,
    });
  });
}

async function cancelProject(userId: string, id: string, reason: string): Promise<void> {
  const context = await loadProjectContext(id);
  if (context.project.status === 'cancelled') throw new FormError('This project is already cancelled.');
  requireEditableContext(context);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
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
    if (!updated) throw new FormError('Project not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'project',
      entityId: id,
      before: projectSnapshot(context.project),
      after: projectSnapshot(updated),
      reason,
    });
  });
}

async function saveIjinPrinsip(userId: string, input: IjinPrinsipSaveInput): Promise<void> {
  const context = await loadProjectContext(input.projectId);
  if (context.project.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
  requireEditableContext(context);

  const existingRows = await getDb()
    .select()
    .from(ijinPrinsipRecords)
    .where(eq(ijinPrinsipRecords.projectId, input.projectId))
    .limit(1);
  const existing = existingRows[0] ?? null;

  if (existing && (!input.reason || input.reason.trim().length < 3)) {
    throw new FormError('Give a reason for changing the ijin prinsip record.');
  }

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
      const [updated] = await tx
        .update(ijinPrinsipRecords)
        .set(values)
        .where(eq(ijinPrinsipRecords.id, existing.id))
        .returning();
      if (!updated) throw new FormError('Ijin prinsip record not found.');
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'update',
        entityType: 'ijin_prinsip',
        entityId: updated.id,
        before: ijinSnapshot(existing),
        after: ijinSnapshot(updated),
        reason: input.reason ?? null,
      });
      return;
    }

    const [created] = await tx
      .insert(ijinPrinsipRecords)
      .values({ projectId: input.projectId, ...values, createdBy: userId })
      .returning();
    if (!created) throw new Error('failed to save the ijin prinsip record');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'ijin_prinsip',
      entityId: created.id,
      after: ijinSnapshot(created),
    });
  });
}

// ---------------------------------------------------------------- actions

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  try {
    await createProject(user.id, parseForm(projectCreateSchema, formData));
  } catch (error) {
    failWith(PROJECTS_PAGE, describeError(error));
  }
  finishWith(PROJECTS_PAGE, 'Project created.');
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(projectUpdateSchema, formData);
    projectId = input.id;
    await updateProject(user.id, input);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Project updated.');
}

export async function cancelProjectAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(projectCancelSchema, formData);
    projectId = input.id;
    await cancelProject(user.id, input.id, input.reason);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Project cancelled.');
}

export async function saveIjinPrinsipAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(ijinPrinsipSaveSchema, formData);
    projectId = input.projectId;
    await saveIjinPrinsip(user.id, input);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Ijin prinsip saved.');
}
