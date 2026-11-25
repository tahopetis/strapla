import { budgetRevisionCreateSchema, type BudgetRevisionCreateInput } from '@/domain/inputs';
import type { RevisionComponent, RevisionEntityType } from '@/domain/revisions';
import { collectFormValues, type FormFieldErrors } from './form-state';

/**
 * The budget revision form's line grid (#112, ADR-0006 §4).
 *
 * The header is an ordinary form; the lines are one signed amount per entity
 * and component. Their names are derived from the entity instead of an index,
 * so a line field can never drift away from the entity it belongs to, and a
 * blank cell is simply "this entity does not change".
 */

const ENTITY_PREFIX: Record<RevisionEntityType, string> = {
  program: 'program',
  allocation: 'allocation',
};

export function revisionLineFieldName(
  entityType: RevisionEntityType,
  entityId: string,
  component: RevisionComponent,
): string {
  return `${ENTITY_PREFIX[entityType]}_${entityId}_${component}`;
}

export function revisionProgramFieldName(
  programId: string,
  component: RevisionComponent,
): string {
  return revisionLineFieldName('program', programId, component);
}

export function revisionAllocationFieldName(
  allocationId: string,
  component: RevisionComponent,
): string {
  return revisionLineFieldName('allocation', allocationId, component);
}

const LINE_FIELD = /^(program|allocation)_([0-9a-fA-F-]+)_(capex|opex)$/;

interface ParsedLine {
  entityType: RevisionEntityType;
  entityId: string;
  component: RevisionComponent;
  raw: string;
}

/** Every non-blank line cell in the form, in submission order. */
function readLineCells(formData: FormData): Array<ParsedLine & { fieldName: string }> {
  const cells: Array<ParsedLine & { fieldName: string }> = [];
  for (const [fieldName, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    const match = LINE_FIELD.exec(fieldName);
    if (!match) continue;
    if (value.trim() === '') continue;
    cells.push({
      fieldName,
      entityType: match[1] as RevisionEntityType,
      entityId: match[2] as string,
      component: match[3] as RevisionComponent,
      raw: value,
    });
  }
  return cells;
}

export type RevisionFormResult =
  | { ok: true; data: BudgetRevisionCreateInput; values: Record<string, string> }
  | { ok: false; fieldErrors: FormFieldErrors; formError?: string; values: Record<string, string> };

/**
 * Parses a revision submission: the header and the grid go through the shared
 * create schema in one pass, so a bad cell is reported under that cell's input
 * and a missing line set is a form-level message (no single input is at fault).
 * The line cell keeps its raw text until the schema has validated it, which is
 * why the grid is rebuilt as raw lines rather than pre-parsed.
 */
export function parseRevisionForm(formData: FormData): RevisionFormResult {
  const values = collectFormValues(formData);
  const cells = readLineCells(formData);

  const parsed = budgetRevisionCreateSchema.safeParse({
    annualPlanId: values.annualPlanId,
    revisionDate: values.revisionDate,
    decisionReference: values.decisionReference,
    reason: values.reason,
    lines: cells.map((cell) => ({
      entityType: cell.entityType,
      entityId: cell.entityId,
      component: cell.component,
      delta: cell.raw,
    })),
  });
  if (parsed.success) return { ok: true, data: parsed.data, values };

  const fieldErrors: FormFieldErrors = {};
  let formError: string | undefined;
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String);
    const lineIndex = Number(path[1]);
    if (path[0] === 'lines' && Number.isInteger(lineIndex) && cells[lineIndex]) {
      fieldErrors[cells[lineIndex]!.fieldName] ??= issue.message;
      continue;
    }
    if (path.length === 0 || path[0] === 'lines') {
      formError ??= issue.message;
      continue;
    }
    fieldErrors[path.join('.')] ??= issue.message;
  }
  return { ok: false, fieldErrors, ...(formError === undefined ? {} : { formError }), values };
}
