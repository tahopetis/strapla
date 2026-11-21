import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  commitmentEntries,
  commitmentSettlements,
  projectYearAllocations,
  recurringOpsItems,
  spendEntries,
} from '@/db/schema';
import { settlementPortionIsCrossYear } from '@/domain/settlement';

/**
 * Execution aggregates for the M3 reporting line (#20). Loads the commitments,
 * spend and settlements of one strategic plan and rolls them up by allocation,
 * program, SI, project and recurring ops item.
 */

export interface ExecutionTotals {
  /** Fiscal-year commitment amounts recorded in the app. */
  commitmentCapex: number;
  commitmentOpex: number;
  /** Commitment amounts not yet settled (non-void spends only). */
  openCommitmentCapex: number;
  openCommitmentOpex: number;
  /** All in-app spend amounts, including cross-year settlement portions. */
  spendCapex: number;
  spendOpex: number;
  /** Spend net of cross-year portions and prior-year opening payments. */
  currentSpendCapex: number;
  currentSpendOpex: number;
  /** Spend that settles commitments from earlier fiscal years. */
  crossYearCapex: number;
  crossYearOpex: number;
  /** Spend paying pre-app (opening) commitments. */
  priorOpeningCapex: number;
  priorOpeningOpex: number;
  /** Closed-year settlements kept as a post-close reserve in the closed year (#98). */
  reserveCapex: number;
  reserveOpex: number;
  /** Closed-year settlements charged to the current year instead (#98). */
  chargedCapex: number;
  chargedOpex: number;
}

export function emptyExecutionTotals(): ExecutionTotals {
  return {
    commitmentCapex: 0,
    commitmentOpex: 0,
    openCommitmentCapex: 0,
    openCommitmentOpex: 0,
    spendCapex: 0,
    spendOpex: 0,
    currentSpendCapex: 0,
    currentSpendOpex: 0,
    crossYearCapex: 0,
    crossYearOpex: 0,
    priorOpeningCapex: 0,
    priorOpeningOpex: 0,
    reserveCapex: 0,
    reserveOpex: 0,
    chargedCapex: 0,
    chargedOpex: 0,
  };
}

export function addExecutionTotals(target: ExecutionTotals, source: Partial<ExecutionTotals>): void {
  for (const key of Object.keys(target) as Array<keyof ExecutionTotals>) {
    target[key] += source[key] ?? 0;
  }
}

export interface ExecutionAggregates {
  byAllocation: Map<string, ExecutionTotals>;
  byProgram: Map<string, ExecutionTotals>;
  bySi: Map<string, ExecutionTotals>;
  byProject: Map<string, ExecutionTotals>;
  byRecurringItem: Map<string, ExecutionTotals>;
  total: ExecutionTotals;
}

interface ParentAllocation {
  allocationId: string;
  projectId: string;
  programId: string;
  siId: string;
  fiscalYear: number;
  planStatus: 'draft' | 'active' | 'closed';
}

interface ParentRecurring {
  itemId: string;
  fiscalYear: number;
  planStatus: 'draft' | 'active' | 'closed';
}

interface SpendInfo {
  spendId: string;
  allocationId: string | null;
  recurringItemId: string | null;
  component: 'capex' | 'opex';
  amount: number;
  settlementKind: 'current' | 'prior_year_opening';
  postCloseTreatment: 'charge_current_year' | 'charge_closed_year_reserve' | null;
  fiscalYear: number;
}

export async function loadExecutionAggregates(planId: string): Promise<ExecutionAggregates> {
  const db = getDb();

  const allocationRows = await db
    .select({
      allocationId: projectYearAllocations.id,
      projectId: projectYearAllocations.projectId,
      programId: projectYearAllocations.annualProgramId,
      siId: annualPrograms.siId,
      fiscalYear: annualPlans.fiscalYear,
      planStatus: annualPlans.status,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPrograms, eq(projectYearAllocations.annualProgramId, annualPrograms.id))
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(projectYearAllocations.voidedAt)));

  const recurringRows = await db
    .select({
      itemId: recurringOpsItems.id,
      fiscalYear: annualPlans.fiscalYear,
      planStatus: annualPlans.status,
    })
    .from(recurringOpsItems)
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(recurringOpsItems.voidedAt)));

  const allocations = new Map<string, ParentAllocation>(
    allocationRows.map((row) => [row.allocationId, row]),
  );
  const recurring = new Map<string, ParentRecurring>(
    recurringRows.map((row) => [row.itemId, row]),
  );

  const commitments = await db
    .select()
    .from(commitmentEntries)
    .where(isNull(commitmentEntries.voidedAt));

  const spends = await db
    .select()
    .from(spendEntries)
    .where(isNull(spendEntries.voidedAt));

  const settlementRows = await db
    .select({
      spendEntryId: commitmentSettlements.spendEntryId,
      commitmentEntryId: commitmentSettlements.commitmentEntryId,
      amount: commitmentSettlements.amount,
    })
    .from(commitmentSettlements)
    .innerJoin(spendEntries, eq(commitmentSettlements.spendEntryId, spendEntries.id))
    .where(isNull(spendEntries.voidedAt));

  const spendById = new Map<string, SpendInfo>();
  for (const spend of spends) {
    let fiscalYear = 0;
    let inPlan = false;
    if (spend.projectYearAllocationId) {
      const allocation = allocations.get(spend.projectYearAllocationId);
      if (allocation) {
        fiscalYear = allocation.fiscalYear;
        inPlan = true;
      }
    } else if (spend.recurringOpsItemId) {
      const item = recurring.get(spend.recurringOpsItemId);
      if (item) {
        fiscalYear = item.fiscalYear;
        inPlan = true;
      }
    }
    if (!inPlan) continue;
    spendById.set(spend.id, {
      spendId: spend.id,
      allocationId: spend.projectYearAllocationId,
      recurringItemId: spend.recurringOpsItemId,
      component: spend.component,
      amount: spend.amount,
      settlementKind: spend.settlementKind,
      postCloseTreatment: spend.postCloseTreatment,
      fiscalYear,
    });
  }

  const settledByCommitment = new Map<string, number>();
  const crossYearBySpend = new Map<string, number>();
  for (const settlement of settlementRows) {
    const spend = spendById.get(settlement.spendEntryId);
    if (!spend) continue;
    settledByCommitment.set(
      settlement.commitmentEntryId,
      (settledByCommitment.get(settlement.commitmentEntryId) ?? 0) + settlement.amount,
    );
  }

  const commitmentById = new Map<
    string,
    {
      allocationId: string | null;
      recurringItemId: string | null;
      component: 'capex' | 'opex';
      amount: number;
      fiscalYear: number;
      planStatus: 'draft' | 'active' | 'closed';
    }
  >();
  for (const commitment of commitments) {
    if (commitment.projectYearAllocationId) {
      const allocation = allocations.get(commitment.projectYearAllocationId);
      if (!allocation) continue;
      commitmentById.set(commitment.id, {
        allocationId: allocation.allocationId,
        recurringItemId: null,
        component: commitment.component,
        amount: commitment.amount,
        fiscalYear: allocation.fiscalYear,
        planStatus: allocation.planStatus,
      });
    } else if (commitment.recurringOpsItemId) {
      const item = recurring.get(commitment.recurringOpsItemId);
      if (!item) continue;
      commitmentById.set(commitment.id, {
        allocationId: null,
        recurringItemId: item.itemId,
        component: commitment.component,
        amount: commitment.amount,
        fiscalYear: item.fiscalYear,
        planStatus: item.planStatus,
      });
    }
  }

  const reserveByCommitment = new Map<string, number>();
  const chargedBySpend = new Map<string, number>();
  for (const settlement of settlementRows) {
    const spend = spendById.get(settlement.spendEntryId);
    const commitment = commitmentById.get(settlement.commitmentEntryId);
    if (!spend || !commitment) continue;
    // A post-close split pays a commitment from an earlier year whose plan is
    // already closed; a same-year settlement of a since-closed plan was an
    // ordinary current-year payment when it was recorded and stays one.
    const closedYearSplit =
      commitment.planStatus === 'closed' && commitment.fiscalYear < spend.fiscalYear;
    const portionIsCrossYear = settlementPortionIsCrossYear({
      commitmentFiscalYear: commitment.fiscalYear,
      spendFiscalYear: spend.fiscalYear,
      settlementKind: spend.settlementKind,
      commitmentPlanClosed: closedYearSplit,
      postCloseTreatment: spend.postCloseTreatment,
    });
    if (portionIsCrossYear) {
      crossYearBySpend.set(
        spend.spendId,
        (crossYearBySpend.get(spend.spendId) ?? 0) + settlement.amount,
      );
      if (closedYearSplit && spend.settlementKind === 'current') {
        reserveByCommitment.set(
          settlement.commitmentEntryId,
          (reserveByCommitment.get(settlement.commitmentEntryId) ?? 0) + settlement.amount,
        );
      }
    } else if (closedYearSplit && spend.settlementKind === 'current') {
      chargedBySpend.set(
        spend.spendId,
        (chargedBySpend.get(spend.spendId) ?? 0) + settlement.amount,
      );
    }
  }

  const byAllocation = new Map<string, ExecutionTotals>();
  const byProgram = new Map<string, ExecutionTotals>();
  const bySi = new Map<string, ExecutionTotals>();
  const byProject = new Map<string, ExecutionTotals>();
  const byRecurringItem = new Map<string, ExecutionTotals>();
  const total = emptyExecutionTotals();

  const bucketFor = (
    map: Map<string, ExecutionTotals>,
    key: string,
  ): ExecutionTotals => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyExecutionTotals();
      map.set(key, bucket);
    }
    return bucket;
  };

  const targetsForSpend = (spend: SpendInfo): ExecutionTotals[] => {
    const targets: ExecutionTotals[] = [total];
    if (spend.allocationId) {
      const allocation = allocations.get(spend.allocationId);
      if (allocation) {
        targets.push(bucketFor(byAllocation, allocation.allocationId));
        targets.push(bucketFor(byProgram, allocation.programId));
        targets.push(bucketFor(bySi, allocation.siId));
        targets.push(bucketFor(byProject, allocation.projectId));
      }
    } else if (spend.recurringItemId) {
      targets.push(bucketFor(byRecurringItem, spend.recurringItemId));
    }
    return targets;
  };

  const targetsForCommitment = (
    commitment: { allocationId: string | null; recurringItemId: string | null },
  ): ExecutionTotals[] => {
    const targets: ExecutionTotals[] = [total];
    if (commitment.allocationId) {
      const allocation = allocations.get(commitment.allocationId);
      if (allocation) {
        targets.push(bucketFor(byAllocation, allocation.allocationId));
        targets.push(bucketFor(byProgram, allocation.programId));
        targets.push(bucketFor(bySi, allocation.siId));
        targets.push(bucketFor(byProject, allocation.projectId));
      }
    } else if (commitment.recurringItemId) {
      targets.push(bucketFor(byRecurringItem, commitment.recurringItemId));
    }
    return targets;
  };

  // Commitments: amounts and open amounts per component.
  for (const [commitmentId, commitment] of commitmentById.entries()) {
    const settled = settledByCommitment.get(commitmentId) ?? 0;
    const open = commitment.amount - settled;
    for (const target of targetsForCommitment(commitment)) {
      if (commitment.component === 'capex') {
        target.commitmentCapex += commitment.amount;
        target.openCommitmentCapex += open;
      } else {
        target.commitmentOpex += commitment.amount;
        target.openCommitmentOpex += open;
      }
    }
  }

  // Spend: totals, current-year net, cross-year and prior-year opening splits.
  for (const spend of spendById.values()) {
    const crossYear = crossYearBySpend.get(spend.spendId) ?? 0;
    const targets = targetsForSpend(spend);
    const currentYear =
      spend.settlementKind === 'current' ? spend.amount - crossYear : 0;
    const priorOpening = spend.settlementKind === 'prior_year_opening' ? spend.amount : 0;
    for (const target of targets) {
      if (spend.component === 'capex') {
        target.spendCapex += spend.amount;
        target.currentSpendCapex += currentYear;
        target.crossYearCapex += crossYear;
        target.priorOpeningCapex += priorOpening;
      } else {
        target.spendOpex += spend.amount;
        target.currentSpendOpex += currentYear;
        target.crossYearOpex += crossYear;
        target.priorOpeningOpex += priorOpening;
      }
    }
  }

  // Post-close settlement (#98): a reserve stays on the closed year's
  // commitment side; a current-year charge is current-year money and is
  // already inside currentSpendCapex/currentSpendOpex above.
  for (const [commitmentId, reserved] of reserveByCommitment.entries()) {
    const commitment = commitmentById.get(commitmentId);
    if (!commitment) continue;
    for (const target of targetsForCommitment(commitment)) {
      if (commitment.component === 'capex') target.reserveCapex += reserved;
      else target.reserveOpex += reserved;
    }
  }
  for (const spend of spendById.values()) {
    const charged = chargedBySpend.get(spend.spendId) ?? 0;
    if (charged === 0) continue;
    for (const target of targetsForSpend(spend)) {
      if (spend.component === 'capex') target.chargedCapex += charged;
      else target.chargedOpex += charged;
    }
  }

  return { byAllocation, byProgram, bySi, byProject, byRecurringItem, total };
}
