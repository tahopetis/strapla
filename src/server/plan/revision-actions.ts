'use server';

import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  budgetRevisionLines,
  budgetRevisions,
  strategicPlans,
  type AnnualPlan,
  type BudgetRevision,
  type StrategicPlan,
} from '@/db/schema';
import {
  budgetRevisionDecisionSchema,
  type BudgetRevisionCreateInput,
  type BudgetRevisionDecisionInput,
} from '@/domain/inputs';
import {
  formatRevisionNumber,
  validateRevisionFloor,
  validateRevisionLines,
  type RevisionLine,
} from '@/domain/revisions';
import { invalidFormState, type FormState } from '@/lib/form-state';
import { parseRevisionForm, revisionLineFieldName } from '@/lib/revision-form';
import {
  FieldError,
  FormError,
  actionUser,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { getRevisionContext } from './revision-queries';

/**
 * Budget revision server actions (#112, ADR-0006 §4).
 *
 * Once an annual plan is active a program's capex/opex budget changes only by
 * posting an immutable, numbered revision. A revision is never edited or
 * deleted: a correction is a new revision, and the formal decision may follow
 * the posting ("awaiting decision reference") as metadata only.
 */

const ANNUAL_PAGE = '/plan/annual';

function revisionsPath(annualPlanId: string): string {
  return `${ANNUAL_PAGE}/${annualPlanId}/revisions`;
}

interface LoadedAnnualPlan {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}

async function loadAnnualPlan(id: string): Promise<LoadedAnnualPlan> {
  const rows = await getDb()
    .select({ annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, id))
    .limit(1);
  const loaded = rows[0];
  if (!loaded) throw new FormError('Annual plan not found.');
  return loaded;
}

/** Revisions exist only for an active year: draft is edited directly, closed is read-only. */
async function requireActivePlan(annualPlanId: string): Promise<LoadedAnnualPlan> {
  const loaded = await loadAnnualPlan(annualPlanId);
  if (loaded.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (loaded.annualPlan.status === 'closed') {
    throw new FormError('This fiscal year is closed and read-only.');
  }
  if (loaded.annualPlan.status !== 'active') {
    throw new FormError(
      'Budget revisions are only posted once the annual plan is active. Edit the program budgets directly while the plan is a draft.',
    );
  }
  return loaded;
}

/** A line field error keyed by the input the revision form renders for that line. */
function lineFieldName(line: RevisionLine): string {
  return revisionLineFieldName(line.entityType, line.entityId, line.component);
}

/**
 * Refuses a line set whose entities are not part of this annual plan, before the
 * floor rules read their positions.
 */
function requireKnownEntities(
  input: BudgetRevisionCreateInput,
  context: Awaited<ReturnType<typeof getRevisionContext>>,
): void {
  const programIds = new Set(context.programs.map((program) => program.programId));
  const allocationIds = new Set(context.allocations.map((allocation) => allocation.allocationId));
  const fields: Record<string, string> = {};
  for (const line of input.lines) {
    const known = line.entityType === 'program' ? programIds : allocationIds;
    if (known.has(line.entityId)) continue;
    fields[lineFieldName(line)] ??=
      line.entityType === 'program'
        ? 'This program is not part of the annual plan being revised.'
        : 'This project allocation is not part of the annual plan being revised.';
  }
  if (Object.keys(fields).length > 0) throw new FieldError(fields);
}

/** The domain issues land on the line inputs they are about, never as a crash. */
function refuseIssues(
  issues: ReturnType<typeof validateRevisionLines>,
  lines: readonly RevisionLine[],
): void {
  const fields: Record<string, string> = {};
  let formMessage: string | undefined;
  for (const issue of issues) {
    if (issue.lineIndexes.length === 0) {
      formMessage ??= issue.message;
      continue;
    }
    for (const index of issue.lineIndexes) {
      const line = lines[index];
      if (!line) continue;
      fields[lineFieldName(line)] ??= issue.message;
    }
  }
  if (Object.keys(fields).length > 0 || formMessage !== undefined) {
    throw new FieldError(fields, formMessage);
  }
}

interface PostedRevision {
  revision: BudgetRevision;
  lines: RevisionLine[];
  fiscalYear: number;
}

/**
 * Posts one revision: validate the document, validate it against the plan's
 * money positions, then write header and lines atomically with one audit entry.
 * The per-plan sequence is read inside the same transaction so two postings
 * cannot take the same number (the unique index is the backstop).
 */
async function createRevision(
  userId: string,
  input: BudgetRevisionCreateInput,
): Promise<PostedRevision> {
  const { annualPlan } = await requireActivePlan(input.annualPlanId);

  refuseIssues(validateRevisionLines(input.lines), input.lines);

  const context = await getRevisionContext(input.annualPlanId, input.lines);
  requireKnownEntities(input, context);
  refuseIssues(validateRevisionFloor({ lines: input.lines, ...context }), input.lines);

  let posted: PostedRevision | undefined;
  await getDb().transaction(async (tx) => {
    const maxRows = await tx
      .select({
        max: sql<string>`coalesce(max(${budgetRevisions.number}), 0)::text`,
      })
      .from(budgetRevisions)
      .where(eq(budgetRevisions.annualPlanId, input.annualPlanId))
      .limit(1);
    const number = Number(maxRows[0]?.max ?? '0') + 1;

    const [header] = await tx
      .insert(budgetRevisions)
      .values({
        annualPlanId: input.annualPlanId,
        number,
        revisionDate: input.revisionDate,
        decisionReference: input.decisionReference,
        reason: input.reason,
        createdBy: userId,
      })
      .returning();
    if (!header) throw new Error('failed to create the budget revision');

    await tx.insert(budgetRevisionLines).values(
      input.lines.map((line) => ({
        revisionId: header.id,
        entityType: line.entityType,
        entityId: line.entityId,
        component: line.component,
        delta: line.delta,
      })),
    );

    await recordAudit(tx, {
      actorUserId: userId,
      action: 'revision_post',
      entityType: 'budget_revision',
      entityId: header.id,
      after: {
        number: formatRevisionNumber(annualPlan.fiscalYear, header.number),
        revisionDate: header.revisionDate,
        decisionReference: header.decisionReference,
        awaitingDecision: header.decisionReference === null,
        reason: header.reason,
        lines: input.lines.map((line) => ({
          entityType: line.entityType,
          entityId: line.entityId,
          component: line.component,
          delta: line.delta,
        })),
      },
      reason: header.reason,
    });

    posted = { revision: header, lines: input.lines, fiscalYear: annualPlan.fiscalYear };
  });

  if (!posted) throw new Error('failed to post the budget revision');
  return posted;
}

interface DecidedRevision {
  revision: BudgetRevision;
  fiscalYear: number;
}

/**
 * Attaches the formal decision to a revision that was posted before it existed.
 * Metadata only: lines and deltas are already frozen and the audit entry names
 * both the missing and the recorded reference.
 */
async function recordRevisionDecision(
  userId: string,
  input: BudgetRevisionDecisionInput,
): Promise<DecidedRevision> {
  const rows = await getDb()
    .select({
      revision: budgetRevisions,
      fiscalYear: annualPlans.fiscalYear,
      strategicPlanStatus: strategicPlans.status,
    })
    .from(budgetRevisions)
    .innerJoin(annualPlans, eq(budgetRevisions.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(budgetRevisions.id, input.id))
    .limit(1);
  const loaded = rows[0];
  if (!loaded) throw new FormError('Budget revision not found.');
  if (loaded.strategicPlanStatus === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  // A closed year still allows this: the decision may arrive after the close,
  // and attaching the reference changes metadata only (ADR-0006 §4).
  if (loaded.revision.decisionReference !== null) {
    throw new FormError('This revision already has a decision reference.');
  }

  let updated: BudgetRevision | undefined;
  await getDb().transaction(async (tx) => {
    const now = new Date();
    [updated] = await tx
      .update(budgetRevisions)
      .set({
        decisionReference: input.decisionReference,
        decidedAt: now,
        decidedBy: userId,
        updatedAt: now,
      })
      .where(eq(budgetRevisions.id, input.id))
      .returning();
    if (!updated) throw new FormError('Budget revision not found.');
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'revision_decision',
      entityType: 'budget_revision',
      entityId: input.id,
      before: { decisionReference: loaded.revision.decisionReference },
      after: {
        decisionReference: updated.decisionReference,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
      },
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Budget revision not found.');
  return { revision: updated, fiscalYear: loaded.fiscalYear };
}

// ---------------------------------------------------------------- actions

export async function createRevisionAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = parseRevisionForm(formData);
  if (!parsed.ok) {
    return invalidFormState(previous, parsed.fieldErrors, parsed.values, parsed.formError);
  }

  let posted: PostedRevision;
  try {
    posted = await createRevision(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    revisionsPath(posted.revision.annualPlanId),
    `Budget revision ${formatRevisionNumber(posted.fiscalYear, posted.revision.number)} posted.`,
  );
}

export async function recordRevisionDecisionAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, budgetRevisionDecisionSchema, formData);
  if (!parsed.ok) return parsed.state;

  let decided: DecidedRevision;
  try {
    decided = await recordRevisionDecision(user.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    revisionsPath(decided.revision.annualPlanId),
    `Decision reference recorded for ${formatRevisionNumber(
      decided.fiscalYear,
      decided.revision.number,
    )}.`,
  );
}
