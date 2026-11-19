import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  openingBalanceReconciliations,
  projects,
  strategicInitiatives,
  type AnnualProgram,
  type AnnualPlan,
  type OpeningBalanceReconciliation,
  type StrategicPlan,
} from '@/db/schema';
import type { EnvelopeCheck } from '@/domain/plan';
import { listInitiativeEnvelopeRows } from './queries';
import type { OpeningLoadContext } from './opening-load';
import { listProjects, type ProjectListRow } from './project-queries';

/**
 * Opening-balance reconciliation data (charter §6.9, ADR-0003 §5).
 * Opening figures are entered on the entity forms (SI, program, project); this
 * module aggregates them for the one-time sign-off view.
 */

export interface OpeningInitiativeRow {
  id: string;
  code: string;
  name: string;
  envelopeAmount: number;
  priorProgramBudgetUsed: number;
  programBudget: number;
  check: EnvelopeCheck;
}

export interface OpeningProgramRow {
  program: AnnualProgram;
  fiscalYear: number;
  siCode: string;
  siName: string;
  capexAvailable: number;
  opexAvailable: number;
}

export interface OpeningBalancesOverview {
  initiatives: OpeningInitiativeRow[];
  programs: OpeningProgramRow[];
  projects: ProjectListRow[];
  totals: {
    envelope: number;
    priorProgramBudgetUsed: number;
    inAppProgramBudgets: number;
    programCarryInCapex: number;
    programCarryInOpex: number;
    projectOpeningAllocated: number;
    projectOpeningCommitted: number;
    projectOpeningSpent: number;
    projectFullLifeAllocated: number;
  };
}

export async function getOpeningBalancesOverview(planId: string): Promise<OpeningBalancesOverview> {
  const db = getDb();

  const initiativeRows = await listInitiativeEnvelopeRows(planId);
  const initiatives: OpeningInitiativeRow[] = initiativeRows.map((row) => ({
    id: row.initiative.id,
    code: row.initiative.code,
    name: row.initiative.name,
    envelopeAmount: row.initiative.envelopeAmount,
    priorProgramBudgetUsed: row.initiative.priorProgramBudgetUsed,
    programBudget: row.programBudget,
    check: row.check,
  }));

  const programRows = await db
    .select({
      program: annualPrograms,
      fiscalYear: annualPlans.fiscalYear,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)))
    .orderBy(asc(annualPlans.fiscalYear), asc(annualPrograms.code));

  const programs: OpeningProgramRow[] = programRows.map((row) => ({
    program: row.program,
    fiscalYear: row.fiscalYear,
    siCode: row.siCode,
    siName: row.siName,
    capexAvailable: row.program.capexBudget + row.program.carryInCapex,
    opexAvailable: row.program.opexBudget + row.program.carryInOpex,
  }));

  const projects = await listProjects(planId);

  const totals = {
    envelope: initiatives.reduce((sum, row) => sum + row.envelopeAmount, 0),
    priorProgramBudgetUsed: initiatives.reduce((sum, row) => sum + row.priorProgramBudgetUsed, 0),
    inAppProgramBudgets: initiatives.reduce((sum, row) => sum + row.programBudget, 0),
    programCarryInCapex: programs.reduce((sum, row) => sum + row.program.carryInCapex, 0),
    programCarryInOpex: programs.reduce((sum, row) => sum + row.program.carryInOpex, 0),
    projectOpeningAllocated: projects.reduce((sum, row) => sum + row.project.openingAllocated, 0),
    projectOpeningCommitted: projects.reduce((sum, row) => sum + row.project.openingCommitted, 0),
    projectOpeningSpent: projects.reduce((sum, row) => sum + row.project.openingSpent, 0),
    projectFullLifeAllocated: projects.reduce((sum, row) => sum + row.project.allocatedBudgetFullLife, 0),
  };

  return { initiatives, programs, projects, totals };
}

// ---------------------------------------------------------------- W3b load scene

export interface OpeningLoadScene {
  annualPlan: AnnualPlan | null;
  context: OpeningLoadContext | null;
  counts: {
    initiatives: number;
    programs: number;
    projects: number;
  };
}

/**
 * The current state the opening-import wizard loads into: the first in-app
 * annual plan, the code maps the planner resolves against, and the record counts
 * shown on the checklist.
 */
export async function getOpeningLoadScene(plan: StrategicPlan): Promise<OpeningLoadScene> {
  const db = getDb();
  const targetFiscalYear = plan.startFiscalYear + 1;

  const annualPlanRows = await db
    .select()
    .from(annualPlans)
    .where(and(eq(annualPlans.planId, plan.id), eq(annualPlans.fiscalYear, targetFiscalYear)))
    .limit(1);
  const annualPlan = annualPlanRows[0] ?? null;

  const initiativeRows = await db
    .select({ id: strategicInitiatives.id, code: strategicInitiatives.code })
    .from(strategicInitiatives)
    .where(and(eq(strategicInitiatives.planId, plan.id), isNull(strategicInitiatives.voidedAt)));

  const programRows = annualPlan
    ? await db
        .select({ id: annualPrograms.id, code: annualPrograms.code })
        .from(annualPrograms)
        .where(and(eq(annualPrograms.annualPlanId, annualPlan.id), isNull(annualPrograms.voidedAt)))
    : [];

  const projectRows = await db
    .select({ code: projects.code })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(eq(annualPlans.planId, plan.id));

  const context = annualPlan
    ? {
        planId: plan.id,
        annualPlanId: annualPlan.id,
        annualPlanFiscalYear: annualPlan.fiscalYear,
        planStartFiscalYear: plan.startFiscalYear,
        planEndFiscalYear: plan.endFiscalYear,
        initiativeIdByCode: new Map(initiativeRows.map((row) => [row.code, row.id])),
        programIdByCode: new Map(programRows.map((row) => [row.code, row.id])),
        existingInitiativeCodes: new Set(initiativeRows.map((row) => row.code)),
        existingProgramCodes: new Set(programRows.map((row) => row.code)),
        existingProjectCodes: new Set(projectRows.map((row) => row.code)),
      }
    : null;

  return {
    annualPlan,
    context,
    counts: {
      initiatives: initiativeRows.length,
      programs: programRows.length,
      projects: projectRows.length,
    },
  };
}

export async function getOpeningReconciliation(
  planId: string,
): Promise<OpeningBalanceReconciliation | null> {
  const rows = await getDb()
    .select()
    .from(openingBalanceReconciliations)
    .where(eq(openingBalanceReconciliations.planId, planId))
    .limit(1);
  return rows[0] ?? null;
}
