'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  annualPlans,
  recurringOpsItems,
  spendCategories,
  strategicPlans,
  type AnnualPlan,
  type RecurringOpsItem,
  type StrategicPlan,
} from '@/db/schema';
import { withCustomFields } from '@/domain/custom-fields';
import {
  recurringOpsCreateSchema,
  recurringOpsUpdateSchema,
  recurringOpsVoidSchema,
  type RecurringOpsCreateInput,
  type RecurringOpsUpdateInput,
} from '@/domain/inputs';
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  invalidCustomFieldState,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { readCustomFieldValues, saveCustomFieldValues } from '@/server/custom-fields/data';
import {
  readCustomFieldPayloadState,
  type CustomFieldPayload,
} from '@/server/custom-fields/form';
import { recordAudit } from '@/server/audit';

const PAGE = '/plan/annual';

function snapshot(item: RecurringOpsItem): Record<string, unknown> {
  return {
    name: item.name,
    categoryId: item.categoryId,
    owner: item.owner,
    opexBudget: item.opexBudget,
    carryInOpex: item.carryInOpex,
    notes: item.notes,
    voidedAt: item.voidedAt?.toISOString() ?? null,
  };
}

interface Context {
  annualPlan: AnnualPlan;
  strategicPlan: StrategicPlan;
}

async function loadAnnualPlanContext(annualPlanId: string): Promise<Context> {
  const rows = await getDb()
    .select({ annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(annualPlans)
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(annualPlans.id, annualPlanId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Annual plan not found.');
  return row;
}

function requireEditable(context: Context): void {
  if (context.strategicPlan.status === 'archived') {
    throw new FormError('The strategic plan is archived and read-only.');
  }
  if (context.annualPlan.status === 'closed') {
    throw new FormError('This fiscal year is closed and read-only.');
  }
}

async function validateCategory(categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const rows = await getDb()
    .select({ id: spendCategories.id, isActive: spendCategories.isActive })
    .from(spendCategories)
    .where(eq(spendCategories.id, categoryId))
    .limit(1);
  const category = rows[0];
  if (!category) throw new FormError('Spend category not found.');
  if (!category.isActive) throw new FormError('That spend category is deactivated.');
}

async function loadItem(id: string): Promise<{ item: RecurringOpsItem; context: Context }> {
  const rows = await getDb()
    .select({ item: recurringOpsItems, annualPlan: annualPlans, strategicPlan: strategicPlans })
    .from(recurringOpsItems)
    .innerJoin(annualPlans, eq(recurringOpsItems.annualPlanId, annualPlans.id))
    .innerJoin(strategicPlans, eq(annualPlans.planId, strategicPlans.id))
    .where(eq(recurringOpsItems.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('Recurring ops item not found.');
  return { item: row.item, context: { annualPlan: row.annualPlan, strategicPlan: row.strategicPlan } };
}

async function createItem(
  userId: string,
  input: RecurringOpsCreateInput,
  custom: CustomFieldPayload,
): Promise<RecurringOpsItem> {
  const context = await loadAnnualPlanContext(input.annualPlanId);
  requireEditable(context);
  await validateCategory(input.categoryId);

  let created: RecurringOpsItem | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(recurringOpsItems)
      .values({
        annualPlanId: input.annualPlanId,
        name: input.name,
        categoryId: input.categoryId,
        owner: input.owner,
        opexBudget: input.opexBudget,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!row) throw new Error('failed to create the recurring ops item');
    created = row;
    await saveCustomFieldValues(tx, {
      entityType: 'recurring_ops_item',
      entityId: row.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'create',
      entityType: 'recurring_ops_item',
      entityId: row.id,
      after: withCustomFields(snapshot(row), custom.fields, custom.values),
    });
  });
  if (!created) throw new Error('failed to create the recurring ops item');
  return created;
}

async function updateItem(
  userId: string,
  input: RecurringOpsUpdateInput,
  custom: CustomFieldPayload,
): Promise<RecurringOpsItem> {
  const loaded = await loadItem(input.id);
  if (loaded.item.voidedAt) throw new FormError('This item is voided and read-only.');
  requireEditable(loaded.context);
  await validateCategory(input.categoryId);

  let updated: RecurringOpsItem | undefined;
  await getDb().transaction(async (tx) => {
    const beforeValues = await readCustomFieldValues('recurring_ops_item', input.id, tx);
    const [row] = await tx
      .update(recurringOpsItems)
      .set({
        name: input.name,
        categoryId: input.categoryId,
        owner: input.owner,
        opexBudget: input.opexBudget,
        carryInOpex: input.carryInOpex,
        notes: input.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(recurringOpsItems.id, input.id))
      .returning();
    if (!row) throw new FormError('Recurring ops item not found.');
    updated = row;
    await saveCustomFieldValues(tx, {
      entityType: 'recurring_ops_item',
      entityId: input.id,
      fields: custom.fields,
      values: custom.values,
      userId,
    });
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'update',
      entityType: 'recurring_ops_item',
      entityId: input.id,
      before: withCustomFields(snapshot(loaded.item), custom.fields, beforeValues),
      after: withCustomFields(snapshot(row), custom.fields, custom.values),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('Recurring ops item not found.');
  return updated;
}

async function voidItem(userId: string, id: string, reason: string): Promise<RecurringOpsItem> {
  const loaded = await loadItem(id);
  if (loaded.item.voidedAt) throw new FormError('This item is already voided.');
  requireEditable(loaded.context);

  let updated: RecurringOpsItem | undefined;
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(recurringOpsItems)
      .set({ voidedAt: new Date(), voidedReason: reason, updatedBy: userId, updatedAt: new Date() })
      .where(eq(recurringOpsItems.id, id))
      .returning();
    if (!row) throw new FormError('Recurring ops item not found.');
    updated = row;
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'void',
      entityType: 'recurring_ops_item',
      entityId: id,
      before: snapshot(loaded.item),
      after: snapshot(row),
      reason,
    });
  });
  if (!updated) throw new FormError('Recurring ops item not found.');
  return updated;
}

// ---------------------------------------------------------------- actions

export async function createRecurringOpsAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, recurringOpsCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('recurring_ops_item', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let created: RecurringOpsItem;
  try {
    created = await createItem(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PAGE}/${created.annualPlanId}`,
    `Recurring ops item “${created.name}” created.`,
  );
}

export async function updateRecurringOpsAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, recurringOpsUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  const custom = await readCustomFieldPayloadState('recurring_ops_item', formData);
  const customError = invalidCustomFieldState(previous, parsed.values, custom.errors);
  if (customError) return customError;

  let updated: RecurringOpsItem;
  try {
    updated = await updateItem(user.id, parsed.data, custom);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PAGE}/${updated.annualPlanId}`,
    `Recurring ops item “${updated.name}” updated.`,
  );
}

export async function voidRecurringOpsAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await actionUser();
  const parsed = validateForm(previous, recurringOpsVoidSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: RecurringOpsItem;
  try {
    updated = await voidItem(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(
    `${PAGE}/${updated.annualPlanId}`,
    `Recurring ops item “${updated.name}” voided.`,
  );
}
