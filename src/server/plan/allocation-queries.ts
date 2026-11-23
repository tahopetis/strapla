import { and, asc, eq, gte, inArray, isNull, lte, notInArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projectYearAllocations,
  projects,
  strategicInitiatives,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type ProjectYearAllocation,
} from '@/db/schema';
import { allocationRemaining, type AllocationPosition } from '@/domain/funding';
import { getAllocationFunding } from './execution-queries';
import { getRevisionDeltasForEntities } from './revision-queries';

/** Read queries for project year allocations (M2 #12). */

export interface ProjectAllocationRow {
  allocation: ProjectYearAllocation;
  annualPlan: AnnualPlan;
  program: AnnualProgram;
  /** Allocation amount plus posted revision deltas (ADR-0006 §4). */
  effectiveCapex: number;
  effectiveOpex: number;
  position: AllocationPosition;
  br11Capex: boolean;
  br11Opex: boolean;
}

export async function listProjectAllocations(projectId: string): Promise<ProjectAllocationRow[]> {
  const rows = await getDb()
    .select({
      allocation: projectYearAllocations,
      annualPlan: annualPlans,
      program: annualPrograms,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .where(
      and(eq(projectYearAllocations.projectId, projectId), isNull(projectYearAllocations.voidedAt)),
    )
    .orderBy(asc(annualPlans.fiscalYear));

  return Promise.all(
    rows.map(async (row) => {
      const funding = await getAllocationFunding(row.allocation.id);
      return {
        allocation: row.allocation,
        annualPlan: row.annualPlan,
        program: row.program,
        effectiveCapex: funding?.effectiveAllocation.capex ?? row.allocation.allocationCapex,
        effectiveOpex: funding?.effectiveAllocation.opex ?? row.allocation.allocationOpex,
        position: funding
          ? { capex: funding.totals.remainingCapex, opex: funding.totals.remainingOpex }
          : allocationRemaining({
              allocationCapex: row.allocation.allocationCapex,
              allocationOpex: row.allocation.allocationOpex,
              carryInCapex: row.allocation.carryInCapex,
              carryInOpex: row.allocation.carryInOpex,
            }),
        br11Capex: funding?.totals.br11Capex ?? false,
        br11Opex: funding?.totals.br11Opex ?? false,
      };
    }),
  );
}

export interface AllocationProgramOptions {
  options: Array<{ value: string; label: string }>;
  totalAllocated: number;
  currentFiscalYears: number[];
}

/**
 * Programs a project can be allocated to: the same strategic initiative as the
 * originating program, inside the project's active fiscal years, not voided,
 * plan not archived and year not closed. Years that already have an allocation
 * are excluded (one allocation per project per fiscal year, BR-6).
 */
export async function listAllocationProgramOptions(
  projectId: string,
): Promise<AllocationProgramOptions> {
  const db = getDb();
  const projectRows = await db
    .select({
      project: projects,
      originatingSiId: annualPrograms.siId,
      planId: annualPlans.planId,
    })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  const project = projectRows[0];
  if (!project) return { options: [], totalAllocated: 0, currentFiscalYears: [] };

  const existing = await db
    .select({
      id: projectYearAllocations.id,
      annualPlanId: projectYearAllocations.annualPlanId,
      fiscalYear: annualPlans.fiscalYear,
      allocationCapex: projectYearAllocations.allocationCapex,
      allocationOpex: projectYearAllocations.allocationOpex,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(
      and(eq(projectYearAllocations.projectId, projectId), isNull(projectYearAllocations.voidedAt)),
    );

  const usedPlanIds = existing.map((row) => row.annualPlanId);
  const deltas = await getRevisionDeltasForEntities({
    allocationIds: existing.map((row) => row.id),
  });

  const programRows = await db
    .select({
      id: annualPrograms.id,
      code: annualPrograms.code,
      name: annualPrograms.name,
      fiscalYear: annualPlans.fiscalYear,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(
      and(
        eq(annualPlans.planId, project.planId),
        eq(annualPrograms.siId, project.originatingSiId),
        isNull(annualPrograms.voidedAt),
        isNull(strategicInitiatives.voidedAt),
        gte(annualPlans.fiscalYear, project.project.startFiscalYear),
        lte(annualPlans.fiscalYear, project.project.endFiscalYear),
        inArray(annualPlans.status, ['draft', 'active']),
        usedPlanIds.length > 0 ? notInArray(annualPlans.id, usedPlanIds) : undefined,
      ),
    )
    .orderBy(asc(annualPlans.fiscalYear), asc(annualPrograms.code));

  return {
    options: programRows.map((row) => ({
      value: row.id,
      label: `FY${row.fiscalYear} · ${row.code} · ${row.name}`,
    })),
    totalAllocated: existing.reduce((sum, row) => {
      const delta = deltas.byAllocation.get(row.id) ?? { capex: 0, opex: 0 };
      return sum + row.allocationCapex + delta.capex + row.allocationOpex + delta.opex;
    }, 0),
    currentFiscalYears: existing.map((row) => row.fiscalYear).sort((a, b) => a - b),
  };
}
