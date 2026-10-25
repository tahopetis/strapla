import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projectYearAllocations,
  recurringOpsItems,
  spendCategories,
  strategicInitiatives,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type RecurringOpsItem,
  type StrategicPlan,
} from '@/db/schema';
import { formatEntityCode, programAvailability, type ProgramAvailability } from '@/domain/plan';
import { programBudgetPosition, type ProgramBudgetPosition } from '@/domain/funding';

/** Read queries for annual plans, annual programs and recurring ops (M1 #6/#7/#9). */

export interface AnnualPlanListRow {
  annualPlan: AnnualPlan;
  programCount: number;
  recurringOpsCount: number;
}

export async function listAnnualPlans(planId: string): Promise<AnnualPlanListRow[]> {
  const rows = await getDb()
    .select({
      annualPlan: annualPlans,
      programCount: sql<string>`count(distinct ${annualPrograms.id})::text`,
      recurringOpsCount: sql<string>`count(distinct ${recurringOpsItems.id})::text`,
    })
    .from(annualPlans)
    .leftJoin(
      annualPrograms,
      and(eq(annualPrograms.annualPlanId, annualPlans.id), isNull(annualPrograms.voidedAt)),
    )
    .leftJoin(
      recurringOpsItems,
      and(eq(recurringOpsItems.annualPlanId, annualPlans.id), isNull(recurringOpsItems.voidedAt)),
    )
    .where(eq(annualPlans.planId, planId))
    .groupBy(annualPlans.id)
    .orderBy(asc(annualPlans.fiscalYear));

  return rows.map((row) => ({
    annualPlan: row.annualPlan,
    programCount: Number(row.programCount ?? '0'),
    recurringOpsCount: Number(row.recurringOpsCount ?? '0'),
  }));
}

export interface ProgramRow {
  program: AnnualProgram;
  siCode: string;
  siName: string;
  continuationLabel: string | null;
  availability: ProgramAvailability;
  allocatedCapex: number;
  allocatedOpex: number;
  position: ProgramBudgetPosition;
}

export interface RecurringOpsRow {
  item: RecurringOpsItem;
  categoryName: string | null;
  /** Budget + carry-in; commitments/spend arrive in M3. */
  available: number;
}

export interface AnnualPlanDetail {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  programs: ProgramRow[];
  recurringOps: RecurringOpsRow[];
  initiativeOptions: Array<{ value: string; label: string }>;
  continuationOptions: Array<{ value: string; label: string }>;
  categoryOptions: Array<{ value: string; label: string }>;
  suggestedProgramCode: string;
}

export async function getAnnualPlanDetail(id: string): Promise<AnnualPlanDetail | null> {
  const db = getDb();
  const headerRows = await db
    .select({ annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, id))
    .limit(1);

  const header = headerRows[0];
  if (!header) return null;

  const programRows = await db
    .select({
      program: annualPrograms,
      siCode: strategicInitiatives.code,
      siName: strategicInitiatives.name,
    })
    .from(annualPrograms)
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(and(eq(annualPrograms.annualPlanId, id), isNull(annualPrograms.voidedAt)))
    .orderBy(asc(annualPrograms.code));

  const recurringRows = await db
    .select({
      item: recurringOpsItems,
      categoryName: spendCategories.name,
    })
    .from(recurringOpsItems)
    .leftJoin(spendCategories, eq(recurringOpsItems.categoryId, spendCategories.id))
    .where(and(eq(recurringOpsItems.annualPlanId, id), isNull(recurringOpsItems.voidedAt)))
    .orderBy(asc(recurringOpsItems.name));

  const allocationRows = await db
    .select({
      annualProgramId: projectYearAllocations.annualProgramId,
      capex: sql<string>`coalesce(sum(${projectYearAllocations.allocationCapex}), 0)::text`,
      opex: sql<string>`coalesce(sum(${projectYearAllocations.allocationOpex}), 0)::text`,
    })
    .from(projectYearAllocations)
    .where(and(eq(projectYearAllocations.annualPlanId, id), isNull(projectYearAllocations.voidedAt)))
    .groupBy(projectYearAllocations.annualProgramId);
  const allocationMap = new Map(
    allocationRows.map((row) => [
      row.annualProgramId,
      { capex: Number(row.capex ?? '0'), opex: Number(row.opex ?? '0') },
    ]),
  );

  const continuationIds = programRows
    .map((row) => row.program.prevProgramId)
    .filter((value): value is string => Boolean(value));

  const continuationLabels = new Map<string, string>();
  if (continuationIds.length > 0) {
    const previousRows = await db
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
      .where(inArray(annualPrograms.id, continuationIds));
    for (const row of previousRows) {
      continuationLabels.set(
        row.id,
        `${row.code} · ${row.name} (FY${row.fiscalYear}, ${row.siCode})`,
      );
    }
  }

  const initiativeRows = await db
    .select({ id: strategicInitiatives.id, code: strategicInitiatives.code, name: strategicInitiatives.name })
    .from(strategicInitiatives)
    .where(
      and(
        eq(strategicInitiatives.planId, header.strategicPlan.id),
        isNull(strategicInitiatives.voidedAt),
      ),
    )
    .orderBy(asc(strategicInitiatives.code));

  const previousProgramRows = await db
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
    .where(
      and(
        eq(annualPlans.planId, header.strategicPlan.id),
        lt(annualPlans.fiscalYear, header.annualPlan.fiscalYear),
        isNull(annualPrograms.voidedAt),
      ),
    )
    .orderBy(asc(annualPlans.fiscalYear), asc(annualPrograms.code));

  const categoryRows = await db
    .select({ id: spendCategories.id, name: spendCategories.name })
    .from(spendCategories)
    .where(eq(spendCategories.isActive, true))
    .orderBy(asc(spendCategories.sortOrder), asc(spendCategories.name));

  return {
    annualPlan: header.annualPlan,
    strategicPlan: header.strategicPlan,
    programs: programRows.map((row) => {
      const allocated = allocationMap.get(row.program.id) ?? { capex: 0, opex: 0 };
      return {
        program: row.program,
        siCode: row.siCode,
        siName: row.siName,
        continuationLabel: row.program.prevProgramId
          ? (continuationLabels.get(row.program.prevProgramId) ?? null)
          : null,
        availability: programAvailability(row.program),
        allocatedCapex: allocated.capex,
        allocatedOpex: allocated.opex,
        position: programBudgetPosition({
          capexBudget: row.program.capexBudget,
          opexBudget: row.program.opexBudget,
          carryInCapex: row.program.carryInCapex,
          carryInOpex: row.program.carryInOpex,
          allocatedCapex: allocated.capex,
          allocatedOpex: allocated.opex,
        }),
      };
    }),
    recurringOps: recurringRows.map((row) => ({
      item: row.item,
      categoryName: row.categoryName,
      available: row.item.opexBudget + row.item.carryInOpex,
    })),
    initiativeOptions: initiativeRows.map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name}`,
    })),
    continuationOptions: previousProgramRows.map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name} (FY${row.fiscalYear}, ${row.siCode})`,
    })),
    categoryOptions: categoryRows.map((row) => ({ value: row.id, label: row.name })),
    suggestedProgramCode: formatEntityCode('program', header.annualPlan.fiscalYear, programRows.length + 1),
  };
}
