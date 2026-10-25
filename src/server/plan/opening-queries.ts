import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  strategicInitiatives,
  type AnnualProgram,
} from '@/db/schema';
import type { EnvelopeCheck } from '@/domain/plan';
import { listInitiativeEnvelopeRows } from './queries';
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
