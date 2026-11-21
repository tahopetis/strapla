import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  ijinPrinsipRecords,
  projectYearAllocations,
  projects,
  recurringOpsItems,
  spendCategories,
  strategicInitiatives,
  type AnnualPlan,
  type Project,
  type StrategicInitiative,
} from '@/db/schema';
import {
  programBudgetPosition,
  projectFundingFlags,
  type FundingFlag,
} from '@/domain/funding';
import { loadExecutionAggregates } from './execution-aggregates';

/**
 * Report queries for M2 #15. Commitments and spend are zero until M3; the
 * report shapes already carry those columns so M3 only changes the queries.
 */

function num(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

// ---------------------------------------------------------------- SI five-year

export interface SiFiveYearRow {
  initiative: StrategicInitiative;
  programCapex: number;
  programOpex: number;
  allocationCapex: number;
  allocationOpex: number;
  commitmentCapex: number;
  commitmentOpex: number;
  spendCapex: number;
  spendOpex: number;
  consumed: number;
  headroom: number;
  over: boolean;
}

export interface SiFiveYearReport {
  rows: SiFiveYearRow[];
  totals: {
    envelope: number;
    priorConsumed: number;
    programCapex: number;
    programOpex: number;
    allocationCapex: number;
    allocationOpex: number;
    consumed: number;
    headroom: number;
    over: boolean;
    commitmentCapex: number;
    commitmentOpex: number;
    spendCapex: number;
    spendOpex: number;
  };
}

export async function getSiFiveYearReport(planId: string): Promise<SiFiveYearReport> {
  const db = getDb();
  const initiatives = await db
    .select()
    .from(strategicInitiatives)
    .where(and(eq(strategicInitiatives.planId, planId), isNull(strategicInitiatives.voidedAt)))
    .orderBy(asc(strategicInitiatives.code));

  const programRows = await db
    .select({
      siId: annualPrograms.siId,
      capex: sql<string>`coalesce(sum(${annualPrograms.capexBudget}), 0)::text`,
      opex: sql<string>`coalesce(sum(${annualPrograms.opexBudget}), 0)::text`,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)))
    .groupBy(annualPrograms.siId);

  const allocationRows = await db
    .select({
      siId: annualPrograms.siId,
      capex: sql<string>`coalesce(sum(${projectYearAllocations.allocationCapex}), 0)::text`,
      opex: sql<string>`coalesce(sum(${projectYearAllocations.allocationOpex}), 0)::text`,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(
      and(
        eq(annualPlans.planId, planId),
        isNull(projectYearAllocations.voidedAt),
        isNull(annualPrograms.voidedAt),
      ),
    )
    .groupBy(annualPrograms.siId);

  const programMap = new Map(programRows.map((row) => [row.siId, row]));
  const allocationMap = new Map(allocationRows.map((row) => [row.siId, row]));
  const execution = await loadExecutionAggregates(planId);

  const rows: SiFiveYearRow[] = initiatives.map((initiative) => {
    const program = programMap.get(initiative.id);
    const allocation = allocationMap.get(initiative.id);
    const executionTotals = execution.bySi.get(initiative.id);
    const programCapex = num(program?.capex);
    const programOpex = num(program?.opex);
    const allocationCapex = num(allocation?.capex);
    const allocationOpex = num(allocation?.opex);
    const consumed = initiative.priorProgramBudgetUsed + programCapex + programOpex;
    const headroom = initiative.envelopeAmount - consumed;
    return {
      initiative,
      programCapex,
      programOpex,
      allocationCapex,
      allocationOpex,
      commitmentCapex: executionTotals?.commitmentCapex ?? 0,
      commitmentOpex: executionTotals?.commitmentOpex ?? 0,
      spendCapex: executionTotals?.spendCapex ?? 0,
      spendOpex: executionTotals?.spendOpex ?? 0,
      consumed,
      headroom,
      over: headroom < 0,
    };
  });

  const totals = rows.reduce(
    (total, row) => ({
      envelope: total.envelope + row.initiative.envelopeAmount,
      priorConsumed: total.priorConsumed + row.initiative.priorProgramBudgetUsed,
      programCapex: total.programCapex + row.programCapex,
      programOpex: total.programOpex + row.programOpex,
      allocationCapex: total.allocationCapex + row.allocationCapex,
      allocationOpex: total.allocationOpex + row.allocationOpex,
      consumed: total.consumed + row.consumed,
      headroom: total.headroom + row.headroom,
      commitmentCapex: total.commitmentCapex + row.commitmentCapex,
      commitmentOpex: total.commitmentOpex + row.commitmentOpex,
      spendCapex: total.spendCapex + row.spendCapex,
      spendOpex: total.spendOpex + row.spendOpex,
    }),
    {
      envelope: 0,
      priorConsumed: 0,
      programCapex: 0,
      programOpex: 0,
      allocationCapex: 0,
      allocationOpex: 0,
      consumed: 0,
      headroom: 0,
      commitmentCapex: 0,
      commitmentOpex: 0,
      spendCapex: 0,
      spendOpex: 0,
    },
  );

  return { rows, totals: { ...totals, over: totals.headroom < 0 } };
}

// ---------------------------------------------------------------- annual plan

export interface AnnualPlanProgramRow {
  /** Record id, used to attach custom-field values (#46). */
  programId: string;
  fiscalYear: number;
  planStatus: AnnualPlan['status'];
  programCode: string;
  programName: string;
  siCode: string;
  siName: string;
  capexBudget: number;
  opexBudget: number;
  carryInCapex: number;
  carryInOpex: number;
  allocatedCapex: number;
  allocatedOpex: number;
  commitmentCapex: number;
  commitmentOpex: number;
  spendCapex: number;
  spendOpex: number;
  crossYearCapex: number;
  crossYearOpex: number;
  priorOpeningCapex: number;
  priorOpeningOpex: number;
  /**
   * Post-close adjustments: closed-year settlements kept as a reserve in this
   * program's closed fiscal year (#98). Outside the locked close snapshot and
   * carry-over figures, which never change.
   */
  postCloseReserveCapex: number;
  postCloseReserveOpex: number;
  availableCapex: number;
  availableOpex: number;
  unallocatedCapex: number;
  unallocatedOpex: number;
  overCapex: boolean;
  overOpex: boolean;
}

export interface AnnualPlanRecurringOpsRow {
  /** Record id, used to attach custom-field values (#46). */
  itemId: string;
  fiscalYear: number;
  name: string;
  categoryName: string | null;
  opexBudget: number;
  carryInOpex: number;
  available: number;
  commitmentOpex: number;
  spendOpex: number;
  priorOpeningOpex: number;
  remainingOpex: number;
}

export interface AnnualPlanReport {
  programs: AnnualPlanProgramRow[];
  recurringOps: AnnualPlanRecurringOpsRow[];
  totals: {
    capexBudget: number;
    opexBudget: number;
    carryInCapex: number;
    carryInOpex: number;
    allocatedCapex: number;
    allocatedOpex: number;
    unallocatedCapex: number;
    unallocatedOpex: number;
    recurringOpexBudget: number;
    recurringCarryInOpex: number;
  };
}

export async function getAnnualPlanReport(planId: string): Promise<AnnualPlanReport> {
  const db = getDb();
  const execution = await loadExecutionAggregates(planId);

  const programRows = await db
    .select({
      fiscalYear: annualPlans.fiscalYear,
      planStatus: annualPlans.status,
      programCode: annualPrograms.code,
      programName: annualPrograms.name,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
      capexBudget: annualPrograms.capexBudget,
      opexBudget: annualPrograms.opexBudget,
      carryInCapex: annualPrograms.carryInCapex,
      carryInOpex: annualPrograms.carryInOpex,
      programId: annualPrograms.id,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)))
    .orderBy(asc(annualPlans.fiscalYear), asc(annualPrograms.code));

  const allocationRows = await db
    .select({
      programId: projectYearAllocations.annualProgramId,
      capex: sql<string>`coalesce(sum(${projectYearAllocations.allocationCapex}), 0)::text`,
      opex: sql<string>`coalesce(sum(${projectYearAllocations.allocationOpex}), 0)::text`,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(projectYearAllocations.voidedAt)))
    .groupBy(projectYearAllocations.annualProgramId);
  const allocationMap = new Map(allocationRows.map((row) => [row.programId, row]));

  const programs: AnnualPlanProgramRow[] = programRows.map((row) => {
    const allocation = allocationMap.get(row.programId);
    const allocatedCapex = num(allocation?.capex);
    const allocatedOpex = num(allocation?.opex);
    const position = programBudgetPosition({
      capexBudget: row.capexBudget,
      opexBudget: row.opexBudget,
      carryInCapex: row.carryInCapex,
      carryInOpex: row.carryInOpex,
      allocatedCapex,
      allocatedOpex,
    });
    return {
      programId: row.programId,
      fiscalYear: row.fiscalYear,
      planStatus: row.planStatus,
      programCode: row.programCode,
      programName: row.programName,
      siCode: row.siCode,
      siName: row.siName,
      capexBudget: row.capexBudget,
      opexBudget: row.opexBudget,
      carryInCapex: row.carryInCapex,
      carryInOpex: row.carryInOpex,
      allocatedCapex,
      allocatedOpex,
      commitmentCapex: execution.byProgram.get(row.programId)?.commitmentCapex ?? 0,
      commitmentOpex: execution.byProgram.get(row.programId)?.commitmentOpex ?? 0,
      spendCapex: execution.byProgram.get(row.programId)?.spendCapex ?? 0,
      spendOpex: execution.byProgram.get(row.programId)?.spendOpex ?? 0,
      crossYearCapex: execution.byProgram.get(row.programId)?.crossYearCapex ?? 0,
      crossYearOpex: execution.byProgram.get(row.programId)?.crossYearOpex ?? 0,
      priorOpeningCapex: execution.byProgram.get(row.programId)?.priorOpeningCapex ?? 0,
      priorOpeningOpex: execution.byProgram.get(row.programId)?.priorOpeningOpex ?? 0,
      postCloseReserveCapex: execution.byProgram.get(row.programId)?.reserveCapex ?? 0,
      postCloseReserveOpex: execution.byProgram.get(row.programId)?.reserveOpex ?? 0,
      availableCapex: position.capex.available,
      availableOpex: position.opex.available,
      unallocatedCapex: position.capex.unallocated,
      unallocatedOpex: position.opex.unallocated,
      overCapex: position.capex.over,
      overOpex: position.opex.over,
    };
  });

  const recurringRows = await db
    .select({
      fiscalYear: annualPlans.fiscalYear,
      name: recurringOpsItems.name,
      categoryName: spendCategories.name,
      opexBudget: recurringOpsItems.opexBudget,
      carryInOpex: recurringOpsItems.carryInOpex,
      itemId: recurringOpsItems.id,
    })
    .from(recurringOpsItems)
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
    .leftJoin(spendCategories, eq(recurringOpsItems.categoryId, spendCategories.id))
    .where(and(eq(annualPlans.planId, planId), isNull(recurringOpsItems.voidedAt)))
    .orderBy(asc(annualPlans.fiscalYear), asc(recurringOpsItems.name));

  const recurringOps: AnnualPlanRecurringOpsRow[] = recurringRows.map((row) => {
    const executionTotals = execution.byRecurringItem.get(row.itemId);
    const available = row.opexBudget + row.carryInOpex;
    return {
      itemId: row.itemId,
      fiscalYear: row.fiscalYear,
      name: row.name,
      categoryName: row.categoryName,
      opexBudget: row.opexBudget,
      carryInOpex: row.carryInOpex,
      available,
      commitmentOpex: executionTotals?.commitmentOpex ?? 0,
      spendOpex: executionTotals?.spendOpex ?? 0,
      priorOpeningOpex: executionTotals?.priorOpeningOpex ?? 0,
      remainingOpex:
        available -
        (executionTotals?.openCommitmentOpex ?? 0) -
        (executionTotals?.currentSpendOpex ?? 0),
    };
  });

  const totals = programs.reduce(
    (total, row) => ({
      capexBudget: total.capexBudget + row.capexBudget,
      opexBudget: total.opexBudget + row.opexBudget,
      carryInCapex: total.carryInCapex + row.carryInCapex,
      carryInOpex: total.carryInOpex + row.carryInOpex,
      allocatedCapex: total.allocatedCapex + row.allocatedCapex,
      allocatedOpex: total.allocatedOpex + row.allocatedOpex,
      unallocatedCapex: total.unallocatedCapex + row.unallocatedCapex,
      unallocatedOpex: total.unallocatedOpex + row.unallocatedOpex,
      recurringOpexBudget: total.recurringOpexBudget,
      recurringCarryInOpex: total.recurringCarryInOpex,
    }),
    {
      capexBudget: 0,
      opexBudget: 0,
      carryInCapex: 0,
      carryInOpex: 0,
      allocatedCapex: 0,
      allocatedOpex: 0,
      unallocatedCapex: 0,
      unallocatedOpex: 0,
      recurringOpexBudget: 0,
      recurringCarryInOpex: 0,
    },
  );
  for (const row of recurringOps) {
    totals.recurringOpexBudget += row.opexBudget;
    totals.recurringCarryInOpex += row.carryInOpex;
  }

  return { programs, recurringOps, totals };
}

// ---------------------------------------------------------------- project register

export interface ProjectRegisterReportRow {
  project: Project;
  siCode: string;
  siName: string;
  programCode: string;
  approvedAmount: number | null;
  submittedPrice: number | null;
  finalDealPrice: number | null;
  allocationCapex: number;
  allocationOpex: number;
  carryInCapex: number;
  carryInOpex: number;
  commitmentCapex: number;
  commitmentOpex: number;
  spendCapex: number;
  spendOpex: number;
  totalAllocated: number;
  inAppCommitments: number;
  inAppSpend: number;
  openCommitments: number;
  priorOpeningSettlements: number;
  lifetimeCommitments: number;
  spentToDate: number;
  flags: FundingFlag[];
}

export interface ProjectRegisterReport {
  rows: ProjectRegisterReportRow[];
  totals: {
    fullLifeAllocated: number;
    approved: number;
    finalDeal: number;
    allocated: number;
    lifetimeCommitments: number;
    openingSpent: number;
    inAppCommitments: number;
    inAppSpend: number;
    openCommitments: number;
    priorOpeningSettlements: number;
    spentToDate: number;
  };
}

export async function getProjectRegisterReport(
  planId: string,
): Promise<ProjectRegisterReport> {
  const db = getDb();
  const execution = await loadExecutionAggregates(planId);
  const projectRows = await db
    .select({
      project: projects,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
      programCode: annualPrograms.code,
      approvedAmount: ijinPrinsipRecords.approvedAmount,
    })
    .from(projects)
    .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .leftJoin(ijinPrinsipRecords, eq(ijinPrinsipRecords.projectId, projects.id))
    .where(eq(annualPlans.planId, planId))
    .orderBy(asc(projects.code));

  const allocationRows = await db
    .select({
      projectId: projectYearAllocations.projectId,
      capex: sql<string>`coalesce(sum(${projectYearAllocations.allocationCapex}), 0)::text`,
      opex: sql<string>`coalesce(sum(${projectYearAllocations.allocationOpex}), 0)::text`,
      carryCapex: sql<string>`coalesce(sum(${projectYearAllocations.carryInCapex}), 0)::text`,
      carryOpex: sql<string>`coalesce(sum(${projectYearAllocations.carryInOpex}), 0)::text`,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(projectYearAllocations.voidedAt)))
    .groupBy(projectYearAllocations.projectId);
  const allocationMap = new Map(allocationRows.map((row) => [row.projectId, row]));

  const rows: ProjectRegisterReportRow[] = projectRows.map((row) => {
    const allocation = allocationMap.get(row.project.id);
    const allocationCapex = num(allocation?.capex);
    const allocationOpex = num(allocation?.opex);
    const carryInCapex = num(allocation?.carryCapex);
    const carryInOpex = num(allocation?.carryOpex);
    const totalAllocated = allocationCapex + allocationOpex;
    const executionTotals = execution.byProject.get(row.project.id);
    const inAppCommitments =
      (executionTotals?.commitmentCapex ?? 0) + (executionTotals?.commitmentOpex ?? 0);
    const inAppSpend = (executionTotals?.spendCapex ?? 0) + (executionTotals?.spendOpex ?? 0);
    const priorOpeningSettlements =
      (executionTotals?.priorOpeningCapex ?? 0) + (executionTotals?.priorOpeningOpex ?? 0);
    const openCommitments =
      (executionTotals?.openCommitmentCapex ?? 0) + (executionTotals?.openCommitmentOpex ?? 0);
    return {
      project: row.project,
      siCode: row.siCode,
      siName: row.siName,
      programCode: row.programCode,
      approvedAmount: row.approvedAmount,
      submittedPrice: row.project.submittedPrice,
      finalDealPrice: row.project.finalDealPrice,
      allocationCapex,
      allocationOpex,
      carryInCapex,
      carryInOpex,
      commitmentCapex: executionTotals?.commitmentCapex ?? 0,
      commitmentOpex: executionTotals?.commitmentOpex ?? 0,
      spendCapex: executionTotals?.spendCapex ?? 0,
      spendOpex: executionTotals?.spendOpex ?? 0,
      totalAllocated,
      inAppCommitments,
      inAppSpend,
      openCommitments,
      priorOpeningSettlements,
      lifetimeCommitments: row.project.openingCommitted + inAppCommitments,
      spentToDate: row.project.openingSpent + inAppSpend,
      flags: projectFundingFlags({
        approvedBudget: row.approvedAmount,
        submittedPrice: row.project.submittedPrice,
        finalDealPrice: row.project.finalDealPrice,
        openingCommitted: row.project.openingCommitted,
        inAppCommitments,
        allocatedFullLife: row.project.allocatedBudgetFullLife,
        totalAllocated,
      }),
    };
  });

  const totals = rows.reduce(
    (total, row) => ({
      fullLifeAllocated: total.fullLifeAllocated + row.project.allocatedBudgetFullLife,
      approved: total.approved + (row.approvedAmount ?? 0),
      finalDeal: total.finalDeal + (row.finalDealPrice ?? 0),
      allocated: total.allocated + row.totalAllocated,
      lifetimeCommitments: total.lifetimeCommitments + row.lifetimeCommitments,
      openingSpent: total.openingSpent + row.project.openingSpent,
      inAppCommitments: total.inAppCommitments + row.inAppCommitments,
      inAppSpend: total.inAppSpend + row.inAppSpend,
      openCommitments: total.openCommitments + row.openCommitments,
      priorOpeningSettlements: total.priorOpeningSettlements + row.priorOpeningSettlements,
      spentToDate: total.spentToDate + row.spentToDate,
    }),
    {
      fullLifeAllocated: 0,
      approved: 0,
      finalDeal: 0,
      allocated: 0,
      lifetimeCommitments: 0,
      openingSpent: 0,
      inAppCommitments: 0,
      inAppSpend: 0,
      openCommitments: 0,
      priorOpeningSettlements: 0,
      spentToDate: 0,
    },
  );

  return { rows, totals };
}

// ---------------------------------------------------------------- budget vs actual

export interface BudgetVsActualRow {
  /** Record id of the annual program, used to attach custom-field values (#46). */
  programId: string;
  fiscalYear: number;
  siCode: string;
  siName: string;
  programCode: string;
  programName: string;
  capexAvailable: number;
  opexAvailable: number;
  allocatedCapex: number;
  allocatedOpex: number;
  commitmentCapex: number;
  commitmentOpex: number;
  spendCapex: number;
  spendOpex: number;
  settlementCapex: number;
  settlementOpex: number;
  priorOpeningCapex: number;
  priorOpeningOpex: number;
  /** Closed-year settlements kept as a post-close reserve in this fiscal year (#98). */
  postCloseReserveCapex: number;
  postCloseReserveOpex: number;
  unallocatedCapex: number;
  unallocatedOpex: number;
  overCapex: boolean;
  overOpex: boolean;
}

export interface BudgetVsActualReport {
  rows: BudgetVsActualRow[];
  totals: {
    capexAvailable: number;
    opexAvailable: number;
    allocatedCapex: number;
    allocatedOpex: number;
    commitmentCapex: number;
    commitmentOpex: number;
    spendCapex: number;
    spendOpex: number;
    unallocatedCapex: number;
    unallocatedOpex: number;
    settlementCapex: number;
    settlementOpex: number;
    priorOpeningCapex: number;
    priorOpeningOpex: number;
    postCloseReserveCapex: number;
    postCloseReserveOpex: number;
  };
}

export async function getBudgetVsActualReport(
  planId: string,
): Promise<BudgetVsActualReport> {
  const annual = await getAnnualPlanReport(planId);
  const rows: BudgetVsActualRow[] = annual.programs.map((row) => ({
    programId: row.programId,
    fiscalYear: row.fiscalYear,
    siCode: row.siCode,
    siName: row.siName,
    programCode: row.programCode,
    programName: row.programName,
    capexAvailable: row.availableCapex,
    opexAvailable: row.availableOpex,
    allocatedCapex: row.allocatedCapex,
    allocatedOpex: row.allocatedOpex,
    commitmentCapex: row.commitmentCapex,
    commitmentOpex: row.commitmentOpex,
    spendCapex: row.spendCapex,
    spendOpex: row.spendOpex,
    settlementCapex: row.crossYearCapex,
    settlementOpex: row.crossYearOpex,
    priorOpeningCapex: row.priorOpeningCapex,
    priorOpeningOpex: row.priorOpeningOpex,
    postCloseReserveCapex: row.postCloseReserveCapex,
    postCloseReserveOpex: row.postCloseReserveOpex,
    unallocatedCapex: row.unallocatedCapex,
    unallocatedOpex: row.unallocatedOpex,
    overCapex: row.overCapex,
    overOpex: row.overOpex,
  }));

  const totals = rows.reduce(
    (total, row) => ({
      capexAvailable: total.capexAvailable + row.capexAvailable,
      opexAvailable: total.opexAvailable + row.opexAvailable,
      allocatedCapex: total.allocatedCapex + row.allocatedCapex,
      allocatedOpex: total.allocatedOpex + row.allocatedOpex,
      commitmentCapex: total.commitmentCapex + row.commitmentCapex,
      commitmentOpex: total.commitmentOpex + row.commitmentOpex,
      spendCapex: total.spendCapex + row.spendCapex,
      spendOpex: total.spendOpex + row.spendOpex,
      settlementCapex: total.settlementCapex + row.settlementCapex,
      settlementOpex: total.settlementOpex + row.settlementOpex,
      priorOpeningCapex: total.priorOpeningCapex + row.priorOpeningCapex,
      priorOpeningOpex: total.priorOpeningOpex + row.priorOpeningOpex,
      postCloseReserveCapex: total.postCloseReserveCapex + row.postCloseReserveCapex,
      postCloseReserveOpex: total.postCloseReserveOpex + row.postCloseReserveOpex,
      unallocatedCapex: total.unallocatedCapex + row.unallocatedCapex,
      unallocatedOpex: total.unallocatedOpex + row.unallocatedOpex,
    }),
    {
      capexAvailable: 0,
      opexAvailable: 0,
      allocatedCapex: 0,
      allocatedOpex: 0,
      commitmentCapex: 0,
      commitmentOpex: 0,
      spendCapex: 0,
      spendOpex: 0,
      settlementCapex: 0,
      settlementOpex: 0,
      priorOpeningCapex: 0,
      priorOpeningOpex: 0,
      postCloseReserveCapex: 0,
      postCloseReserveOpex: 0,
      unallocatedCapex: 0,
      unallocatedOpex: 0,
    },
  );


  return { rows, totals };
}
