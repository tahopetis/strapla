import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  auditEntries,
  commitmentEntries,
  ijinPrinsipRecords,
  projects,
  projectYearAllocations,
  recurringOpsItems,
  users,
} from '@/db/schema';
import { CORRECTION_ACTION } from '@/domain/corrections';

/**
 * "Corrected after close" read from the audit trail (ADR-0007 §6).
 *
 * A closed-year correction is an ordinary in-place update audited under the
 * `correction` action, so nothing new is stored: the marker is the presence of
 * a `correction` entry for the entity. This module turns the trail into the two
 * shapes the product needs.
 *
 * - {@link loadCorrectionMarkers} answers "which records of this plan were
 *   corrected", plus the derived groups the four reports need. A row is marked
 *   only when a record that **moves that row's figures** was corrected: a
 *   program row is marked for a corrected program, one of its allocations or one
 *   of its commitments, but not for a corrected project name or ijin document —
 *   correcting metadata never changes the money a report adds up.
 * - {@link listPlanCorrections} answers "what was corrected in this fiscal
 *   year", with a label, a link, the reason and the actor, for the closed
 *   annual plan's banner and the close receipt notice.
 *
 * The close snapshot and the carry-over ledger are deliberately absent here:
 * a correction never writes them (ADR-0007 §4), so there is nothing to mark.
 */

/** The six record types a closed year accepts corrections for (ADR-0007 §2). */
export type CorrectionEntityType =
  | 'annual_program'
  | 'project_year_allocation'
  | 'project'
  | 'ijin_prinsip'
  | 'recurring_ops_item'
  | 'commitment_entry';

export const CORRECTION_ENTITY_TYPES: readonly CorrectionEntityType[] = [
  'annual_program',
  'project_year_allocation',
  'project',
  'ijin_prinsip',
  'recurring_ops_item',
  'commitment_entry',
];

const ENTITY_TYPE_LABELS: Record<CorrectionEntityType, string> = {
  annual_program: 'Annual program',
  project_year_allocation: 'Project year allocation',
  project: 'Project',
  ijin_prinsip: 'Ijin prinsip',
  recurring_ops_item: 'Recurring ops item',
  commitment_entry: 'Commitment entry',
};

/** One corrected record, ready for the banner and the receipt notice. */
export interface PlanCorrection {
  entityType: CorrectionEntityType;
  entityTypeLabel: string;
  entityId: string;
  /** What the record is called on screen, e.g. `PRG-2027-001 · Workplace Modernisation`. */
  label: string;
  /** Where to read the record, e.g. `/plan/projects/<id>/allocations/<id>`. */
  href: string;
  correctedAt: Date;
  reason: string | null;
  actorName: string | null;
  actorEmail: string | null;
}

/**
 * The correction markers one strategic plan's reports need. Record ids are
 * UUIDs, so `corrected` holding every entity id is unambiguous; the named sets
 * are the rows a report actually renders.
 */
export interface CorrectionMarkers {
  /** Every corrected record id, for a per-record badge. */
  corrected: ReadonlySet<string>;
  /**
   * Program ids whose annual-plan or budget-vs-actual row shows a corrected
   * figure: a corrected program, one of its allocations, or one of its
   * commitments — never a metadata-only correction elsewhere in its thread.
   */
  programs: ReadonlySet<string>;
  /** Initiative ids whose five-year row aggregates a corrected program, allocation or commitment. */
  initiatives: ReadonlySet<string>;
  /**
   * Project ids whose register row shows a corrected figure: a corrected
   * project, its ijin prinsip, one of its allocations or one of its commitments.
   */
  projects: ReadonlySet<string>;
  /**
   * Recurring ops item ids whose row shows a corrected figure: the item itself
   * or one of the commitments booked against it.
   */
  recurringItems: ReadonlySet<string>;
}

function emptyMarkers(): CorrectionMarkers {
  return {
    corrected: new Set(),
    programs: new Set(),
    initiatives: new Set(),
    projects: new Set(),
    recurringItems: new Set(),
  };
}

/** A plan record, loaded with the keys the marker grouping and the links need. */
interface PlanRecord {
  entityType: CorrectionEntityType;
  entityId: string;
  label: string;
  href: string;
  annualPlanId: string;
  programId: string | null;
  projectId: string | null;
  initiativeId: string | null;
  recurringItemId: string | null;
}

/**
 * Loads every correctable record of the given fiscal years, with the label and
 * the link each one is shown under. Records are keyed by their UUID, which is
 * unique across the six tables.
 */
async function loadPlanRecords(
  planIds: readonly string[],
): Promise<Map<string, PlanRecord>> {
  const records = new Map<string, PlanRecord>();
  if (planIds.length === 0) return records;

  const db = getDb();
  const planRows = await db
    .select({ id: annualPlans.id, fiscalYear: annualPlans.fiscalYear })
    .from(annualPlans)
    .where(inArray(annualPlans.id, [...planIds]));
  const fiscalYearByPlan = new Map(planRows.map((row) => [row.id, row.fiscalYear]));

  const programRows = await db
    .select({
      id: annualPrograms.id,
      annualPlanId: annualPrograms.annualPlanId,
      siId: annualPrograms.siId,
      code: annualPrograms.code,
      name: annualPrograms.name,
    })
    .from(annualPrograms)
    .where(inArray(annualPrograms.annualPlanId, [...planIds]));
  const programById = new Map(programRows.map((row) => [row.id, row]));
  for (const program of programRows) {
    records.set(program.id, {
      entityType: 'annual_program',
      entityId: program.id,
      label: `${program.code} · ${program.name}`,
      href: `/plan/annual/${program.annualPlanId}`,
      annualPlanId: program.annualPlanId,
      programId: program.id,
      projectId: null,
      initiativeId: program.siId,
      recurringItemId: null,
    });
  }

  const allocationRows = await db
    .select({
      id: projectYearAllocations.id,
      projectId: projectYearAllocations.projectId,
      annualPlanId: projectYearAllocations.annualPlanId,
      annualProgramId: projectYearAllocations.annualProgramId,
    })
    .from(projectYearAllocations)
    .where(inArray(projectYearAllocations.annualPlanId, [...planIds]));
  const allocationById = new Map(allocationRows.map((row) => [row.id, row]));
  for (const allocation of allocationRows) {
    const program = programById.get(allocation.annualProgramId);
    const fiscalYear = fiscalYearByPlan.get(allocation.annualPlanId);
    records.set(allocation.id, {
      entityType: 'project_year_allocation',
      entityId: allocation.id,
      label: `FY${fiscalYear} allocation · ${program?.code ?? 'program'}`,
      href: `/plan/projects/${allocation.projectId}/allocations/${allocation.id}`,
      annualPlanId: allocation.annualPlanId,
      programId: allocation.annualProgramId,
      projectId: allocation.projectId,
      initiativeId: program?.siId ?? null,
      recurringItemId: null,
    });
  }

  const programIds = programRows.map((row) => row.id);
  const projectRows =
    programIds.length === 0
      ? []
      : await db
          .select({
            id: projects.id,
            originatingProgramId: projects.originatingProgramId,
            code: projects.code,
            name: projects.name,
          })
          .from(projects)
          .where(inArray(projects.originatingProgramId, programIds));
  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  for (const project of projectRows) {
    const program = programById.get(project.originatingProgramId);
    if (!program) continue;
    records.set(project.id, {
      entityType: 'project',
      entityId: project.id,
      label: `${project.code} · ${project.name}`,
      href: `/plan/projects/${project.id}`,
      annualPlanId: program.annualPlanId,
      programId: program.id,
      projectId: project.id,
      initiativeId: program.siId,
      recurringItemId: null,
    });
  }

  const projectIds = projectRows.map((row) => row.id);
  const ijinRows =
    projectIds.length === 0
      ? []
      : await db
          .select({
            id: ijinPrinsipRecords.id,
            projectId: ijinPrinsipRecords.projectId,
          })
          .from(ijinPrinsipRecords)
          .where(inArray(ijinPrinsipRecords.projectId, projectIds));
  for (const ijin of ijinRows) {
    const project = projectById.get(ijin.projectId);
    const program = project ? programById.get(project.originatingProgramId) : undefined;
    if (!project || !program) continue;
    records.set(ijin.id, {
      entityType: 'ijin_prinsip',
      entityId: ijin.id,
      label: `Ijin prinsip · ${project.code}`,
      href: `/plan/projects/${project.id}`,
      annualPlanId: program.annualPlanId,
      programId: program.id,
      projectId: project.id,
      initiativeId: program.siId,
      recurringItemId: null,
    });
  }

  const itemRows = await db
    .select({
      id: recurringOpsItems.id,
      annualPlanId: recurringOpsItems.annualPlanId,
      name: recurringOpsItems.name,
    })
    .from(recurringOpsItems)
    .where(inArray(recurringOpsItems.annualPlanId, [...planIds]));
  const itemById = new Map(itemRows.map((row) => [row.id, row]));
  for (const item of itemRows) {
    records.set(item.id, {
      entityType: 'recurring_ops_item',
      entityId: item.id,
      label: item.name,
      href: `/plan/annual/${item.annualPlanId}/recurring-ops/${item.id}`,
      annualPlanId: item.annualPlanId,
      programId: null,
      projectId: null,
      initiativeId: null,
      recurringItemId: item.id,
    });
  }

  const allocationIds = allocationRows.map((row) => row.id);
  const itemIds = itemRows.map((row) => row.id);
  if (allocationIds.length > 0 || itemIds.length > 0) {
    const scope =
      allocationIds.length > 0 && itemIds.length > 0
        ? or(
            inArray(commitmentEntries.projectYearAllocationId, allocationIds),
            inArray(commitmentEntries.recurringOpsItemId, itemIds),
          )
        : allocationIds.length > 0
          ? inArray(commitmentEntries.projectYearAllocationId, allocationIds)
          : inArray(commitmentEntries.recurringOpsItemId, itemIds);
    const commitmentRows = await db
      .select({
        id: commitmentEntries.id,
        projectYearAllocationId: commitmentEntries.projectYearAllocationId,
        recurringOpsItemId: commitmentEntries.recurringOpsItemId,
        reference: commitmentEntries.reference,
      })
      .from(commitmentEntries)
      .where(scope);
    for (const commitment of commitmentRows) {
      if (commitment.projectYearAllocationId) {
        const allocation = allocationById.get(commitment.projectYearAllocationId);
        if (!allocation) continue;
        const program = programById.get(allocation.annualProgramId);
        records.set(commitment.id, {
          entityType: 'commitment_entry',
          entityId: commitment.id,
          label: `Commitment · ${commitment.reference ?? program?.code ?? allocation.id}`,
          href: `/plan/projects/${allocation.projectId}/allocations/${allocation.id}`,
          annualPlanId: allocation.annualPlanId,
          programId: allocation.annualProgramId,
          projectId: allocation.projectId,
          initiativeId: program?.siId ?? null,
          recurringItemId: null,
        });
        continue;
      }
      const item = commitment.recurringOpsItemId
        ? itemById.get(commitment.recurringOpsItemId)
        : undefined;
      if (!item) continue;
      records.set(commitment.id, {
        entityType: 'commitment_entry',
        entityId: commitment.id,
        label: `Commitment · ${commitment.reference ?? item.name}`,
        href: `/plan/annual/${item.annualPlanId}/recurring-ops/${item.id}`,
        annualPlanId: item.annualPlanId,
        programId: null,
        projectId: null,
        initiativeId: null,
        recurringItemId: item.id,
      });
    }
  }

  return records;
}

interface CorrectionRow {
  entityId: string;
  reason: string | null;
  createdAt: Date;
  actorUserId: string | null;
}

/** The `correction` audit rows for a set of record ids, oldest first. */
async function loadCorrectionRows(ids: readonly string[]): Promise<CorrectionRow[]> {
  if (ids.length === 0) return [];
  return getDb()
    .select({
      entityId: auditEntries.entityId,
      reason: auditEntries.reason,
      createdAt: auditEntries.createdAt,
      actorUserId: auditEntries.actorUserId,
    })
    .from(auditEntries)
    .where(
      and(
        eq(auditEntries.action, CORRECTION_ACTION),
        inArray(auditEntries.entityType, [...CORRECTION_ENTITY_TYPES]),
        inArray(auditEntries.entityId, [...ids]),
      ),
    )
    .orderBy(asc(auditEntries.createdAt));
}

/** The annual plan ids of one strategic plan. */
async function planIdsOfStrategicPlan(strategicPlanId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: annualPlans.id })
    .from(annualPlans)
    .where(eq(annualPlans.planId, strategicPlanId));
  return rows.map((row) => row.id);
}

/**
 * The correction markers for one strategic plan's four reports, sourced from the
 * audit trail (ADR-0007 §6, §8). A plan with no corrections yields empty sets,
 * so a report can call this unconditionally.
 */
export async function loadCorrectionMarkers(
  strategicPlanId: string,
): Promise<CorrectionMarkers> {
  const planIds = await planIdsOfStrategicPlan(strategicPlanId);
  if (planIds.length === 0) return emptyMarkers();
  const records = await loadPlanRecords(planIds);
  const corrections = await loadCorrectionRows([...records.keys()]);
  if (corrections.length === 0) return emptyMarkers();

  const corrected = new Set<string>();
  const programs = new Set<string>();
  const initiatives = new Set<string>();
  const projectsCorrected = new Set<string>();
  const recurringItems = new Set<string>();

  for (const correction of corrections) {
    const record = records.get(correction.entityId);
    if (!record) continue;
    corrected.add(record.entityId);

    // A program row adds up its budget, its allocations and its commitments, so
    // any of those three moves it. A corrected project name or ijin document
    // does not, and marking the row for it would claim a change that is not
    // there (ADR-0007 §8: mark the rows whose figures rest on the correction).
    if (movesMoney(record.entityType)) {
      if (record.programId) programs.add(record.programId);
      if (record.initiativeId) initiatives.add(record.initiativeId);
    }

    // Every one of the six record types except the recurring item sits under a
    // project — a project row is the only report row that shows all of them.
    if (record.projectId) projectsCorrected.add(record.projectId);
    // A recurring item's row adds up that item's budget and its commitments, so
    // a corrected commitment booked against it moves the row too.
    if (record.recurringItemId) recurringItems.add(record.recurringItemId);
  }

  return { corrected, programs, initiatives, projects: projectsCorrected, recurringItems };
}

/**
 * Whether a corrected record changes a figure a report adds up. Metadata
 * corrections (a project's owner, an ijin prinsip document number) move no
 * money, so they mark the record itself but never an aggregated row.
 */
function movesMoney(entityType: CorrectionEntityType): boolean {
  return (
    entityType === 'annual_program' ||
    entityType === 'project_year_allocation' ||
    entityType === 'commitment_entry'
  );
}

/**
 * Every correction recorded against one fiscal year's plan records, newest
 * first, with the label, link, reason and actor the banner and the close
 * receipt notice show.
 */
export async function listPlanCorrections(annualPlanId: string): Promise<PlanCorrection[]> {
  const records = await loadPlanRecords([annualPlanId]);
  const corrections = await loadCorrectionRows([...records.keys()]);
  if (corrections.length === 0) return [];

  const actorIds = [...new Set(corrections.map((row) => row.actorUserId).filter(Boolean))];
  const actors =
    actorIds.length === 0
      ? []
      : await getDb()
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, actorIds as string[]));
  const actorById = new Map(actors.map((row) => [row.id, row]));

  const result: PlanCorrection[] = [];
  for (const correction of corrections) {
    const record = records.get(correction.entityId);
    if (!record) continue;
    const actor = correction.actorUserId ? actorById.get(correction.actorUserId) : undefined;
    result.push({
      entityType: record.entityType,
      entityTypeLabel: ENTITY_TYPE_LABELS[record.entityType],
      entityId: record.entityId,
      label: record.label,
      href: record.href,
      correctedAt: correction.createdAt,
      reason: correction.reason,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
    });
  }
  return result.reverse();
}
