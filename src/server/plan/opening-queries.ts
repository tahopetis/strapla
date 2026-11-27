import { and, asc, eq, isNull, sql } from 'drizzle-orm';
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
import { envelopeCheck, type EnvelopeCheck } from '@/domain/plan';
import type { OpeningLoadContext } from './opening-load';
import { listProjects, type ProjectListRow } from './project-queries';

/**
 * The one refusal the opening-balance writes share (#109, ADR-0008 §7): the
 * import and the sign-off are first-plan-only, so a successor plan starts
 * without them. Kept here so both actions say exactly the same thing.
 */
export const FIRST_PLAN_ONLY_WRITE_REFUSAL =
  'Opening balances are recorded once, for the first plan.';

/**
 * Opening-balance reconciliation data (charter §6.9, ADR-0003 §5).
 * Opening figures are entered on the entity forms (SI, program, project); this
 * module aggregates them for the one-time sign-off view.
 */

export interface OpeningInitiativeRow {
  id: string;
  code: string;
  name: string;
  envelopeCapex: number;
  envelopeOpex: number;
  priorProgramBudgetUsedCapex: number;
  priorProgramBudgetUsedOpex: number;
  programCapex: number;
  programOpex: number;
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
    envelopeCapex: number;
    envelopeOpex: number;
    priorProgramBudgetUsedCapex: number;
    priorProgramBudgetUsedOpex: number;
    /** In-app program budgets (capex + opex); the control total is combined. */
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

  // Opening figures are the go-live baseline: the per-component check and the
  // control totals use the program budgets as recorded at opening, not the
  // effective budgets later revision deltas produce (ADR-0006 §5).
  const [initiativeRows, initialBudgetRows] = await Promise.all([
    db
      .select()
      .from(strategicInitiatives)
      .where(and(eq(strategicInitiatives.planId, planId), isNull(strategicInitiatives.voidedAt)))
      .orderBy(asc(strategicInitiatives.code)),
    db
      .select({
        siId: annualPrograms.siId,
        capex: sql<string>`coalesce(sum(${annualPrograms.capexBudget}), 0)::text`,
        opex: sql<string>`coalesce(sum(${annualPrograms.opexBudget}), 0)::text`,
      })
      .from(annualPrograms)
      .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
      .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)))
      .groupBy(annualPrograms.siId),
  ]);
  const initialBudgets = new Map(
    initialBudgetRows.map((row) => [
      row.siId,
      { capex: Number(row.capex ?? '0'), opex: Number(row.opex ?? '0') },
    ]),
  );
  const initiatives: OpeningInitiativeRow[] = initiativeRows.map((initiative) => {
    const budgets = initialBudgets.get(initiative.id) ?? { capex: 0, opex: 0 };
    return {
      id: initiative.id,
      code: initiative.code,
      name: initiative.name,
      envelopeCapex: initiative.envelopeCapex,
      envelopeOpex: initiative.envelopeOpex,
      priorProgramBudgetUsedCapex: initiative.priorProgramBudgetUsedCapex,
      priorProgramBudgetUsedOpex: initiative.priorProgramBudgetUsedOpex,
      programCapex: budgets.capex,
      programOpex: budgets.opex,
      check: envelopeCheck({
        envelopeCapex: initiative.envelopeCapex,
        envelopeOpex: initiative.envelopeOpex,
        priorCapex: initiative.priorProgramBudgetUsedCapex,
        priorOpex: initiative.priorProgramBudgetUsedOpex,
        programCapex: [budgets.capex],
        programOpex: [budgets.opex],
      }),
    };
  });

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
    envelopeCapex: initiatives.reduce((sum, row) => sum + row.envelopeCapex, 0),
    envelopeOpex: initiatives.reduce((sum, row) => sum + row.envelopeOpex, 0),
    priorProgramBudgetUsedCapex: initiatives.reduce(
      (sum, row) => sum + row.priorProgramBudgetUsedCapex,
      0,
    ),
    priorProgramBudgetUsedOpex: initiatives.reduce(
      (sum, row) => sum + row.priorProgramBudgetUsedOpex,
      0,
    ),
    inAppProgramBudgets: initiatives.reduce(
      (sum, row) => sum + row.programCapex + row.programOpex,
      0,
    ),
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
