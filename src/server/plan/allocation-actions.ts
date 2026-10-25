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
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';

const PROJECTS_PAGE = '/plan/projects';

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

function requireAllocationEditable(context: AllocationContext): void {
  requireProjectEditable(context.project, context.strategicPlan.status);
}

function requireProjectActiveYear(project: Project, fiscalYear: number): void {
  if (project.startFiscalYear > fiscalYear || project.endFiscalYear < fiscalYear) {
    throw new FormError(
      `FY${fiscalYear} is outside the project's active years (${project.startFiscalYear}–${project.endFiscalYear}).`,
    );
  }
}

async function createAllocation(userId: string, input: AllocationCreateInput): Promise<void> {
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
      const [restored] = await tx
        .update(projectYearAllocations)
        .set({
          annualProgramId: target.program.id,
          allocationCapex: input.allocationCapex,
          allocationOpex: input.allocationOpex,
          carryInCapex: input.carryInCapex,
          carryInOpex: input.carryInOpex,
          notes: input.notes,
          voidedAt: null,
          voidedReason: null,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(projectYearAllocations.id, existing.id))
        .returning();
      if (!restored) throw new Error('failed to restore the project year allocation');
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'restore',
        entityType: 'project_year_allocation',
        entityId: restored.id,
        before: snapshot(existing),
        after: snapshot(restored),
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
        carryInCapex: input.carryInCapex,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error('failed to create the project year allocation');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'project_year_allocation',
      entityId: created.id,
      after: snapshot(created),
    });
  });
}

async function updateAllocation(userId: string, input: AllocationUpdateInput): Promise<void> {
  const context = await loadAllocationContext(input.id);
  if (context.allocation.voidedAt) throw new FormError('This allocation is voided and read-only.');
  requireAllocationEditable(context);
  requireProjectActiveYear(context.project, context.annualPlan.fiscalYear);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(projectYearAllocations)
      .set({
        allocationCapex: input.allocationCapex,
        allocationOpex: input.allocationOpex,
        carryInCapex: input.carryInCapex,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectYearAllocations.id, input.id))
      .returning();
    if (!updated) throw new FormError('Project year allocation not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'project_year_allocation',
      entityId: input.id,
      before: snapshot(context.allocation),
      after: snapshot(updated),
      reason: input.reason,
    });
  });
}

async function voidAllocation(userId: string, id: string, reason: string): Promise<void> {
  const context = await loadAllocationContext(id);
  if (context.allocation.voidedAt) throw new FormError('This allocation is already voided.');
  requireAllocationEditable(context);
  if (context.annualPlan.status === 'closed') {
    throw new FormError('This fiscal year is closed; allocations cannot be voided.');
  }

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(projectYearAllocations)
      .set({
        voidedAt: new Date(),
        voidedReason: reason,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(projectYearAllocations.id, id))
      .returning();
    if (!updated) throw new FormError('Project year allocation not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'project_year_allocation',
      entityId: id,
      before: snapshot(context.allocation),
      after: snapshot(updated),
      reason,
    });
  });
}

// ---------------------------------------------------------------- actions

export async function createAllocationAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(allocationCreateSchema, formData);
    projectId = input.projectId;
    await createAllocation(user.id, input);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Project year allocation saved.');
}

export async function updateAllocationAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(allocationUpdateSchema, formData);
    const context = await loadAllocationContext(input.id);
    projectId = context.project.id;
    await updateAllocation(user.id, input);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Project year allocation updated.');
}

export async function voidAllocationAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  let projectId = '';
  try {
    const input = parseForm(allocationVoidSchema, formData);
    const context = await loadAllocationContext(input.id);
    projectId = context.project.id;
    await voidAllocation(user.id, input.id, input.reason);
  } catch (error) {
    failWith(projectId ? `${PROJECTS_PAGE}/${projectId}` : PROJECTS_PAGE, describeError(error));
  }
  finishWith(`${PROJECTS_PAGE}/${projectId}`, 'Project year allocation voided.');
}
