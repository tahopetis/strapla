import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projects,
  recurringOpsItems,
  strategicInitiatives,
  strategicPlans,
  type StrategicInitiative,
  type StrategicPlan,
} from '@/db/schema';
import { envelopeCheck, type EnvelopeCheck } from '@/domain/plan';

/**
 * Read queries for the plan module. All figures come from the database; money
 * rules come from src/domain.
 */

export async function getCurrentStrategicPlan(): Promise<StrategicPlan | null> {
  const rows = await getDb()
    .select()
    .from(strategicPlans)
    .orderBy(
      sql`case when ${strategicPlans.status} = 'active' then 0 when ${strategicPlans.status} = 'draft' then 1 else 2 end`,
      desc(strategicPlans.createdAt),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getStrategicPlan(id: string): Promise<StrategicPlan | null> {
  const rows = await getDb().select().from(strategicPlans).where(eq(strategicPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface InitiativeEnvelopeRow {
  initiative: StrategicInitiative;
  programBudget: number;
  check: EnvelopeCheck;
}

/** SIs of a plan with their cumulative in-app program budgets and envelope check (BR-2). */
export async function listInitiativeEnvelopeRows(planId: string): Promise<InitiativeEnvelopeRow[]> {
  const rows = await getDb()
    .select({
      initiative: strategicInitiatives,
      programBudget: sql<string>`coalesce(sum(${annualPrograms.capexBudget} + ${annualPrograms.opexBudget}), 0)::text`,
    })
    .from(strategicInitiatives)
    .leftJoin(
      annualPrograms,
      and(
        eq(annualPrograms.siId, strategicInitiatives.id),
        isNull(annualPrograms.voidedAt),
      ),
    )
    .where(and(eq(strategicInitiatives.planId, planId), isNull(strategicInitiatives.voidedAt)))
    .groupBy(strategicInitiatives.id)
    .orderBy(asc(strategicInitiatives.code));

  return rows.map((row) => {
    const programBudget = Number(row.programBudget ?? '0');
    return {
      initiative: row.initiative,
      programBudget,
      check: envelopeCheck({
        envelopeAmount: row.initiative.envelopeAmount,
        priorProgramBudgetUsed: row.initiative.priorProgramBudgetUsed,
        programBudgets: [programBudget],
      }),
    };
  });
}

export interface PlanOverview {
  plan: StrategicPlan;
  initiativeCount: number;
  annualPlanCount: number;
  programCount: number;
  projectCount: number;
  recurringOpsCount: number;
  envelopeTotal: number;
  envelopeTotals: EnvelopeCheck;
}

export async function getPlanOverview(plan: StrategicPlan): Promise<PlanOverview> {
  const db = getDb();
  const [initiativeCount, annualPlanCount, programCount, projectCount, recurringOpsCount] =
    await Promise.all([
      countRows(db.select({ value: sql<string>`count(*)::text` }).from(strategicInitiatives).where(and(eq(strategicInitiatives.planId, plan.id), isNull(strategicInitiatives.voidedAt)))),
      countRows(db.select({ value: sql<string>`count(*)::text` }).from(annualPlans).where(eq(annualPlans.planId, plan.id))),
      countRows(
        db
          .select({ value: sql<string>`count(*)::text` })
          .from(annualPrograms)
          .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
          .where(and(eq(annualPlans.planId, plan.id), isNull(annualPrograms.voidedAt))),
      ),
      countRows(
        db
          .select({ value: sql<string>`count(*)::text` })
          .from(projects)
          .innerJoin(annualPrograms, eq(projects.originatingProgramId, annualPrograms.id))
          .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
          .where(eq(annualPlans.planId, plan.id)),
      ),
      countRows(
        db
          .select({ value: sql<string>`count(*)::text` })
          .from(recurringOpsItems)
          .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
          .where(and(eq(annualPlans.planId, plan.id), isNull(recurringOpsItems.voidedAt))),
      ),
    ]);

  const initiatives = await db
    .select({
      envelopeAmount: strategicInitiatives.envelopeAmount,
      priorProgramBudgetUsed: strategicInitiatives.priorProgramBudgetUsed,
    })
    .from(strategicInitiatives)
    .where(and(eq(strategicInitiatives.planId, plan.id), isNull(strategicInitiatives.voidedAt)));

  const programBudgetRows = await db
    .select({
      siId: annualPrograms.siId,
      total: sql<string>`(coalesce(sum(${annualPrograms.capexBudget} + ${annualPrograms.opexBudget}), 0))::text`,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, plan.id), isNull(annualPrograms.voidedAt)))
    .groupBy(annualPrograms.siId);

  const totals = {
    prior: 0,
    envelope: 0,
    programs: 0,
  };
  for (const initiative of initiatives) {
    totals.envelope += initiative.envelopeAmount;
    totals.prior += initiative.priorProgramBudgetUsed;
  }
  for (const row of programBudgetRows) totals.programs += Number(row.total ?? '0');

  return {
    plan,
    initiativeCount,
    annualPlanCount,
    programCount,
    projectCount,
    recurringOpsCount,
    envelopeTotal: totals.envelope,
    envelopeTotals: {
      consumed: totals.prior + totals.programs,
      remaining: totals.envelope - totals.prior - totals.programs,
      over: totals.envelope - totals.prior - totals.programs < 0,
    },
  };
}

async function countRows(query: PromiseLike<Array<{ value: string }>>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.value ?? '0');
}
