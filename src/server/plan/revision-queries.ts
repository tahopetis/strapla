import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  budgetRevisionLines,
  budgetRevisions,
  commitmentEntries,
  commitmentSettlements,
  projectYearAllocations,
  projects,
  spendEntries,
  strategicPlans,
  type AnnualPlan,
  type BudgetRevision,
  type StrategicPlan,
} from '@/db/schema';
import {
  formatRevisionNumber,
  type ComponentAmounts,
  type RevisionAllocationPosition,
  type RevisionProgramPosition,
} from '@/domain/revisions';
import { currentYearSpend, openCommitmentAmount } from '@/domain/settlement';

/**
 * Read queries for budget revisions (#112, ADR-0006 §4): the register, the
 * deltas a plan's effective budgets are built from, and the context the switch
 * floor needs.
 */

export interface RevisionDeltaMaps {
  byProgram: Map<string, ComponentAmounts>;
  byAllocation: Map<string, ComponentAmounts>;
}

function emptyMaps(): RevisionDeltaMaps {
  return { byProgram: new Map(), byAllocation: new Map() };
}

function addDelta(
  map: Map<string, ComponentAmounts>,
  entityId: string,
  component: 'capex' | 'opex',
  delta: number,
): void {
  const current = map.get(entityId) ?? { capex: 0, opex: 0 };
  if (component === 'capex') current.capex += delta;
  else current.opex += delta;
  map.set(entityId, current);
}

interface DeltaRow {
  entityType: 'program' | 'allocation';
  entityId: string;
  component: 'capex' | 'opex';
  total: string;
}

function mapsFromRows(rows: DeltaRow[]): RevisionDeltaMaps {
  const maps = emptyMaps();
  for (const row of rows) {
    const target = row.entityType === 'program' ? maps.byProgram : maps.byAllocation;
    addDelta(target, row.entityId, row.component, Number(row.total ?? '0'));
  }
  return maps;
}

const DELTA_SELECTION = {
  entityType: budgetRevisionLines.entityType,
  entityId: budgetRevisionLines.entityId,
  component: budgetRevisionLines.component,
  total: sql<string>`coalesce(sum(${budgetRevisionLines.delta}), 0)::text`,
};

const DELTA_GROUPING = [
  budgetRevisionLines.entityType,
  budgetRevisionLines.entityId,
  budgetRevisionLines.component,
];

/** Every posted line of one annual plan, netted per entity and component. */
export async function getRevisionDeltasForPlan(annualPlanId: string): Promise<RevisionDeltaMaps> {
  const rows = await getDb()
    .select(DELTA_SELECTION)
    .from(budgetRevisionLines)
    .innerJoin(budgetRevisions, eq(budgetRevisionLines.revisionId, budgetRevisions.id))
    .where(eq(budgetRevisions.annualPlanId, annualPlanId))
    .groupBy(...DELTA_GROUPING);
  return mapsFromRows(rows);
}

/** Posted lines for specific entities, across plans (program threads). */
export async function getRevisionDeltasForEntities(input: {
  programIds?: readonly string[];
  allocationIds?: readonly string[];
}): Promise<RevisionDeltaMaps> {
  const programIds = [...(input.programIds ?? [])];
  const allocationIds = [...(input.allocationIds ?? [])];
  if (programIds.length === 0 && allocationIds.length === 0) return emptyMaps();

  const scope = [
    programIds.length > 0
      ? and(
          eq(budgetRevisionLines.entityType, 'program'),
          inArray(budgetRevisionLines.entityId, programIds),
        )
      : undefined,
    allocationIds.length > 0
      ? and(
          eq(budgetRevisionLines.entityType, 'allocation'),
          inArray(budgetRevisionLines.entityId, allocationIds),
        )
      : undefined,
  ].filter((clause) => clause !== undefined);

  const rows = await getDb()
    .select(DELTA_SELECTION)
    .from(budgetRevisionLines)
    .where(scope.length === 1 ? scope[0] : or(...scope))
    .groupBy(...DELTA_GROUPING);
  return mapsFromRows(rows);
}

export interface RevisionListRow {
  revision: BudgetRevision;
  /** `REV-2027-001`. */
  number: string;
  totalDelta: ComponentAmounts;
  lineCount: number;
  awaitingDecision: boolean;
}

/** The plan's revision register, oldest number first. */
export async function listRevisions(annualPlanId: string): Promise<RevisionListRow[]> {
  const db = getDb();
  const revisions = await db
    .select({
      revision: budgetRevisions,
      fiscalYear: annualPlans.fiscalYear,
    })
    .from(budgetRevisions)
    .innerJoin(annualPlans, eq(budgetRevisions.annualPlanId, annualPlans.id))
    .where(eq(budgetRevisions.annualPlanId, annualPlanId))
    .orderBy(asc(budgetRevisions.number));
  if (revisions.length === 0) return [];

  const totals = await db
    .select({
      revisionId: budgetRevisionLines.revisionId,
      entityType: budgetRevisionLines.entityType,
      component: budgetRevisionLines.component,
      total: sql<string>`coalesce(sum(${budgetRevisionLines.delta}), 0)::text`,
      lines: sql<string>`count(*)::text`,
    })
    .from(budgetRevisionLines)
    .where(
      inArray(
        budgetRevisionLines.revisionId,
        revisions.map((row) => row.revision.id),
      ),
    )
    .groupBy(
      budgetRevisionLines.revisionId,
      budgetRevisionLines.entityType,
      budgetRevisionLines.component,
    );

  return revisions.map(({ revision, fiscalYear }) => {
    const totalDelta: ComponentAmounts = { capex: 0, opex: 0 };
    let lineCount = 0;
    for (const row of totals) {
      if (row.revisionId !== revision.id) continue;
      lineCount += Number(row.lines ?? '0');
      // The register's total delta is the net program budget change: a switch
      // nets to zero, and a de-allocation is a project-level consequence.
      if (row.entityType !== 'program') continue;
      totalDelta[row.component] += Number(row.total ?? '0');
    }
    return {
      revision,
      number: formatRevisionNumber(fiscalYear, revision.number),
      totalDelta,
      lineCount,
      awaitingDecision: revision.decisionReference === null,
    };
  });
}

/** De-allocation floor figures for one project year allocation. */
export interface AllocationFloor {
  openCommitmentsCapex: number;
  openCommitmentsOpex: number;
  spendCapex: number;
  spendOpex: number;
}

/**
 * Open commitments plus current-year spend per allocation and component — the
 * floor a de-allocation may not go below. It mirrors the execution screen's
 * remaining inputs (same domain rules for settlement and voided rows) without
 * loading whole commitment and spend histories.
 */
export async function getAllocationFloors(
  allocationIds: readonly string[],
  fiscalYear: number,
): Promise<Map<string, AllocationFloor>> {
  const floors = new Map<string, AllocationFloor>();
  if (allocationIds.length === 0) return floors;
  for (const id of allocationIds) {
    floors.set(id, {
      openCommitmentsCapex: 0,
      openCommitmentsOpex: 0,
      spendCapex: 0,
      spendOpex: 0,
    });
  }
  const db = getDb();

  const commitments = await db
    .select({
      id: commitmentEntries.id,
      allocationId: commitmentEntries.projectYearAllocationId,
      component: commitmentEntries.component,
      amount: commitmentEntries.amount,
    })
    .from(commitmentEntries)
    .where(
      and(
        inArray(commitmentEntries.projectYearAllocationId, [...allocationIds]),
        isNull(commitmentEntries.voidedAt),
      ),
    );

  const settled = new Map<string, number>();
  if (commitments.length > 0) {
    const rows = await db
      .select({
        commitmentEntryId: commitmentSettlements.commitmentEntryId,
        settled: sql<string>`coalesce(sum(${commitmentSettlements.amount}), 0)::text`,
      })
      .from(commitmentSettlements)
      .innerJoin(spendEntries, eq(commitmentSettlements.spendEntryId, spendEntries.id))
      .where(
        and(
          isNull(spendEntries.voidedAt),
          inArray(
            commitmentSettlements.commitmentEntryId,
            commitments.map((commitment) => commitment.id),
          ),
        ),
      )
      .groupBy(commitmentSettlements.commitmentEntryId);
    for (const row of rows) settled.set(row.commitmentEntryId, Number(row.settled ?? '0'));
  }

  for (const commitment of commitments) {
    const floor = floors.get(commitment.allocationId ?? '');
    if (!floor) continue;
    const open = openCommitmentAmount({
      amount: commitment.amount,
      settledAmount: settled.get(commitment.id) ?? 0,
    });
    if (commitment.component === 'capex') floor.openCommitmentsCapex += open;
    else floor.openCommitmentsOpex += open;
  }

  const spends = await db
    .select({
      id: spendEntries.id,
      allocationId: spendEntries.projectYearAllocationId,
      component: spendEntries.component,
      amount: spendEntries.amount,
      settlementKind: spendEntries.settlementKind,
      postCloseTreatment: spendEntries.postCloseTreatment,
    })
    .from(spendEntries)
    .where(
      and(
        inArray(spendEntries.projectYearAllocationId, [...allocationIds]),
        isNull(spendEntries.voidedAt),
      ),
    );

  const linksBySpend = new Map<
    string,
    Array<{ commitmentFiscalYear: number; amount: number; closedYear: boolean }>
  >();
  if (spends.length > 0) {
    const links = await db
      .select({
        spendEntryId: commitmentSettlements.spendEntryId,
        amount: commitmentSettlements.amount,
        commitmentFiscalYear: annualPlans.fiscalYear,
        planStatus: annualPlans.status,
      })
      .from(commitmentSettlements)
      .innerJoin(spendEntries, eq(commitmentSettlements.spendEntryId, spendEntries.id))
      .innerJoin(
        commitmentEntries,
        eq(commitmentSettlements.commitmentEntryId, commitmentEntries.id),
      )
      .leftJoin(
        projectYearAllocations,
        eq(commitmentEntries.projectYearAllocationId, projectYearAllocations.id),
      )
      .leftJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
      .where(
        and(
          isNull(spendEntries.voidedAt),
          inArray(
            commitmentSettlements.spendEntryId,
            spends.map((spend) => spend.id),
          ),
        ),
      );
    for (const link of links) {
      const list = linksBySpend.get(link.spendEntryId) ?? [];
      list.push({
        amount: link.amount,
        commitmentFiscalYear: link.commitmentFiscalYear ?? 0,
        closedYear: link.planStatus === 'closed',
      });
      linksBySpend.set(link.spendEntryId, list);
    }
  }

  const byAllocation = new Map<
    string,
    Array<{ amount: number; component: 'capex' | 'opex'; settlementKind: 'current' | 'prior_year_opening'; crossYearSettled: number; closedYearSettled: number; treatment: 'charge_current_year' | 'charge_closed_year_reserve' | null }>
  >();
  for (const spend of spends) {
    if (!spend.allocationId) continue;
    const links = linksBySpend.get(spend.id) ?? [];
    const list = byAllocation.get(spend.allocationId) ?? [];
    list.push({
      amount: spend.amount,
      component: spend.component,
      settlementKind: spend.settlementKind,
      // Only a settlement of an earlier fiscal year is cross-year; the
      // current-year spend rule excludes exactly those portions.
      crossYearSettled: links
        .filter((link) => link.commitmentFiscalYear < fiscalYear)
        .reduce((sum, link) => sum + link.amount, 0),
      closedYearSettled: links
        .filter((link) => link.closedYear && link.commitmentFiscalYear < fiscalYear)
        .reduce((sum, link) => sum + link.amount, 0),
      treatment: spend.postCloseTreatment,
    });
    byAllocation.set(spend.allocationId, list);
  }

  for (const [allocationId, rows] of byAllocation) {
    const floor = floors.get(allocationId);
    if (!floor) continue;
    for (const component of ['capex', 'opex'] as const) {
      const componentRows = rows.filter((row) => row.component === component);
      const amount = currentYearSpend(
        componentRows.map((row) => ({
          amount: row.amount,
          settlementKind: row.settlementKind,
          crossYearSettled: row.crossYearSettled,
          closedYearSettled: row.closedYearSettled,
          postCloseTreatment: row.treatment,
          priorYearOpening: row.settlementKind === 'prior_year_opening',
        })),
      );
      if (component === 'capex') floor.spendCapex += amount;
      else floor.spendOpex += amount;
    }
  }

  return floors;
}

/** One allocation as the revision form offers it for de-allocation. */
export interface RevisionAllocationOption {
  id: string;
  label: string;
  programId: string;
  programCode: string;
  effectiveCapex: number;
  effectiveOpex: number;
}

/**
 * The plan's project year allocations with their effective amounts, for the
 * revision form's de-allocation grid and for the switch floor's context.
 */
export async function listRevisionAllocationOptions(
  annualPlanId: string,
): Promise<RevisionAllocationOption[]> {
  const db = getDb();
  const [rows, deltas] = await Promise.all([
    db
      .select({
        id: projectYearAllocations.id,
        programId: projectYearAllocations.annualProgramId,
        allocationCapex: projectYearAllocations.allocationCapex,
        allocationOpex: projectYearAllocations.allocationOpex,
        projectCode: projects.code,
        projectName: projects.name,
        programCode: annualPrograms.code,
      })
      .from(projectYearAllocations)
      .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
      .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
      .where(
        and(
          eq(projectYearAllocations.annualPlanId, annualPlanId),
          isNull(projectYearAllocations.voidedAt),
        ),
      )
      .orderBy(asc(projects.code)),
    getRevisionDeltasForPlan(annualPlanId),
  ]);

  return rows.map((row) => {
    const delta = deltas.byAllocation.get(row.id) ?? { capex: 0, opex: 0 };
    return {
      id: row.id,
      label: `${row.projectCode} · ${row.projectName} · ${row.programCode}`,
      programId: row.programId,
      programCode: row.programCode,
      effectiveCapex: row.allocationCapex + delta.capex,
      effectiveOpex: row.allocationOpex + delta.opex,
    };
  });
}

/** Everything the switch floor needs to judge one line set. */
export interface RevisionContext {
  programs: RevisionProgramPosition[];
  allocations: RevisionAllocationPosition[];
}

/**
 * Builds the validation context for a candidate revision: effective program
 * budgets and allocations before the revision, and — for the allocations the
 * lines de-allocate — the open commitments plus current-year spend floor.
 */
export async function getRevisionContext(
  annualPlanId: string,
  lines: readonly { entityType: 'program' | 'allocation'; entityId: string }[],
): Promise<RevisionContext> {
  const db = getDb();
  const [programRows, allocationOptions, deltas, planRows] = await Promise.all([
    db
      .select()
      .from(annualPrograms)
      .where(and(eq(annualPrograms.annualPlanId, annualPlanId), isNull(annualPrograms.voidedAt)))
      .orderBy(asc(annualPrograms.code)),
    listRevisionAllocationOptions(annualPlanId),
    getRevisionDeltasForPlan(annualPlanId),
    db
      .select({ fiscalYear: annualPlans.fiscalYear })
      .from(annualPlans)
      .where(eq(annualPlans.id, annualPlanId))
      .limit(1),
  ]);
  const fiscalYear = planRows[0]?.fiscalYear ?? 0;

  const allocatedByProgram = new Map<string, ComponentAmounts>();
  for (const allocation of allocationOptions) {
    const current = allocatedByProgram.get(allocation.programId) ?? { capex: 0, opex: 0 };
    current.capex += allocation.effectiveCapex;
    current.opex += allocation.effectiveOpex;
    allocatedByProgram.set(allocation.programId, current);
  }

  const programs: RevisionProgramPosition[] = programRows.map((program) => {
    const delta = deltas.byProgram.get(program.id) ?? { capex: 0, opex: 0 };
    const allocated = allocatedByProgram.get(program.id) ?? { capex: 0, opex: 0 };
    return {
      programId: program.id,
      code: program.code,
      name: program.name,
      capexBudget: program.capexBudget + delta.capex,
      opexBudget: program.opexBudget + delta.opex,
      carryInCapex: program.carryInCapex,
      carryInOpex: program.carryInOpex,
      allocatedCapex: allocated.capex,
      allocatedOpex: allocated.opex,
    };
  });

  const referenced = [
    ...new Set(
      lines
        .filter((line) => line.entityType === 'allocation')
        .map((line) => line.entityId),
    ),
  ];
  const floors = await getAllocationFloors(referenced, fiscalYear);
  const optionsById = new Map(allocationOptions.map((option) => [option.id, option]));

  const allocations: RevisionAllocationPosition[] = referenced
    .map((id) => optionsById.get(id))
    .filter((option): option is RevisionAllocationOption => option !== undefined)
    .map((option) => {
      const floor = floors.get(option.id);
      return {
        allocationId: option.id,
        programId: option.programId,
        label: option.label,
        capexAmount: option.effectiveCapex,
        opexAmount: option.effectiveOpex,
        openCommitmentsCapex: floor?.openCommitmentsCapex ?? 0,
        openCommitmentsOpex: floor?.openCommitmentsOpex ?? 0,
        spendCapex: floor?.spendCapex ?? 0,
        spendOpex: floor?.spendOpex ?? 0,
      };
    });

  return { programs, allocations };
}

/** Everything the annual plan's revision page renders. */
export interface RevisionPageData {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  /** Programs with their effective budget and effective allocations. */
  programs: RevisionProgramPosition[];
  /** Project year allocations the form offers for de-allocation. */
  allocations: RevisionAllocationOption[];
  revisions: RevisionListRow[];
}

/** The revision register, the create form's grids and the plan header. */
export async function getRevisionPageData(
  annualPlanId: string,
): Promise<RevisionPageData | null> {
  const rows = await getDb()
    .select({ annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, annualPlanId))
    .limit(1);
  const loaded = rows[0];
  if (!loaded) return null;

  const [context, revisions, allocations] = await Promise.all([
    getRevisionContext(annualPlanId, []),
    listRevisions(annualPlanId),
    listRevisionAllocationOptions(annualPlanId),
  ]);
  return {
    annualPlan: loaded.annualPlan,
    strategicPlan: loaded.strategicPlan,
    programs: context.programs,
    allocations,
    revisions,
  };
}
