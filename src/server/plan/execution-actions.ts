'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  commitmentEntries,
  commitmentSettlements,
  projectYearAllocations,
  projects,
  recurringOpsItems,
  spendEntries,
  strategicPlans,
  type AnnualPlan,
  type CommitmentEntry,
  type Project,
  type ProjectYearAllocation,
  type RecurringOpsItem,
  type SpendEntry,
  type StrategicPlan,
} from '@/db/schema';
import {
  commitmentCreateSchema,
  commitmentUpdateSchema,
  commitmentVoidSchema,
  spendCreateSchema,
  spendUpdateSchema,
  spendVoidSchema,
  type CommitmentCreateInput,
  type CommitmentUpdateInput,
  type SpendCreateInput,
  type SpendUpdateInput,
} from '@/domain/inputs';
import { formatRupiah, parseRupiah } from '@/domain/money';
import { validateSettlementSplits } from '@/domain/settlement';
import { invalidFormState, type FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';

interface ParentContext {
  kind: 'allocation' | 'recurring';
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
  project?: Project;
  allocation?: ProjectYearAllocation;
  recurringItem?: RecurringOpsItem;
  fiscalYear: number;
  redirectTo: string;
}

async function loadParent(input: {
  allocationId?: string | null;
  recurringOpsItemId?: string | null;
}): Promise<ParentContext> {
  const hasAllocation = Boolean(input.allocationId);
  const hasRecurring = Boolean(input.recurringOpsItemId);
  if (hasAllocation === hasRecurring) {
    throw new FormError('Choose exactly one parent: a project year allocation or a recurring ops item.');
  }

  const db = getDb();
  if (input.allocationId) {
    const rows = await db
      .select({
        allocation: projectYearAllocations,
        project: projects,
        annualPlan: annualPlans,
        strategicPlan: strategicPlans,
      })
      .from(projectYearAllocations)
      .innerJoin(projects, eq(projectYearAllocations.projectId, projects.id))
      .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
      .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
      .where(eq(projectYearAllocations.id, input.allocationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new FormError('Project year allocation not found.');
    return {
      kind: 'allocation',
      allocation: row.allocation,
      project: row.project,
      annualPlan: row.annualPlan,
      strategicPlan: row.strategicPlan,
      fiscalYear: row.annualPlan.fiscalYear,
      redirectTo: `/plan/projects/${row.project.id}/allocations/${row.allocation.id}`,
    };
  }

  const rows = await db
    .select({ item: recurringOpsItems, annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(recurringOpsItems)
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(recurringOpsItems.id, input.recurringOpsItemId ?? ''))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Recurring ops item not found.');
  if (row.item.voidedAt) throw new FormError('That recurring ops item is voided.');
  return {
    kind: 'recurring',
    recurringItem: row.item,
    annualPlan: row.annualPlan,
    strategicPlan: row.strategicPlan,
    fiscalYear: row.annualPlan.fiscalYear,
    redirectTo: `/plan/annual/${row.annualPlan.id}/recurring-ops/${row.item.id}`,
  };
}

function requireEditable(context: ParentContext): void {
  if (context.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (context.annualPlan.status === 'closed') {
    throw new FormError('That fiscal year is closed and read-only.');
  }
  if (context.project?.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
}

/** Spend lifecycle events (settling pre-existing commitments) may still occur after close. */
function requireSpendLifecycle(context: ParentContext): void {
  if (context.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (context.project?.status === 'cancelled') {
    throw new FormError('This project is cancelled and read-only.');
  }
}

function requireComponentAllowed(context: ParentContext, component: 'capex' | 'opex'): void {
  if (context.kind === 'recurring' && component !== 'opex') {
    throw new FormError('Recurring ops items are opex only (BR-12).');
  }
}

function commitmentSnapshot(commitment: CommitmentEntry): Record<string, unknown> {
  return {
    component: commitment.component,
    amount: commitment.amount,
    commitmentDate: commitment.commitmentDate,
    reference: commitment.reference,
    description: commitment.description,
    voidedAt: commitment.voidedAt?.toISOString() ?? null,
  };
}

function spendSnapshot(spend: SpendEntry): Record<string, unknown> {
  return {
    component: spend.component,
    amount: spend.amount,
    spentOn: spend.spentOn,
    categoryId: spend.categoryId,
    vendor: spend.vendor,
    reference: spend.reference,
    description: spend.description,
    settlementKind: spend.settlementKind,
    voidedAt: spend.voidedAt?.toISOString() ?? null,
  };
}

async function settledAmount(commitmentId: string): Promise<number> {
  const rows = await getDb()
    .select({ amount: commitmentSettlements.amount })
    .from(commitmentSettlements)
    .innerJoin(spendEntries, eq(commitmentSettlements.spendEntryId, spendEntries.id))
    .where(
      and(
        eq(commitmentSettlements.commitmentEntryId, commitmentId),
        isNull(spendEntries.voidedAt),
      ),
    );
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

async function loadCommitment(id: string): Promise<{
  commitment: CommitmentEntry;
  context: ParentContext;
}> {
  const rows = await getDb().select().from(commitmentEntries).where(eq(commitmentEntries.id, id)).limit(1);
  const commitment = rows[0];
  if (!commitment) throw new FormError('Commitment entry not found.');
  const context = await loadParent({
    allocationId: commitment.projectYearAllocationId,
    recurringOpsItemId: commitment.recurringOpsItemId,
  });
  return { commitment, context };
}

async function loadSpend(id: string): Promise<{ spend: SpendEntry; context: ParentContext }> {
  const rows = await getDb().select().from(spendEntries).where(eq(spendEntries.id, id)).limit(1);
  const spend = rows[0];
  if (!spend) throw new FormError('Spend entry not found.');
  const context = await loadParent({
    allocationId: spend.projectYearAllocationId,
    recurringOpsItemId: spend.recurringOpsItemId,
  });
  return { spend, context };
}

// ---------------------------------------------------------------- commitments

async function createCommitment(
  actorId: string,
  input: CommitmentCreateInput,
  context: ParentContext,
): Promise<CommitmentEntry> {
  requireEditable(context);
  requireComponentAllowed(context, input.component);

  let created: CommitmentEntry | undefined;
  await getDb().transaction(async (tx) => {
    [created] = await tx
      .insert(commitmentEntries)
      .values({
        projectYearAllocationId: context.allocation?.id ?? null,
        recurringOpsItemId: context.recurringItem?.id ?? null,
        component: input.component,
        amount: input.amount,
        commitmentDate: input.commitmentDate,
        reference: input.reference,
        description: input.description,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();
    if (!created) throw new Error('failed to create the commitment entry');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'create',
      entityType: 'commitment_entry',
      entityId: created.id,
      after: commitmentSnapshot(created),
    });
  });
  if (!created) throw new Error('failed to create the commitment entry');
  return created;
}

async function updateCommitment(
  actorId: string,
  input: CommitmentUpdateInput,
  commitment: CommitmentEntry,
  context: ParentContext,
): Promise<CommitmentEntry> {
  if (commitment.voidedAt) throw new FormError('This commitment is voided and read-only.');
  requireEditable(context);
  requireComponentAllowed(context, input.component);
  const settled = await settledAmount(commitment.id);
  if (input.amount < settled) {
    throw new FormError(
      `The commitment cannot be reduced below the already settled amount (${formatRupiah(settled)}).`,
    );
  }

  let updated: CommitmentEntry | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(commitmentEntries)
      .set({
        component: input.component,
        amount: input.amount,
        commitmentDate: input.commitmentDate,
        reference: input.reference,
        description: input.description,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(commitmentEntries.id, commitment.id))
      .returning();
    if (!updated) throw new FormError('Commitment entry not found.');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'update',
      entityType: 'commitment_entry',
      entityId: commitment.id,
      before: commitmentSnapshot(commitment),
      after: commitmentSnapshot(updated),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Commitment entry not found.');
  return updated;
}

async function voidCommitment(
  actorId: string,
  commitment: CommitmentEntry,
  context: ParentContext,
  reason: string,
): Promise<CommitmentEntry> {
  if (commitment.voidedAt) throw new FormError('This commitment is already voided.');
  requireEditable(context);
  const settled = await settledAmount(commitment.id);
  if (settled > 0) {
    throw new FormError('This commitment has settlements. Void the settling spend entries first.');
  }

  let updated: CommitmentEntry | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(commitmentEntries)
      .set({ voidedAt: new Date(), voidedReason: reason, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(commitmentEntries.id, commitment.id))
      .returning();
    if (!updated) throw new FormError('Commitment entry not found.');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'void',
      entityType: 'commitment_entry',
      entityId: commitment.id,
      before: commitmentSnapshot(commitment),
      after: commitmentSnapshot(updated),
      reason,
    });
  });
  if (!updated) throw new FormError('Commitment entry not found.');
  return updated;
}

// ---------------------------------------------------------------- spend

interface ParsedSplits {
  commitmentId: string;
  amount: number;
}

const SETTLEMENT_AMOUNT_ERROR = 'Settlement amounts must be whole Rupiah numbers.';
const SETTLEMENT_ROW_ERROR = 'Use a whole Rupiah amount (digits only).';

interface SettlementSplits {
  splits: ParsedSplits[];
  errors: Record<string, string>;
}

/**
 * Settlement amounts are optional raw inputs (`settle_<commitmentId>`) sitting
 * beside the spend form, outside the Zod schema. A bad amount is attached to
 * the row that typed it so it renders under that input; the form-level
 * sentence stays as the summary.
 */
function readSettlementSplits(formData: FormData): SettlementSplits {
  const splits: ParsedSplits[] = [];
  const errors: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('settle_') || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    try {
      const amount = parseRupiah(trimmed);
      if (amount > 0) splits.push({ commitmentId: key.slice('settle_'.length), amount });
    } catch {
      errors[key] = SETTLEMENT_ROW_ERROR;
    }
  }
  return { splits, errors };
}

async function createSpend(
  actorId: string,
  input: SpendCreateInput,
  context: ParentContext,
  splits: ParsedSplits[],
): Promise<SpendEntry> {
  requireEditable(context);
  requireComponentAllowed(context, input.component);

  if (context.annualPlan.status === 'closed' && splits.length === 0 && input.settlementKind !== 'prior_year_opening') {
    throw new FormError(
      'This fiscal year is closed: only spend entries settling existing commitments can be recorded.',
    );
  }
  if (input.settlementKind === 'prior_year_opening' && splits.length > 0) {
    throw new FormError('A prior-year opening payment cannot settle an in-app commitment.');
  }

  const commitments = new Map<
    string,
    { amount: number; settled: number; component: 'capex' | 'opex'; fiscalYear: number }
  >();
  for (const split of splits) {
    const commitmentRows = await getDb()
      .select()
      .from(commitmentEntries)
      .where(eq(commitmentEntries.id, split.commitmentId))
      .limit(1);
    const commitment = commitmentRows[0];
    if (!commitment) throw new FormError('A selected commitment entry was not found.');
    if (commitment.voidedAt) throw new FormError('A selected commitment entry is voided.');

    let commitmentFiscalYear = 0;
    if (commitment.projectYearAllocationId) {
      const allocationRows = await getDb()
        .select({ projectId: projectYearAllocations.projectId, fiscalYear: annualPlans.fiscalYear })
        .from(projectYearAllocations)
        .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
        .where(eq(projectYearAllocations.id, commitment.projectYearAllocationId))
        .limit(1);
      const allocation = allocationRows[0];
      if (!allocation) throw new FormError('The commitment parent allocation was not found.');
      if (context.kind !== 'allocation' || allocation.projectId !== context.project?.id) {
        throw new FormError('A settlement must belong to the same project as the spend entry.');
      }
      commitmentFiscalYear = allocation.fiscalYear;
    } else {
      const itemRows = await getDb()
        .select({ itemId: recurringOpsItems.id, fiscalYear: annualPlans.fiscalYear })
        .from(recurringOpsItems)
        .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
        .where(eq(recurringOpsItems.id, commitment.recurringOpsItemId ?? ''))
        .limit(1);
      const item = itemRows[0];
      if (!item) throw new FormError('The commitment parent recurring ops item was not found.');
      if (context.kind !== 'recurring' || item.itemId !== context.recurringItem?.id) {
        throw new FormError('A settlement must belong to the same recurring ops item as the spend entry.');
      }
      commitmentFiscalYear = item.fiscalYear;
    }

    if (commitment.component !== input.component) {
      throw new FormError('Settlements must use the same component as the spend entry.');
    }
    if (commitmentFiscalYear > context.fiscalYear) {
      throw new FormError('A settlement cannot pay a commitment from a later fiscal year.');
    }
    commitments.set(split.commitmentId, {
      amount: commitment.amount,
      settled: await settledAmount(split.commitmentId),
      component: commitment.component,
      fiscalYear: commitmentFiscalYear,
    });
  }

  const validationSplits = splits.map((split) => {
    const commitment = commitments.get(split.commitmentId);
    if (!commitment) throw new FormError('A selected commitment entry was not found.');
    return {
      commitmentId: split.commitmentId,
      amount: split.amount,
      commitmentAmount: commitment.amount,
      alreadySettled: commitment.settled,
    };
  });
  validateSettlementSplits({
    spendAmount: input.amount,
    splits: validationSplits,
  });

  let created: SpendEntry | undefined;
  await getDb().transaction(async (tx) => {
    [created] = await tx
      .insert(spendEntries)
      .values({
        projectYearAllocationId: context.allocation?.id ?? null,
        recurringOpsItemId: context.recurringItem?.id ?? null,
        component: input.component,
        amount: input.amount,
        spentOn: input.spentOn,
        categoryId: input.categoryId,
        vendor: input.vendor,
        reference: input.reference,
        description: input.description,
        settlementKind: input.settlementKind,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();
    if (!created) throw new Error('failed to create the spend entry');

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'create',
      entityType: 'spend_entry',
      entityId: created.id,
      after: spendSnapshot(created),
    });

    for (const split of splits) {
      const [settlement] = await tx
        .insert(commitmentSettlements)
        .values({
          spendEntryId: created.id,
          commitmentEntryId: split.commitmentId,
          amount: split.amount,
          createdBy: actorId,
        })
        .returning();
      if (!settlement) throw new Error('failed to create a commitment settlement');
      await recordAudit(tx, {
        actorUserId: actorId,
        action: 'settle',
        entityType: 'commitment_entry',
        entityId: split.commitmentId,
        after: { amount: split.amount, spendEntryId: created.id, settlementId: settlement.id },
      });
    }
  });
  if (!created) throw new Error('failed to create the spend entry');
  return created;
}

async function updateSpend(
  actorId: string,
  input: SpendUpdateInput,
  spend: SpendEntry,
  context: ParentContext,
): Promise<SpendEntry> {
  if (spend.voidedAt) throw new FormError('This spend entry is voided and read-only.');
  requireSpendLifecycle(context);

  const settlements = await getDb()
    .select({ amount: commitmentSettlements.amount })
    .from(commitmentSettlements)
    .where(eq(commitmentSettlements.spendEntryId, spend.id));
  const totalSettled = settlements.reduce((sum, row) => sum + row.amount, 0);
  if (input.amount < totalSettled) {
    throw new FormError('The spend amount cannot be reduced below the settled amount.');
  }
  if (input.settlementKind !== spend.settlementKind && totalSettled > 0) {
    throw new FormError('Void the spend entry and re-enter it to change its settlement classification.');
  }

  let updated: SpendEntry | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(spendEntries)
      .set({
        amount: input.amount,
        spentOn: input.spentOn,
        categoryId: input.categoryId,
        vendor: input.vendor,
        reference: input.reference,
        description: input.description,
        settlementKind: input.settlementKind,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(spendEntries.id, spend.id))
      .returning();
    if (!updated) throw new FormError('Spend entry not found.');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'update',
      entityType: 'spend_entry',
      entityId: spend.id,
      before: spendSnapshot(spend),
      after: spendSnapshot(updated),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Spend entry not found.');
  return updated;
}

async function voidSpend(
  actorId: string,
  spend: SpendEntry,
  context: ParentContext,
  reason: string,
): Promise<SpendEntry> {
  if (spend.voidedAt) throw new FormError('This spend entry is already voided.');
  requireSpendLifecycle(context);

  let updated: SpendEntry | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(spendEntries)
      .set({ voidedAt: new Date(), voidedReason: reason, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(spendEntries.id, spend.id))
      .returning();
    if (!updated) throw new FormError('Spend entry not found.');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'void',
      entityType: 'spend_entry',
      entityId: spend.id,
      before: spendSnapshot(spend),
      after: spendSnapshot(updated),
      reason,
    });
  });
  if (!updated) throw new FormError('Spend entry not found.');
  return updated;
}

// ---------------------------------------------------------------- actions

function recordLabel(
  noun: 'Commitment' | 'Spend entry',
  record: Pick<CommitmentEntry | SpendEntry, 'reference' | 'amount'>,
): string {
  return record.reference ? `${noun} ${record.reference}` : `${noun} of ${formatRupiah(record.amount)}`;
}

export async function createCommitmentAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, commitmentCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let redirectTo = '/plan/projects';
  let created: CommitmentEntry;
  try {
    const context = await loadParent({
      allocationId: parsed.data.allocationId,
      recurringOpsItemId: parsed.data.recurringOpsItemId,
    });
    redirectTo = context.redirectTo;
    created = await createCommitment(actor.id, parsed.data, context);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Commitment', created)} recorded.`);
}

export async function updateCommitmentAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, commitmentUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let redirectTo = '/plan/projects';
  let updated: CommitmentEntry;
  try {
    const { commitment, context } = await loadCommitment(parsed.data.id);
    redirectTo = context.redirectTo;
    updated = await updateCommitment(actor.id, parsed.data, commitment, context);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Commitment', updated)} updated.`);
}

export async function voidCommitmentAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, commitmentVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let redirectTo = '/plan/projects';
  let voided: CommitmentEntry;
  try {
    const { commitment, context } = await loadCommitment(parsed.data.id);
    redirectTo = context.redirectTo;
    voided = await voidCommitment(actor.id, commitment, context, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Commitment', voided)} voided.`);
}

export async function createSpendAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, spendCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const settlements = readSettlementSplits(formData);
  if (Object.keys(settlements.errors).length > 0) {
    return invalidFormState(
      previous,
      settlements.errors,
      parsed.values,
      SETTLEMENT_AMOUNT_ERROR,
    );
  }

  let redirectTo = '/plan/projects';
  let created: SpendEntry;
  try {
    const context = await loadParent({
      allocationId: parsed.data.allocationId,
      recurringOpsItemId: parsed.data.recurringOpsItemId,
    });
    redirectTo = context.redirectTo;
    created = await createSpend(actor.id, parsed.data, context, settlements.splits);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Spend entry', created)} recorded.`);
}

export async function updateSpendAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, spendUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let redirectTo = '/plan/projects';
  let updated: SpendEntry;
  try {
    const { spend, context } = await loadSpend(parsed.data.id);
    redirectTo = context.redirectTo;
    updated = await updateSpend(actor.id, parsed.data, spend, context);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Spend entry', updated)} updated.`);
}

export async function voidSpendAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, spendVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let redirectTo = '/plan/projects';
  let voided: SpendEntry;
  try {
    const { spend, context } = await loadSpend(parsed.data.id);
    redirectTo = context.redirectTo;
    voided = await voidSpend(actor.id, spend, context, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(redirectTo, `${recordLabel('Spend entry', voided)} voided.`);
}
