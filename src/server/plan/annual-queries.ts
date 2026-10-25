import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  strategicInitiatives,
  strategicPlans,
  type AnnualPlan,
  type AnnualProgram,
  type StrategicPlan,
} from '@/db/schema';
import { formatEntityCode, programAvailability, type ProgramAvailability } from '@/domain/plan';

/** Read queries for annual plans and annual programs (M1 #6/#7). */

export interface AnnualPlanListRow {
  annualPlan: AnnualPlan;
  programCount: number;
}

export async function listAnnualPlans(planId: string): Promise<AnnualPlanListRow[]> {
  const rows = await getDb()
    .select({
      annualPlan: annualPlans,
      programCount: sql<string>`count(${annualPrograms.id})::text`,
    })
    .from(annualPlans)
    .leftJoin(
      annualPrograms,
      and(eq(annualPrograms.annualPlanId, annualPlans.id), isNull(annualPrograms.voidedAt)),
    )
    .where(eq(annualPlans.planId, planId))
    .groupBy(annualPlans.id)
    .orderBy(asc(annualPlans.fiscalYear));

  return rows.map((row) => ({
    annualPlan: row.annualPlan,
    programCount: Number(row.programCount ?? '0'),
  }));
}

export interface ProgramRow {
  program: AnnualProgram;
  siCode: string;
  siName: string;
  continuationLabel: string | null;
  availability: ProgramAvailability;
}

export interface AnnualPlanDetail {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  programs: ProgramRow[];
  initiativeOptions: Array<{ value: string; label: string }>;
  continuationOptions: Array<{ value: string; label: string }>;
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

  return {
    annualPlan: header.annualPlan,
    strategicPlan: header.strategicPlan,
    programs: programRows.map((row) => ({
      program: row.program,
      siCode: row.siCode,
      siName: row.siName,
      continuationLabel: row.program.prevProgramId
        ? (continuationLabels.get(row.program.prevProgramId) ?? null)
        : null,
      availability: programAvailability(row.program),
    })),
    initiativeOptions: initiativeRows.map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name}`,
    })),
    continuationOptions: previousProgramRows.map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name} (FY${row.fiscalYear}, ${row.siCode})`,
    })),
    suggestedProgramCode: formatEntityCode('program', header.annualPlan.fiscalYear, programRows.length + 1),
  };
}
