import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { annualPrograms, budgetRevisionLines, projectYearAllocations, projects } from '@/db/schema';

/**
 * Display query for the revision register (#115, ADR-0006 §4/§6).
 *
 * The register query (`listRevisions`) deliberately returns totals only; the
 * register page and the program money line need each document's lines with a
 * label and a link target. This module keeps that read in one place so the two
 * surfaces show the same lines, and it never writes: revisions are immutable.
 */

export interface RevisionLineRow {
  id: string;
  revisionId: string;
  entityType: 'program' | 'allocation';
  entityId: string;
  component: 'capex' | 'opex';
  delta: number;
  /** `PRG-01` for a program line, `PRJ-2027-001` for an allocation line. */
  entityCode: string;
  entityName: string | null;
}

/** Lines of the given revisions, keyed by revision id, in document order. */
export async function listRevisionLines(
  revisionIds: readonly string[],
): Promise<Map<string, RevisionLineRow[]>> {
  const linesByRevision = new Map<string, RevisionLineRow[]>();
  if (revisionIds.length === 0) return linesByRevision;

  const db = getDb();
  const lines = await db
    .select()
    .from(budgetRevisionLines)
    .where(inArray(budgetRevisionLines.revisionId, [...revisionIds]))
    .orderBy(
      asc(budgetRevisionLines.entityType),
      asc(budgetRevisionLines.component),
      asc(budgetRevisionLines.id),
    );

  const programIds = lines
    .filter((line) => line.entityType === 'program')
    .map((line) => line.entityId);
  const allocationIds = lines
    .filter((line) => line.entityType === 'allocation')
    .map((line) => line.entityId);

  const [programRows, allocationRows] = await Promise.all([
    programIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: annualPrograms.id, code: annualPrograms.code, name: annualPrograms.name })
          .from(annualPrograms)
          .where(inArray(annualPrograms.id, programIds)),
    allocationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: projectYearAllocations.id,
            projectCode: projects.code,
            projectName: projects.name,
          })
          .from(projectYearAllocations)
          .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
          .where(inArray(projectYearAllocations.id, allocationIds)),
  ]);
  const programById = new Map(programRows.map((row) => [row.id, row]));
  const allocationById = new Map(allocationRows.map((row) => [row.id, row]));

  for (const line of lines) {
    const program = line.entityType === 'program' ? programById.get(line.entityId) : undefined;
    const allocation =
      line.entityType === 'allocation' ? allocationById.get(line.entityId) : undefined;
    const row: RevisionLineRow = {
      id: line.id,
      revisionId: line.revisionId,
      entityType: line.entityType,
      entityId: line.entityId,
      component: line.component,
      delta: line.delta,
      entityCode: program?.code ?? allocation?.projectCode ?? line.entityId,
      entityName: program?.name ?? (allocation ? allocation.projectName : null),
    };
    const list = linesByRevision.get(line.revisionId) ?? [];
    list.push(row);
    linesByRevision.set(line.revisionId, list);
  }
  return linesByRevision;
}
