import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  ijinPrinsipRecords,
  projectYearAllocations,
  projects,
  strategicInitiatives,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type IjinPrinsipRecord,
  type Project,
  type StrategicPlan,
} from '@/db/schema';
import { projectFundingFlags, type FundingFlag } from '@/domain/funding';
import { pricingFlags, type PricingFlags } from '@/domain/plan';

/** Read queries for projects, ijin prinsip and their pricing flags (M1 #8). */

export interface ProjectListRow {
  project: Project;
  programCode: string;
  programFiscalYear: number;
  siCode: string;
  siName: string;
  ijin: IjinPrinsipRecord | null;
  flags: PricingFlags;
}

export async function listProjects(planId: string): Promise<ProjectListRow[]> {
  const rows = await getDb()
    .select({
      project: projects,
      programCode: annualPrograms.code,
      programFiscalYear: annualPlans.fiscalYear,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
      ijin: ijinPrinsipRecords,
    })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .leftJoin(ijinPrinsipRecords, eq(ijinPrinsipRecords.projectId, projects.id))
    .where(eq(annualPlans.planId, planId))
    .orderBy(asc(projects.code));

  return rows.map((row) => ({
    project: row.project,
    programCode: row.programCode,
    programFiscalYear: row.programFiscalYear,
    siCode: row.siCode,
    siName: row.siName,
    ijin: row.ijin,
    flags: pricingFlags({
      approvedBudget: row.ijin?.approvedAmount ?? null,
      submittedPrice: row.project.submittedPrice,
      finalDealPrice: row.project.finalDealPrice,
    }),
  }));
}

export interface ProjectDetail {
  project: Project;
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  siCode: string;
  siName: string;
  ijin: IjinPrinsipRecord | null;
  flags: PricingFlags;
  fundingFlags: FundingFlag[];
  totalAllocated: number;
  lifetimeCommitments: number;
}

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const rows = await getDb()
    .select({
      project: projects,
      program: annualPrograms,
      annualPlan: annualPlans,
      strategicPlan: strategicPlans,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
      ijin: ijinPrinsipRecords,
    })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .leftJoin(ijinPrinsipRecords, eq(ijinPrinsipRecords.projectId, projects.id))
    .where(eq(projects.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const allocationRows = await getDb()
    .select({
      allocationCapex: projectYearAllocations.allocationCapex,
      allocationOpex: projectYearAllocations.allocationOpex,
    })
    .from(projectYearAllocations)
    .where(
      and(eq(projectYearAllocations.projectId, id), isNull(projectYearAllocations.voidedAt)),
    );

  const totalAllocated = allocationRows.reduce(
    (sum, allocation) => sum + allocation.allocationCapex + allocation.allocationOpex,
    0,
  );
  const lifetimeCommitments = row.project.openingCommitted;

  return {
    project: row.project,
    program: row.program,
    annualPlan: row.annualPlan,
    strategicPlan: row.strategicPlan,
    siCode: row.siCode,
    siName: row.siName,
    ijin: row.ijin,
    flags: pricingFlags({
      approvedBudget: row.ijin?.approvedAmount ?? null,
      submittedPrice: row.project.submittedPrice,
      finalDealPrice: row.project.finalDealPrice,
    }),
    fundingFlags: projectFundingFlags({
      approvedBudget: row.ijin?.approvedAmount ?? null,
      submittedPrice: row.project.submittedPrice,
      finalDealPrice: row.project.finalDealPrice,
      openingCommitted: row.project.openingCommitted,
      inAppCommitments: 0,
      allocatedFullLife: row.project.allocatedBudgetFullLife,
      totalAllocated,
    }),
    totalAllocated,
    lifetimeCommitments,
  };
}

export async function listProgramOptions(planId: string): Promise<Array<{ value: string; label: string }>> {
  const rows = await getDb()
    .select({
      id: annualPrograms.id,
      code: annualPrograms.code,
      name: annualPrograms.name,
      fiscalYear: annualPlans.fiscalYear,
      siCode: strategicInitiatives.code,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)))
    .orderBy(asc(annualPlans.fiscalYear), asc(annualPrograms.code));

  return rows.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.name} (FY${row.fiscalYear}, ${row.siCode})`,
  }));
}
