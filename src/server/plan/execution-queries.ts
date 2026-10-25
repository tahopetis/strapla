import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  commitmentEntries,
  commitmentSettlements,
  projectYearAllocations,
  projects,
  recurringOpsItems,
  spendCategories,
  spendEntries,
  strategicPlans,
  type AnnualPlan,
  type CommitmentEntry,
  type Project,
  type ProjectYearAllocation,
  type RecurringOpsItem,
  type SpendEntry,
  type StrategicPlan,
} from '@/db/schema';
import { allocationRemaining } from '@/domain/funding';
import {
  commitmentStatus,
  currentYearSpend,
  openCommitmentAmount,
  spendExceedsFiscalYearCommitment,
  type CommitmentStatus,
} from '@/domain/settlement';

/** Read queries for commitments, spend and settlement (M3 #18/#19). */

export interface CommitmentRow {
  commitment: CommitmentEntry;
  settledAmount: number;
  openAmount: number;
  status: CommitmentStatus;
  fiscalYear: number;
}

export interface SpendSettlementLink {
  commitmentId: string;
  amount: number;
  commitmentFiscalYear: number;
}

export interface SpendRow {
  spend: SpendEntry;
  categoryName: string | null;
  settlementLinks: SpendSettlementLink[];
  crossYearSettled: number;
}

export interface FundingTotals {
  fiscalYearCommitmentsCapex: number;
  fiscalYearCommitmentsOpex: number;
  openCommitmentsCapex: number;
  openCommitmentsOpex: number;
  currentYearSpendCapex: number;
  currentYearSpendOpex: number;
  priorYearOpeningCapex: number;
  priorYearOpeningOpex: number;
  br11Capex: boolean;
  br11Opex: boolean;
  remainingCapex: number;
  remainingOpex: number;
}

export interface SettlementOption {
  commitmentId: string;
  label: string;
  openAmount: number;
  component: 'capex' | 'opex';
  fiscalYear: number;
}

export interface AllocationFunding {
  allocation: ProjectYearAllocation;
  project: Project;
  annualPlan: AnnualPlan;
  program: { code: string; name: string };
  strategicPlan: StrategicPlan;
  commitments: CommitmentRow[];
  spends: SpendRow[];
  totals: FundingTotals;
  settlementOptions: SettlementOption[];
}

async function loadCommitmentRows(
  parent: { allocationId: string } | { recurringItemId: string },
): Promise<CommitmentRow[]> {
  const db = getDb();
  const where =
    'allocationId' in parent
      ? and(
          eq(commitmentEntries.projectYearAllocationId, parent.allocationId),
          isNull(commitmentEntries.voidedAt),
        )
      : and(
          eq(commitmentEntries.recurringOpsItemId, parent.recurringItemId),
          isNull(commitmentEntries.voidedAt),
        );

  const commitments = await db
    .select()
    .from(commitmentEntries)
    .where(where)
    .orderBy(asc(commitmentEntries.commitmentDate), asc(commitmentEntries.createdAt));

  if (commitments.length === 0) return [];

  const settledRows = await db
    .select({
      commitmentEntryId: commitmentSettlements.commitmentEntryId,
      settled: sql<string>`coalesce(sum(${commitmentSettlements.amount}), 0)::text`,
    })
    .from(commitmentSettlements)
    .innerJoin(spendEntries, eq(commitmentSettlements.spendEntryId, spendEntries.id))
    .where(isNull(spendEntries.voidedAt))
    .groupBy(commitmentSettlements.commitmentEntryId);
  const settledMap = new Map(
    settledRows.map((row) => [row.commitmentEntryId, Number(row.settled ?? '0')]),
  );

  const fiscalYears = await loadCommitmentFiscalYears(commitments.map((commitment) => commitment.id));

  return commitments.map((commitment) => {
    const settledAmount = settledMap.get(commitment.id) ?? 0;
    const openAmount = openCommitmentAmount({ amount: commitment.amount, settledAmount });
    return {
      commitment,
      settledAmount,
      openAmount,
      status: commitmentStatus({ amount: commitment.amount, settledAmount }),
      fiscalYear: fiscalYears.get(commitment.id) ?? 0,
    };
  });
}

async function loadCommitmentFiscalYears(commitmentIds: string[]): Promise<Map<string, number>> {
  if (commitmentIds.length === 0) return new Map();
  const db = getDb();
  const allocationRows = await db
    .select({
      commitmentId: commitmentEntries.id,
      fiscalYear: annualPlans.fiscalYear,
    })
    .from(commitmentEntries)
    .innerJoin(
      projectYearAllocations,
      eq(commitmentEntries.projectYearAllocationId, projectYearAllocations.id),
    )
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id));
  const recurringRows = await db
    .select({
      commitmentId: commitmentEntries.id,
      fiscalYear: annualPlans.fiscalYear,
    })
    .from(commitmentEntries)
    .innerJoin(recurringOpsItems, eq(commitmentEntries.recurringOpsItemId, recurringOpsItems.id))
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id));

  const wanted = new Set(commitmentIds);
  const map = new Map<string, number>();
  for (const row of [...allocationRows, ...recurringRows]) {
    if (wanted.has(row.commitmentId)) map.set(row.commitmentId, row.fiscalYear);
  }
  return map;
}

async function loadSpendRows(
  parent: { allocationId?: string; recurringItemId?: string },
  fiscalYear: number,
): Promise<SpendRow[]> {
  const db = getDb();
  const where =
    parent.allocationId !== undefined
      ? and(eq(spendEntries.projectYearAllocationId, parent.allocationId), isNull(spendEntries.voidedAt))
      : and(eq(spendEntries.recurringOpsItemId, parent.recurringItemId ?? ''), isNull(spendEntries.voidedAt));

  const spends = await db
    .select({ spend: spendEntries, categoryName: spendCategories.name })
    .from(spendEntries)
    .leftJoin(spendCategories, eq(spendEntries.categoryId, spendCategories.id))
    .where(where)
    .orderBy(asc(spendEntries.spentOn), asc(spendEntries.createdAt));

  const linkRows = await db
    .select({
      spendEntryId: commitmentSettlements.spendEntryId,
      commitmentEntryId: commitmentSettlements.commitmentEntryId,
      amount: commitmentSettlements.amount,
      fiscalYear: annualPlans.fiscalYear,
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
    .where(isNull(spendEntries.voidedAt));

  const linksBySpend = new Map<string, SpendSettlementLink[]>();
  for (const link of linkRows) {
    const list = linksBySpend.get(link.spendEntryId) ?? [];
    list.push({
      commitmentId: link.commitmentEntryId,
      amount: link.amount,
      commitmentFiscalYear: link.fiscalYear ?? 0,
    });
    linksBySpend.set(link.spendEntryId, list);
  }

  return spends.map((row) => {
    const links = linksBySpend.get(row.spend.id) ?? [];
    const crossYearSettled = links
      .filter((link) => link.commitmentFiscalYear < fiscalYear)
      .reduce((sum, link) => sum + link.amount, 0);
    return {
      spend: row.spend,
      categoryName: row.categoryName,
      settlementLinks: links,
      crossYearSettled,
    };
  });
}

function totalsFromRows(input: {
  commitments: CommitmentRow[];
  spends: SpendRow[];
  fiscalYear: number;
  carryInCapex: number;
  carryInOpex: number;
  allocationCapex: number;
  allocationOpex: number;
}): FundingTotals {
  const byComponent = (component: 'capex' | 'opex') => {
    const componentCommitments = input.commitments.filter(
      (row) => row.commitment.component === component,
    );
    const fiscalYearCommitments = componentCommitments.reduce(
      (sum, row) => sum + row.commitment.amount,
      0,
    );
    const openCommitments = componentCommitments.reduce((sum, row) => sum + row.openAmount, 0);

    let currentYearSpendCapexOrOpex = 0;
    let priorYearOpening = 0;
    const componentSpends = input.spends.filter((row) => row.spend.component === component);
    currentYearSpendCapexOrOpex = currentYearSpend(
      componentSpends.map((row) => ({
        amount: row.spend.amount,
        settlementKind: row.spend.settlementKind,
        crossYearSettled: row.crossYearSettled,
        priorYearOpening: row.spend.settlementKind === 'prior_year_opening',
      })),
    );
    priorYearOpening = componentSpends
      .filter((row) => row.spend.settlementKind === 'prior_year_opening')
      .reduce((sum, row) => sum + row.spend.amount, 0);

    return {
      fiscalYearCommitments,
      openCommitments,
      currentYearSpend: currentYearSpendCapexOrOpex,
      priorYearOpening,
      br11: spendExceedsFiscalYearCommitment({
        currentYearSpend: currentYearSpendCapexOrOpex,
        fiscalYearCommitments,
      }),
    };
  };

  const capex = byComponent('capex');
  const opex = byComponent('opex');
  const remaining = allocationRemaining({
    allocationCapex: input.allocationCapex,
    allocationOpex: input.allocationOpex,
    carryInCapex: input.carryInCapex,
    carryInOpex: input.carryInOpex,
    openCommitmentsCapex: capex.openCommitments,
    openCommitmentsOpex: opex.openCommitments,
    spendCapex: capex.currentYearSpend,
    spendOpex: opex.currentYearSpend,
  });

  return {
    fiscalYearCommitmentsCapex: capex.fiscalYearCommitments,
    fiscalYearCommitmentsOpex: opex.fiscalYearCommitments,
    openCommitmentsCapex: capex.openCommitments,
    openCommitmentsOpex: opex.openCommitments,
    currentYearSpendCapex: capex.currentYearSpend,
    currentYearSpendOpex: opex.currentYearSpend,
    priorYearOpeningCapex: capex.priorYearOpening,
    priorYearOpeningOpex: opex.priorYearOpening,
    br11Capex: capex.br11,
    br11Opex: opex.br11,
    remainingCapex: remaining.capex,
    remainingOpex: remaining.opex,
  };
}

function settlementOptionsFromCommitments(rows: CommitmentRow[]): SettlementOption[] {
  return rows
    .filter((row) => row.openAmount > 0)
    .map((row) => ({
      commitmentId: row.commitment.id,
      label: [
        row.commitment.component.toUpperCase(),
        `FY${row.fiscalYear}`,
        row.commitment.commitmentDate,
        row.commitment.reference ?? 'no reference',
        `open ${row.openAmount}`,
      ].join(' · '),
      openAmount: row.openAmount,
      component: row.commitment.component,
      fiscalYear: row.fiscalYear,
    }));
}

export async function getAllocationFunding(
  allocationId: string,
): Promise<AllocationFunding | null> {
  const db = getDb();
  const headerRows = await db
    .select({
      allocation: projectYearAllocations,
      project: projects,
      annualPlan: annualPlans,
      strategicPlan: strategicPlans,
      programCode: annualPrograms.code,
      programName: annualPrograms.name,
    })
    .from(projectYearAllocations)
    .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .where(eq(projectYearAllocations.id, allocationId))
    .limit(1);
  const header = headerRows[0];
  if (!header) return null;

  const commitments = await loadCommitmentRows({ allocationId });
  const spends = await loadSpendRows({ allocationId }, header.annualPlan.fiscalYear);

  return {
    allocation: header.allocation,
    project: header.project,
    annualPlan: header.annualPlan,
    strategicPlan: header.strategicPlan,
    program: { code: header.programCode, name: header.programName },
    commitments,
    spends,
    totals: totalsFromRows({
      commitments,
      spends,
      fiscalYear: header.annualPlan.fiscalYear,
      allocationCapex: header.allocation.allocationCapex,
      allocationOpex: header.allocation.allocationOpex,
      carryInCapex: header.allocation.carryInCapex,
      carryInOpex: header.allocation.carryInOpex,
    }),
    settlementOptions: settlementOptionsFromCommitments(commitments),
  };
}

export interface RecurringOpsFunding {
  item: RecurringOpsItem;
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  commitments: CommitmentRow[];
  spends: SpendRow[];
  totals: FundingTotals;
  settlementOptions: SettlementOption[];
}

export async function getRecurringOpsFunding(
  itemId: string,
): Promise<RecurringOpsFunding | null> {
  const db = getDb();
  const headerRows = await db
    .select({ item: recurringOpsItems, annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(recurringOpsItems)
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(recurringOpsItems.id, itemId))
    .limit(1);
  const header = headerRows[0];
  if (!header) return null;

  const commitments = await loadCommitmentRows({ recurringItemId: itemId });
  const spends = await loadSpendRows({ recurringItemId: itemId }, header.annualPlan.fiscalYear);

  return {
    item: header.item,
    annualPlan: header.annualPlan,
    strategicPlan: header.strategicPlan,
    commitments,
    spends,
    totals: totalsFromRows({
      commitments,
      spends,
      fiscalYear: header.annualPlan.fiscalYear,
      allocationCapex: 0,
      allocationOpex: header.item.opexBudget,
      carryInCapex: 0,
      carryInOpex: header.item.carryInOpex,
    }),
    settlementOptions: settlementOptionsFromCommitments(commitments),
  };
}

export async function listSpendCategoryOptions(): Promise<Array<{ value: string; label: string }>> {
  const rows = await getDb()
    .select({ id: spendCategories.id, name: spendCategories.name })
    .from(spendCategories)
    .where(eq(spendCategories.isActive, true))
    .orderBy(asc(spendCategories.sortOrder), asc(spendCategories.name));
  return rows.map((row) => ({ value: row.id, label: row.name }));
}
