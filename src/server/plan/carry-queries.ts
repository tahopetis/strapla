import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  carryOverEntries,
  closeSnapshots,
  projectYearAllocations,
  projects,
  users,
  type CarryOverEntry,
  type CloseSnapshot,
} from '@/db/schema';
import type { ComponentAmounts } from '@/domain/revisions';

/**
 * Read queries for the carry-over ledger and the close snapshots (#113,
 * ADR-0006 §2–3). The ledger is the single source of carry-in; the `carry_in_*`
 * columns are a cache that the ledger service keeps equal to these sums.
 */

export interface CarryInMaps {
  /** Ledger sum per program id, per component. */
  programs: Map<string, ComponentAmounts>;
  /** Ledger sum per project year allocation id, per component. */
  allocations: Map<string, ComponentAmounts>;
}

function emptyCarryInMaps(): CarryInMaps {
  return { programs: new Map(), allocations: new Map() };
}

/** Carry-in received by the plan's programs and allocations, derived from the ledger. */
export async function getCarryInForPlan(annualPlanId: string): Promise<CarryInMaps> {
  const rows = await getDb()
    .select({
      entityType: carryOverEntries.entityType,
      targetEntityId: carryOverEntries.targetEntityId,
      component: carryOverEntries.component,
      total: sql<string>`coalesce(sum(${carryOverEntries.amount}), 0)::text`,
    })
    .from(carryOverEntries)
    .where(eq(carryOverEntries.targetAnnualPlanId, annualPlanId))
    .groupBy(
      carryOverEntries.entityType,
      carryOverEntries.targetEntityId,
      carryOverEntries.component,
    );

  const maps = emptyCarryInMaps();
  for (const row of rows) {
    const target = row.entityType === 'program' ? maps.programs : maps.allocations;
    const current = target.get(row.targetEntityId) ?? { capex: 0, opex: 0 };
    current[row.component] += Number(row.total ?? '0');
    target.set(row.targetEntityId, current);
  }
  return maps;
}

/**
 * Receipts that funded specific entities of a plan, newest first. The close uses
 * it to record carry-of-carry lineage when an entity's carry-in came from
 * exactly one receipt, so the chain is reconstructable without guessing among
 * fungible receipts.
 */
export async function listReceiptEntriesForEntities(
  annualPlanId: string,
  entities: ReadonlyArray<{ entityType: 'program' | 'allocation'; entityId: string }>,
): Promise<CarryOverEntry[]> {
  const programIds = entities
    .filter((entity) => entity.entityType === 'program')
    .map((entity) => entity.entityId);
  const allocationIds = entities
    .filter((entity) => entity.entityType === 'allocation')
    .map((entity) => entity.entityId);
  if (programIds.length === 0 && allocationIds.length === 0) return [];

  const kinds = or(
    programIds.length > 0
      ? and(
          eq(carryOverEntries.entityType, 'program'),
          inArray(carryOverEntries.targetEntityId, programIds),
        )
      : undefined,
    allocationIds.length > 0
      ? and(
          eq(carryOverEntries.entityType, 'allocation'),
          inArray(carryOverEntries.targetEntityId, allocationIds),
        )
      : undefined,
  );

  return getDb()
    .select()
    .from(carryOverEntries)
    .where(and(eq(carryOverEntries.targetAnnualPlanId, annualPlanId), kinds))
    .orderBy(desc(carryOverEntries.createdAt));
}

interface EntityLabelInput {
  entityType: 'program' | 'allocation';
  targetEntityId: string;
  sourceEntityId: string | null;
}

interface EntityLabels {
  programLabels: Map<string, string>;
  allocationLabels: Map<string, string>;
}

/** `FY2028 · PRG-2028-01` / `FY2028 · PRJ-2028-001` labels for ledger entities. */
async function loadEntityLabels(rows: readonly EntityLabelInput[]): Promise<EntityLabels> {
  const db = getDb();
  const programIds = new Set<string>();
  const allocationIds = new Set<string>();
  for (const row of rows) {
    if (row.entityType === 'program') programIds.add(row.targetEntityId);
    else allocationIds.add(row.targetEntityId);
    if (row.sourceEntityId) {
      if (row.entityType === 'program') programIds.add(row.sourceEntityId);
      else allocationIds.add(row.sourceEntityId);
    }
  }

  const [programRows, allocationRows] = await Promise.all([
    programIds.size === 0
      ? Promise.resolve([])
      : db
          .select({
            id: annualPrograms.id,
            code: annualPrograms.code,
            fiscalYear: annualPlans.fiscalYear,
          })
          .from(annualPrograms)
          .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
          .where(inArray(annualPrograms.id, [...programIds])),
    allocationIds.size === 0
      ? Promise.resolve([])
      : db
          .select({
            id: projectYearAllocations.id,
            projectCode: projects.code,
            fiscalYear: annualPlans.fiscalYear,
          })
          .from(projectYearAllocations)
          .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
          .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
          .where(inArray(projectYearAllocations.id, [...allocationIds])),
  ]);

  return {
    programLabels: new Map(
      programRows.map((row) => [row.id, `FY${row.fiscalYear} · ${row.code}`]),
    ),
    allocationLabels: new Map(
      allocationRows.map((row) => [row.id, `FY${row.fiscalYear} · ${row.projectCode}`]),
    ),
  };
}

export interface CarryRegisterRow {
  entry: CarryOverEntry;
  /** `FY2027 · PRG-2027-01` for a close receipt; null for an opening/manual receipt. */
  sourceLabel: string | null;
  /** `FY2028 · PRG-2028-02`. */
  targetLabel: string;
  createdByName: string | null;
}

/**
 * The ledger register, newest first. Pass `targetAnnualPlanId` for what a year
 * received and `sourceAnnualPlanId` for what it gave away.
 */
export async function listCarryRegister(input: {
  targetAnnualPlanId?: string;
  sourceAnnualPlanId?: string;
}): Promise<CarryRegisterRow[]> {
  const scope = [
    input.targetAnnualPlanId
      ? eq(carryOverEntries.targetAnnualPlanId, input.targetAnnualPlanId)
      : undefined,
    input.sourceAnnualPlanId
      ? eq(carryOverEntries.sourceAnnualPlanId, input.sourceAnnualPlanId)
      : undefined,
  ].filter((clause) => clause !== undefined);
  if (scope.length === 0) return [];

  const rows = await getDb()
    .select({ entry: carryOverEntries, createdByName: users.name })
    .from(carryOverEntries)
    .leftJoin(users, eq(carryOverEntries.createdBy, users.id))
    .where(scope.length === 1 ? scope[0] : and(...scope))
    .orderBy(desc(carryOverEntries.createdAt));

  const labels = await loadEntityLabels(
    rows.map(({ entry }) => ({
      entityType: entry.entityType,
      targetEntityId: entry.targetEntityId,
      sourceEntityId: entry.sourceEntityId,
    })),
  );

  return rows.map(({ entry, createdByName }) => {
    const map = entry.entityType === 'program' ? labels.programLabels : labels.allocationLabels;
    return {
      entry,
      sourceLabel: entry.sourceEntityId ? (map.get(entry.sourceEntityId) ?? null) : null,
      targetLabel: map.get(entry.targetEntityId) ?? entry.targetEntityId,
      createdByName: createdByName ?? null,
    };
  });
}

export interface CloseSnapshotRow {
  snapshot: CloseSnapshot;
  label: string;
}

/** The immutable close snapshot rows of one annual plan. */
export async function listCloseSnapshots(annualPlanId: string): Promise<CloseSnapshotRow[]> {
  const rows = await getDb()
    .select()
    .from(closeSnapshots)
    .where(eq(closeSnapshots.annualPlanId, annualPlanId))
    .orderBy(
      asc(closeSnapshots.entityType),
      asc(closeSnapshots.entityId),
      asc(closeSnapshots.component),
    );
  if (rows.length === 0) return [];

  const labels = await loadEntityLabels(
    rows.map((snapshot) => ({
      entityType: snapshot.entityType,
      targetEntityId: snapshot.entityId,
      sourceEntityId: null,
    })),
  );
  return rows.map((snapshot) => {
    const map = snapshot.entityType === 'program' ? labels.programLabels : labels.allocationLabels;
    return { snapshot, label: map.get(snapshot.entityId) ?? snapshot.entityId };
  });
}

/** Key of one source entity and component in the close invariant map. */
export function carryInvariantKey(
  entityType: 'program' | 'allocation',
  entityId: string,
  component: 'capex' | 'opex',
): string {
  return `${entityType}:${entityId}:${component}`;
}

/**
 * What the close actually wrote, per source entity and component. The close
 * compares this with the snapshot rows in the same transaction: carried must
 * equal the sum of the entries written for that entity and component.
 */
export async function summarizeCloseEntries(
  executor: Pick<Db, 'select'>,
  sourceAnnualPlanId: string,
): Promise<Map<string, number>> {
  const rows = await executor
    .select({
      entityType: carryOverEntries.entityType,
      sourceEntityId: carryOverEntries.sourceEntityId,
      component: carryOverEntries.component,
      total: sql<string>`coalesce(sum(${carryOverEntries.amount}), 0)::text`,
    })
    .from(carryOverEntries)
    .where(eq(carryOverEntries.sourceAnnualPlanId, sourceAnnualPlanId))
    .groupBy(
      carryOverEntries.entityType,
      carryOverEntries.sourceEntityId,
      carryOverEntries.component,
    );

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.sourceEntityId) continue;
    totals.set(
      carryInvariantKey(row.entityType, row.sourceEntityId, row.component),
      Number(row.total ?? '0'),
    );
  }
  return totals;
}

/** The entities of one plan that can receive a reasoned carry-in receipt. */
export interface CarryTargetOptions {
  programs: Array<{ id: string; label: string }>;
  allocations: Array<{ id: string; label: string }>;
}

/** Programs and project year allocations of a plan, labelled for the receipt form. */
export async function listCarryTargetOptions(annualPlanId: string): Promise<CarryTargetOptions> {
  const db = getDb();
  const [programRows, allocationRows] = await Promise.all([
    db
      .select({ id: annualPrograms.id, code: annualPrograms.code, name: annualPrograms.name })
      .from(annualPrograms)
      .where(
        and(eq(annualPrograms.annualPlanId, annualPlanId), isNull(annualPrograms.voidedAt)),
      )
      .orderBy(asc(annualPrograms.code)),
    db
      .select({
        id: projectYearAllocations.id,
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
  ]);

  return {
    programs: programRows.map((row) => ({
      id: row.id,
      label: `${row.code} · ${row.name}`,
    })),
    allocations: allocationRows.map((row) => ({
      id: row.id,
      label: `${row.projectCode} · ${row.projectName} · ${row.programCode}`,
    })),
  };
}
