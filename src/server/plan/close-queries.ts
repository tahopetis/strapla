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
import { revisedProgramBudgetPosition } from '@/domain/funding';
import { carryOverCandidate, nextFiscalYear, type CarryOverTotalsByEntity } from '@/domain/close';
import { NO_DELTAS } from '@/domain/revisions';
import { getAllocationFunding } from './execution-queries';
import { listCloseSnapshots, type CloseSnapshotRow } from './carry-queries';
import { getRevisionDeltasForPlan } from './revision-queries';

/** Queries for the year-close review and the carry-over snapshot (M4 #21, #113). */

export interface CloseProgramRow {
  program: AnnualProgram;
  /** The positive carry candidate, per component (unallocated budget). */
  availableCapex: number;
  availableOpex: number;
  allocatedCapex: number;
  allocatedOpex: number;
  /** Unallocated budget as computed; negative when over-allocated (shown, not carried). */
  unallocatedCapex: number;
  unallocatedOpex: number;
  /**
   * The continuation program in the target year. When it exists it is the only
   * valid carry target (ADR-0006 §3); a null means the source is discontinued
   * or merged and the owner must pick another same-initiative program
   * explicitly.
   */
  continuationProgramId: string | null;
  /** Same-initiative target programs offered when the source is discontinued. */
  targetProgramIds: string[];
  targetPrograms: Array<{ value: string; label: string }>;
}

export interface CloseAllocationRow {
  allocation: ProjectYearAllocation;
  project: Project;
  program: AnnualProgram;
  /** The positive carry candidate, per component (allocation remaining). */
  availableCapex: number;
  availableOpex: number;
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
  /**
   * True when the closed year is the strategic plan's end year (#109, ADR-0008 §3): the close
   * needs no next-year target and carries nothing across the plan boundary.
   */
  isFinalClose: boolean;
  programs: CloseProgramRow[];
  allocations: CloseAllocationRow[];
  carryOvers: CarryOverEntry[];
  /** Immutable snapshot rows when the plan is already closed. */
  snapshots: CloseSnapshotRow[];
  carriedTotals: CarryOverTotalsByEntity;
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

  // The end year of the strategic plan is closed as a final close (#109, ADR-0008 §3): it has
  // no next year to carry into, so the target plan below stays optional for it.
  const isFinalClose =
    loaded.plan.fiscalYear >= loaded.strategicPlan.endFiscalYear;

  // The close candidates use effective budgets and allocations (ADR-0006 §4).
  const deltaMaps = await getRevisionDeltasForPlan(planId);

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
    const delta = deltaMaps.byAllocation.get(row.allocation.id) ?? NO_DELTAS;
    const current = allocatedByProgram.get(row.program.id) ?? { capex: 0, opex: 0 };
    current.capex += row.allocation.allocationCapex + delta.capex;
    current.opex += row.allocation.allocationOpex + delta.opex;
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
    const position = revisedProgramBudgetPosition({
      capexBudget: program.capexBudget,
      opexBudget: program.opexBudget,
      revision: deltaMaps.byProgram.get(program.id) ?? NO_DELTAS,
      carryInCapex: program.carryInCapex,
      carryInOpex: program.carryInOpex,
      allocatedCapex: allocated.capex,
      allocatedOpex: allocated.opex,
    });
    const candidates = targetPrograms.filter((target) => target.siId === program.siId);
    const continuation = candidates.find((target) => target.prevProgramId === program.id) ?? null;
    const options = candidates.map((target) => ({
      value: target.id,
      label: `${target.code} · ${target.name} (FY${targetPlan?.fiscalYear ?? ''})`,
    }));
    return {
      program,
      availableCapex: carryOverCandidate(position.capex.unallocated),
      availableOpex: carryOverCandidate(position.opex.unallocated),
      allocatedCapex: allocated.capex,
      allocatedOpex: allocated.opex,
      unallocatedCapex: position.capex.unallocated,
      unallocatedOpex: position.opex.unallocated,
      continuationProgramId: continuation?.id ?? null,
      targetProgramIds: candidates.map((target) => target.id),
      targetPrograms: options,
    };
  });

  const allocations: CloseAllocationRow[] = [];
  for (const row of allocationRows) {
    const funding = await getAllocationFunding(row.allocation.id);
    const remainingCapex = funding?.totals.remainingCapex ?? 0;
    const remainingOpex = funding?.totals.remainingOpex ?? 0;
    const targetAllocation = targetAllocationByProject.get(row.project.id) ?? null;
    const programRow = programs.find((candidate) => candidate.program.id === row.program.id);
    const targetProgramId = programRow?.continuationProgramId ?? null;
    const projectInTargetYear =
      row.project.startFiscalYear <= (targetPlan?.fiscalYear ?? 0) &&
      row.project.endFiscalYear >= (targetPlan?.fiscalYear ?? 0);
    const canCreateTarget = targetPlan !== null && projectInTargetYear;
    allocations.push({
      allocation: row.allocation,
      project: row.project,
      program: row.program,
      availableCapex: carryOverCandidate(remainingCapex),
      availableOpex: carryOverCandidate(remainingOpex),
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
  const snapshots = await listCloseSnapshots(planId);
  const carriedTotals = carriedTotalsFrom(snapshots, carryOvers);
  const totalCarryCapex = carriedTotals.program.capex + carriedTotals.allocation.capex;
  const totalCarryOpex = carriedTotals.program.opex + carriedTotals.allocation.opex;

  return {
    plan: loaded.plan,
    strategicPlan: loaded.strategicPlan,
    targetPlan,
    isFinalClose,
    programs,
    allocations,
    carryOvers,
    snapshots,
    carriedTotals,
    totalCarryCapex,
    totalCarryOpex,
  };
}

/**
 * Totals shown on the close receipt: the snapshot rows when the plan is closed,
 * otherwise what the ledger already holds for this source plan (zero before the
 * close).
 */
function carriedTotalsFrom(
  snapshots: readonly CloseSnapshotRow[],
  entries: readonly CarryOverEntry[],
): CarryOverTotalsByEntity {
  const totals: CarryOverTotalsByEntity = {
    program: { capex: 0, opex: 0 },
    allocation: { capex: 0, opex: 0 },
  };
  if (snapshots.length > 0) {
    for (const { snapshot } of snapshots) {
      totals[snapshot.entityType][snapshot.component] += snapshot.carried;
    }
    return totals;
  }
  for (const entry of entries) {
    totals[entry.entityType][entry.component] += entry.amount;
  }
  return totals;
}
