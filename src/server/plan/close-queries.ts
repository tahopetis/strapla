import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  carryOverEntries,
  projectYearAllocations,
  projects,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type CarryOverEntry,
  type Project,
  type ProjectYearAllocation,
  type StrategicPlan,
} from '@/db/schema';
import { programBudgetPosition } from '@/domain/funding';
import { nextFiscalYear } from '@/domain/close';
import { getAllocationFunding } from './execution-queries';

/** Queries for the year-close review and the carry-over snapshot (M4 #21). */

export interface CloseProgramRow {
  program: AnnualProgram;
  availableCapex: number;
  availableOpex: number;
  allocatedCapex: number;
  allocatedOpex: number;
  unallocatedCapex: number;
  unallocatedOpex: number;
  targetPrograms: Array<{ value: string; label: string }>;
  defaultTargetProgramId: string | null;
}

export interface CloseAllocationRow {
  allocation: ProjectYearAllocation;
  project: Project;
  program: AnnualProgram;
  remainingCapex: number;
  remainingOpex: number;
  targetAllocation: ProjectYearAllocation | null;
  targetProgramId: string | null;
  canCreateTarget: boolean;
  note: string | null;
}

export interface CloseState {
  plan: AnnualPlan;
  strategicPlan: StrategicPlan;
  targetPlan: AnnualPlan | null;
  programs: CloseProgramRow[];
  allocations: CloseAllocationRow[];
  carryOvers: CarryOverEntry[];
  totalCarryCapex: number;
  totalCarryOpex: number;
}

export async function listCarryOvers(sourcePlanId: string): Promise<CarryOverEntry[]> {
  return getDb()
    .select()
    .from(carryOverEntries)
    .where(eq(carryOverEntries.sourceAnnualPlanId, sourcePlanId))
    .orderBy(asc(carryOverEntries.entityType), asc(carryOverEntries.createdAt));
}

export async function getCloseState(planId: string): Promise<CloseState | null> {
  const db = getDb();
  const planRows = await db
    .select({ plan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, planId))
    .limit(1);
  const loaded = planRows[0];
  if (!loaded) return null;

  const targetRows = await db
    .select()
    .from(annualPlans)
    .where(
      and(
        eq(annualPlans.planId, loaded.strategicPlan.id),
        eq(annualPlans.fiscalYear, nextFiscalYear(loaded.plan.fiscalYear)),
      ),
    )
    .limit(1);
  const targetPlan = targetRows[0] ?? null;

  const programRows = await db
    .select()
    .from(annualPrograms)
    .where(and(eq(annualPrograms.annualPlanId, planId), isNull(annualPrograms.voidedAt)))
    .orderBy(asc(annualPrograms.code));

  const allocationRows = await db
    .select({
      allocation: projectYearAllocations,
      project: projects,
      program: annualPrograms,
    })
    .from(projectYearAllocations)
    .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .where(and(eq(projectYearAllocations.annualPlanId, planId), isNull(projectYearAllocations.voidedAt)))
    .orderBy(asc(projects.code));

  const allocatedByProgram = new Map<string, { capex: number; opex: number }>();
  for (const row of allocationRows) {
    const current = allocatedByProgram.get(row.program.id) ?? { capex: 0, opex: 0 };
    current.capex += row.allocation.allocationCapex;
    current.opex += row.allocation.allocationOpex;
    allocatedByProgram.set(row.program.id, current);
  }

  const targetPrograms = targetPlan
    ? await db
        .select()
        .from(annualPrograms)
        .where(and(eq(annualPrograms.annualPlanId, targetPlan.id), isNull(annualPrograms.voidedAt)))
        .orderBy(asc(annualPrograms.code))
    : [];

  const targetAllocations = targetPlan
    ? await db
        .select()
        .from(projectYearAllocations)
        .where(
          and(
            eq(projectYearAllocations.annualPlanId, targetPlan.id),
            isNull(projectYearAllocations.voidedAt),
          ),
        )
    : [];
  const targetAllocationByProject = new Map(
    targetAllocations.map((allocation) => [allocation.projectId, allocation]),
  );

  const programs: CloseProgramRow[] = programRows.map((program) => {
    const allocated = allocatedByProgram.get(program.id) ?? { capex: 0, opex: 0 };
    const position = programBudgetPosition({
      capexBudget: program.capexBudget,
      opexBudget: program.opexBudget,
      carryInCapex: program.carryInCapex,
      carryInOpex: program.carryInOpex,
      allocatedCapex: allocated.capex,
      allocatedOpex: allocated.opex,
    });
    const candidates = targetPrograms
      .filter((target) => target.siId === program.siId)
      .map((target) => ({
        value: target.id,
        label: `${target.code} · ${target.name} (FY${targetPlan?.fiscalYear ?? ''})`,
      }));
    const continuation = targetPrograms.find(
      (target) => target.prevProgramId === program.id,
    );
    return {
      program,
      availableCapex: position.capex.available,
      availableOpex: position.opex.available,
      allocatedCapex: allocated.capex,
      allocatedOpex: allocated.opex,
      unallocatedCapex: position.capex.unallocated,
      unallocatedOpex: position.opex.unallocated,
      targetPrograms: candidates,
      defaultTargetProgramId: continuation?.id ?? candidates[0]?.value ?? null,
    };
  });

  const allocations: CloseAllocationRow[] = [];
  for (const row of allocationRows) {
    const funding = await getAllocationFunding(row.allocation.id);
    const remainingCapex = funding?.totals.remainingCapex ?? 0;
    const remainingOpex = funding?.totals.remainingOpex ?? 0;
    const targetAllocation = targetAllocationByProject.get(row.project.id) ?? null;
    const programRow = programs.find((candidate) => candidate.program.id === row.program.id);
    const targetProgramId = programRow?.defaultTargetProgramId ?? null;
    const projectInTargetYear =
      row.project.startFiscalYear <= (targetPlan?.fiscalYear ?? 0) &&
      row.project.endFiscalYear >= (targetPlan?.fiscalYear ?? 0);
    const canCreateTarget = targetPlan !== null && projectInTargetYear && targetProgramId !== null;
    allocations.push({
      allocation: row.allocation,
      project: row.project,
      program: row.program,
      remainingCapex,
      remainingOpex,
      targetAllocation,
      targetProgramId,
      canCreateTarget,
      note:
        targetPlan && !projectInTargetYear
          ? `Project ends in FY${row.project.endFiscalYear}; carry-over is not possible.`
          : targetAllocation
            ? null
            : canCreateTarget
              ? `A FY${targetPlan?.fiscalYear} allocation will be created with the carry-in.`
              : 'No target program available for the carried amount.',
    });
  }

  const carryOvers = await listCarryOvers(planId);
  const totalCarryCapex = carryOvers
    .filter((entry) => entry.component === 'capex')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalCarryOpex = carryOvers
    .filter((entry) => entry.component === 'opex')
    .reduce((sum, entry) => sum + entry.amount, 0);

  return {
    plan: loaded.plan,
    strategicPlan: loaded.strategicPlan,
    targetPlan,
    programs,
    allocations,
    carryOvers,
    totalCarryCapex,
    totalCarryOpex,
  };
}
