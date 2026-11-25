import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  carryOverEntries,
  projectYearAllocations,
  projects,
  strategicInitiatives,
  type AnnualPlan,
  type AnnualProgram,
  type StrategicInitiative,
} from '@/db/schema';
import { revisedProgramBudgetPosition, type ProgramBudgetPosition } from '@/domain/funding';
import { NO_DELTAS } from '@/domain/revisions';
import { getRevisionDeltasForEntities, type RevisionDeltaMaps } from './revision-queries';

/** Program thread queries (M4 #22): continuation chains across fiscal years. */

export interface ThreadCarryOver {
  capex: number;
  opex: number;
  reference: string | null;
  sourceFiscalYear: number | null;
}

export interface ProgramThreadEntry {
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  si: StrategicInitiative;
  allocatedCapex: number;
  allocatedOpex: number;
  position: ProgramBudgetPosition;
  /** Posted budget revision deltas per component (ADR-0006 §4). */
  revisionCapex: number;
  revisionOpex: number;
  projectCount: number;
  carryOver: ThreadCarryOver;
}

export interface ProgramThread {
  entries: ProgramThreadEntry[];
  currentId: string;
}

interface LoadedProgram {
  program: AnnualProgram;
  annualPlan: AnnualPlan;
  si: StrategicInitiative;
}

async function loadProgramsOfPlan(planId: string): Promise<{
  programs: LoadedProgram[];
  byId: Map<string, LoadedProgram>;
}> {
  const rows = await getDb()
    .select({ program: annualPrograms, annualPlan: annualPlans, si: strategicInitiatives })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .innerJoin(strategicInitiatives, eq(annualPrograms.siId, strategicInitiatives.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)));
  const programs = rows;
  return { programs, byId: new Map(programs.map((row) => [row.program.id, row])) };
}

async function loadThreadData(programIds: string[]): Promise<{
  allocations: Map<string, { capex: number; opex: number }>;
  projectCounts: Map<string, number>;
  carryOvers: Map<string, ThreadCarryOver>;
  revisions: RevisionDeltaMaps;
}> {
  if (programIds.length === 0) {
    return {
      allocations: new Map(),
      projectCounts: new Map(),
      carryOvers: new Map(),
      revisions: { byProgram: new Map(), byAllocation: new Map() },
    };
  }
  const db = getDb();

  const allocationRows = await db
    .select({
      id: projectYearAllocations.id,
      programId: projectYearAllocations.annualProgramId,
      capex: projectYearAllocations.allocationCapex,
      opex: projectYearAllocations.allocationOpex,
    })
    .from(projectYearAllocations)
    .where(
      and(
        inArray(projectYearAllocations.annualProgramId, programIds),
        isNull(projectYearAllocations.voidedAt),
      ),
    );
  // Effective allocations and budgets: the thread shows the money after every
  // posted revision (#112, ADR-0006 §4), not the initial figures.
  const revisions = await getRevisionDeltasForEntities({
    programIds,
    allocationIds: allocationRows.map((row) => row.id),
  });
  const allocations = new Map<string, { capex: number; opex: number }>();
  for (const row of allocationRows) {
    const delta = revisions.byAllocation.get(row.id) ?? NO_DELTAS;
    const current = allocations.get(row.programId) ?? { capex: 0, opex: 0 };
    current.capex += row.capex + delta.capex;
    current.opex += row.opex + delta.opex;
    allocations.set(row.programId, current);
  }

  const projectRows = await db
    .select({ programId: projects.originatingProgramId })
    .from(projects)
    .where(eq(projects.status, 'active'));
  const projectCounts = new Map<string, number>();
  for (const row of projectRows) {
    if (!programIds.includes(row.programId)) continue;
    projectCounts.set(row.programId, (projectCounts.get(row.programId) ?? 0) + 1);
  }

  const carryRows = await db
    .select({
      targetEntityId: carryOverEntries.targetEntityId,
      component: carryOverEntries.component,
      amount: carryOverEntries.amount,
      approvalReference: carryOverEntries.approvalReference,
      sourceFiscalYear: annualPlans.fiscalYear,
    })
    .from(carryOverEntries)
    .innerJoin(annualPlans, eq(carryOverEntries.sourceAnnualPlanId, annualPlans.id))
    .where(
      and(
        eq(carryOverEntries.entityType, 'program'),
        inArray(carryOverEntries.targetEntityId, programIds),
      ),
    );
  const carryOvers = new Map<string, ThreadCarryOver>();
  for (const row of carryRows) {
    const current = carryOvers.get(row.targetEntityId) ?? {
      capex: 0,
      opex: 0,
      reference: row.approvalReference,
      sourceFiscalYear: row.sourceFiscalYear,
    };
    if (row.component === 'capex') current.capex += row.amount;
    else current.opex += row.amount;
    carryOvers.set(row.targetEntityId, current);
  }

  return { allocations, projectCounts, carryOvers, revisions };
}

function buildEntry(
  loaded: LoadedProgram,
  data: Awaited<ReturnType<typeof loadThreadData>>,
): ProgramThreadEntry {
  const allocated = data.allocations.get(loaded.program.id) ?? { capex: 0, opex: 0 };
  const revision = data.revisions.byProgram.get(loaded.program.id) ?? NO_DELTAS;
  const position = revisedProgramBudgetPosition({
    capexBudget: loaded.program.capexBudget,
    opexBudget: loaded.program.opexBudget,
    revision,
    carryInCapex: loaded.program.carryInCapex,
    carryInOpex: loaded.program.carryInOpex,
    allocatedCapex: allocated.capex,
    allocatedOpex: allocated.opex,
  });
  return {
    program: loaded.program,
    annualPlan: loaded.annualPlan,
    si: loaded.si,
    allocatedCapex: allocated.capex,
    allocatedOpex: allocated.opex,
    position,
    revisionCapex: revision.capex,
    revisionOpex: revision.opex,
    projectCount: data.projectCounts.get(loaded.program.id) ?? 0,
    carryOver: data.carryOvers.get(loaded.program.id) ?? {
      capex: 0,
      opex: 0,
      reference: null,
      sourceFiscalYear: null,
    },
  };
}

export async function getProgramThread(programId: string): Promise<ProgramThread | null> {
  const seedRows = await getDb()
    .select({ planId: annualPlans.planId })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(eq(annualPrograms.id, programId))
    .limit(1);
  if (!seedRows[0]) return null;

  const { byId } = await loadProgramsOfPlan(seedRows[0].planId);
  const current = byId.get(programId);
  if (!current) return null;

  const chain: LoadedProgram[] = [current];
  const seen = new Set<string>([programId]);
  let cursor = current.program;
  for (let depth = 0; depth < 20; depth += 1) {
    if (!cursor.prevProgramId) break;
    const previous = byId.get(cursor.prevProgramId);
    if (!previous || seen.has(previous.program.id)) break;
    chain.unshift(previous);
    seen.add(previous.program.id);
    cursor = previous.program;
  }

  const children = new Map<string, LoadedProgram[]>();
  for (const row of byId.values()) {
    if (!row.program.prevProgramId) continue;
    const list = children.get(row.program.prevProgramId) ?? [];
    list.push(row);
    children.set(row.program.prevProgramId, list);
  }
  let forward = current;
  for (let depth = 0; depth < 20; depth += 1) {
    const nextList: LoadedProgram[] = children.get(forward.program.id) ?? [];
    const next = nextList.find((candidate) => !seen.has(candidate.program.id));
    if (!next) break;
    chain.push(next);
    seen.add(next.program.id);
    forward = next;
  }

  const data = await loadThreadData(chain.map((row) => row.program.id));
  return { entries: chain.map((row) => buildEntry(row, data)), currentId: programId };
}

export interface ProgramThreadSummary {
  rootId: string;
  entries: Array<{
    programId: string;
    code: string;
    name: string;
    fiscalYear: number;
    status: AnnualPlan['status'];
    siCode: string;
  }>;
}

export async function listProgramThreads(planId: string): Promise<ProgramThreadSummary[]> {
  const { programs, byId } = await loadProgramsOfPlan(planId);
  const roots = programs
    .filter((row) => !row.program.prevProgramId || !byId.has(row.program.prevProgramId))
    .sort((a, b) => a.annualPlan.fiscalYear - b.annualPlan.fiscalYear || a.program.code.localeCompare(b.program.code));

  const children = new Map<string, LoadedProgram[]>();
  for (const row of programs) {
    if (!row.program.prevProgramId) continue;
    const list = children.get(row.program.prevProgramId) ?? [];
    list.push(row);
    children.set(row.program.prevProgramId, list);
  }

  const summaries: ProgramThreadSummary[] = [];
  for (const root of roots) {
    const entries: ProgramThreadSummary['entries'] = [];
    const seen = new Set<string>();
    let cursor: LoadedProgram | undefined = root;
    while (cursor && !seen.has(cursor.program.id)) {
      seen.add(cursor.program.id);
      entries.push({
        programId: cursor.program.id,
        code: cursor.program.code,
        name: cursor.program.name,
        fiscalYear: cursor.annualPlan.fiscalYear,
        status: cursor.annualPlan.status,
        siCode: cursor.si.code,
      });
      const nextList: LoadedProgram[] = children.get(cursor.program.id) ?? [];
      cursor = nextList.find((candidate) => !seen.has(candidate.program.id));
    }
    summaries.push({ rootId: root.program.id, entries });
  }
  return summaries;
}
