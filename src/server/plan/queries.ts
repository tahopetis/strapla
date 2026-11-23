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
import { NO_DELTAS } from '@/domain/revisions';
import { getRevisionDeltasForEntities } from './revision-queries';

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
  /** Sum of the SI's effective capex program budgets (initial + posted revisions). */
  programCapex: number;
  /** Sum of the SI's effective opex program budgets (initial + posted revisions). */
  programOpex: number;
  /** Number of live in-app programs under the SI. */
  programCount: number;
  check: EnvelopeCheck;
}

/**
 * SIs of a plan with their cumulative effective program budgets and the
 * per-component envelope check (BR-2, ADR-0006 §5). A program's effective
 * budget is its initial budget plus every posted revision delta (#112); carry-in
 * is excluded from the check because it was already counted in the source year.
 */
export async function listInitiativeEnvelopeRows(planId: string): Promise<InitiativeEnvelopeRow[]> {
  const db = getDb();
  const [initiatives, programs] = await Promise.all([
    db
      .select()
      .from(strategicInitiatives)
      .where(and(eq(strategicInitiatives.planId, planId), isNull(strategicInitiatives.voidedAt)))
      .orderBy(asc(strategicInitiatives.code)),
    db
      .select({
        id: annualPrograms.id,
        siId: annualPrograms.siId,
        capexBudget: annualPrograms.capexBudget,
        opexBudget: annualPrograms.opexBudget,
      })
      .from(annualPrograms)
      .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
      .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt))),
  ]);

  // Effective budgets: initial figure plus posted revision deltas, per component.
  const deltas = await getRevisionDeltasForEntities({
    programIds: programs.map((program) => program.id),
  });

  const byInitiative = new Map<string, { capex: number; opex: number; count: number }>();
  for (const program of programs) {
    const delta = deltas.byProgram.get(program.id) ?? NO_DELTAS;
    const current = byInitiative.get(program.siId) ?? { capex: 0, opex: 0, count: 0 };
    current.capex += program.capexBudget + delta.capex;
    current.opex += program.opexBudget + delta.opex;
    current.count += 1;
    byInitiative.set(program.siId, current);
  }

  return initiatives.map((initiative) => {
    const program = byInitiative.get(initiative.id) ?? { capex: 0, opex: 0, count: 0 };
    return {
      initiative,
      programCapex: program.capex,
      programOpex: program.opex,
      programCount: program.count,
      check: envelopeCheck({
        envelopeCapex: initiative.envelopeCapex,
        envelopeOpex: initiative.envelopeOpex,
        priorCapex: initiative.priorProgramBudgetUsedCapex,
        priorOpex: initiative.priorProgramBudgetUsedOpex,
        programCapex: [program.capex],
        programOpex: [program.opex],
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
  /** Total five-year capex envelope across the plan's SIs. */
  envelopeCapexTotal: number;
  /** Total five-year opex envelope across the plan's SIs. */
  envelopeOpexTotal: number;
  /** BR-2 per component, over the whole plan. */
  envelopeTotals: EnvelopeCheck;
}

export async function getPlanOverview(plan: StrategicPlan): Promise<PlanOverview> {
  const db = getDb();
  const [initiativeCount, annualPlanCount, projectCount, recurringOpsCount, programs] =
    await Promise.all([
      countRows(db.select({ value: sql<string>`count(*)::text` }).from(strategicInitiatives).where(and(eq(strategicInitiatives.planId, plan.id), isNull(strategicInitiatives.voidedAt)))),
      countRows(db.select({ value: sql<string>`count(*)::text` }).from(annualPlans).where(eq(annualPlans.planId, plan.id))),
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
      db
        .select({
          id: annualPrograms.id,
          capexBudget: annualPrograms.capexBudget,
          opexBudget: annualPrograms.opexBudget,
        })
        .from(annualPrograms)
        .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
        .where(and(eq(annualPlans.planId, plan.id), isNull(annualPrograms.voidedAt))),
    ]);

  const initiatives = await db
    .select({
      envelopeCapex: strategicInitiatives.envelopeCapex,
      envelopeOpex: strategicInitiatives.envelopeOpex,
      priorCapex: strategicInitiatives.priorProgramBudgetUsedCapex,
      priorOpex: strategicInitiatives.priorProgramBudgetUsedOpex,
    })
    .from(strategicInitiatives)
    .where(and(eq(strategicInitiatives.planId, plan.id), isNull(strategicInitiatives.voidedAt)));

  // The BR-2 check counts effective budgets, not the initial columns: a posted
  // revision moves the program's contribution (#112, ADR-0006 §4).
  const deltas = await getRevisionDeltasForEntities({
    programIds: programs.map((program) => program.id),
  });

  const totals = {
    envelopeCapex: 0,
    envelopeOpex: 0,
    priorCapex: 0,
    priorOpex: 0,
    programCapex: 0,
    programOpex: 0,
  };
  for (const initiative of initiatives) {
    totals.envelopeCapex += initiative.envelopeCapex;
    totals.envelopeOpex += initiative.envelopeOpex;
    totals.priorCapex += initiative.priorCapex;
    totals.priorOpex += initiative.priorOpex;
  }
  for (const program of programs) {
    const delta = deltas.byProgram.get(program.id) ?? NO_DELTAS;
    totals.programCapex += program.capexBudget + delta.capex;
    totals.programOpex += program.opexBudget + delta.opex;
  }

  return {
    plan,
    initiativeCount,
    annualPlanCount,
    programCount: programs.length,
    projectCount,
    recurringOpsCount,
    envelopeCapexTotal: totals.envelopeCapex,
    envelopeOpexTotal: totals.envelopeOpex,
    envelopeTotals: envelopeCheck({
      envelopeCapex: totals.envelopeCapex,
      envelopeOpex: totals.envelopeOpex,
      priorCapex: totals.priorCapex,
      priorOpex: totals.priorOpex,
      programCapex: [totals.programCapex],
      programOpex: [totals.programOpex],
    }),
  };
}

async function countRows(query: PromiseLike<Array<{ value: string }>>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.value ?? '0');
}
