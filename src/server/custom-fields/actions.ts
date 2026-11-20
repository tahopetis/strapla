'use server';

import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { customFieldValues, customFields, type CustomField } from '@/db/schema';
import {
  customFieldCreateSchema,
  customFieldRemoveSchema,
  customFieldUpdateSchema,
} from '@/domain/inputs';
import {
  customFieldEntityLabel,
  customFieldTypeLabel,
  deriveCustomFieldKey,
  parseCustomFieldValue,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/domain/custom-fields';
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';

const PAGE = '/admin/custom-fields';

function fieldSnapshot(field: {
  entityType: string;
  name: string;
  key: string;
  type: string;
  required: boolean;
  description: string;
}): Record<string, unknown> {
  return {
    entityType: field.entityType,
    name: field.name,
    key: field.key,
    type: field.type,
    required: field.required,
    description: field.description,
  };
}

async function requireField(id: string): Promise<CustomField> {
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, id), isNull(customFields.archivedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new FormError('That custom field no longer exists.');
  return row;
}

/** Case-insensitive duplicate name check within one entity. */
async function assertNameFree(
  entityType: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const conditions = [
    eq(customFields.entityType, entityType),
    isNull(customFields.archivedAt),
    sql`lower(${customFields.name}) = lower(${name})`,
  ];
  if (excludeId) conditions.push(ne(customFields.id, excludeId));
  const duplicate = await getDb()
    .select({ id: customFields.id })
    .from(customFields)
    .where(and(...conditions))
    .limit(1);
  if (duplicate.length > 0) {
    throw new FormError(
      `The ${customFieldEntityLabel(entityType as CustomFieldEntityType)} already has a field called "${name}".`,
    );
  }
}

async function createCustomField(
  actorId: string,
  input: {
    entityType: CustomFieldEntityType;
    name: string;
    type: CustomFieldType;
    required: boolean;
    description: string;
  },
): Promise<CustomField> {
  await assertNameFree(input.entityType, input.name);

  let created: CustomField | undefined;
  await getDb().transaction(async (tx) => {
    const activeKeys = await tx
      .select({ key: customFields.key })
      .from(customFields)
      .where(
        and(
          eq(customFields.entityType, input.entityType),
          isNull(customFields.archivedAt),
        ),
      );
    [created] = await tx
      .insert(customFields)
      .values({
        entityType: input.entityType,
        name: input.name,
        key: deriveCustomFieldKey(input.name, activeKeys.map((row) => row.key)),
        type: input.type,
        required: input.required,
        description: input.description,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();
    if (!created) throw new Error('failed to create the custom field');

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'custom_field_create',
      entityType: 'custom_field',
      entityId: created.id,
      after: fieldSnapshot(created),
    });
  });
  if (!created) throw new Error('failed to create the custom field');
  return created;
}

/**
 * A type change is allowed only while every recorded value would still parse:
 * silently widening `number` to `text` is harmless, but turning recorded text
 * into a `number` would leave values the typed parser rejects.
 */
async function assertTypeChangeKeepsValues(
  field: CustomField,
  nextType: CustomFieldType,
): Promise<void> {
  if (field.type === nextType) return;

  const rows = await getDb()
    .select({ values: customFieldValues.values })
    .from(customFieldValues)
    .where(eq(customFieldValues.entityType, field.entityType));

  const invalid = rows.filter((row) => {
    const recorded = row.values[field.id];
    if (recorded === undefined) return false;
    const parsed = parseCustomFieldValue(
      { name: field.name, type: nextType, required: false },
      String(recorded),
    );
    return !parsed.ok;
  });

  if (invalid.length > 0) {
    throw new FormError(
      `"${field.name}" has recorded values that are not valid ${customFieldTypeLabel(nextType)} values. Remove it and add a new field instead of changing its type.`,
    );
  }
}

async function updateCustomField(
  actorId: string,
  input: {
    id: string;
    name: string;
    type: CustomFieldType;
    required: boolean;
    description: string;
    reason: string;
  },
): Promise<CustomField> {
  const existing = await requireField(input.id);
  await assertNameFree(existing.entityType, input.name, existing.id);
  await assertTypeChangeKeepsValues(existing, input.type);

  let updated: CustomField | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
      .update(customFields)
      .set({
        name: input.name,
        type: input.type,
        required: input.required,
        description: input.description,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(customFields.id, existing.id))
      .returning();
    if (!updated) throw new FormError('That custom field no longer exists.');

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'custom_field_update',
      entityType: 'custom_field',
      entityId: existing.id,
      before: fieldSnapshot(existing),
      after: fieldSnapshot(updated),
      reason: input.reason,
    });
  });
  if (!updated) throw new FormError('That custom field no longer exists.');
  return updated;
}

/**
 * Removal archives the definition rather than deleting it, like every other
 * record in the app. The field leaves the active registry (forms, record panels,
 * reports and exports) and its name is freed for reuse; the recorded values stay
 * in place and their before-state is kept in the audit snapshot.
 */
async function removeCustomField(actorId: string, id: string, reason: string): Promise<CustomField> {
  const existing = await requireField(id);

  let archived: CustomField | undefined;
  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ entityId: customFieldValues.entityId, values: customFieldValues.values })
      .from(customFieldValues)
      .where(eq(customFieldValues.entityType, existing.entityType));

    const recordedValues: Array<{ recordId: string; value: string | number }> = [];
    for (const row of rows) {
      const recorded = row.values[existing.id];
      if (recorded === undefined) continue;
      recordedValues.push({ recordId: row.entityId, value: recorded });
    }

    const [archivedRow] = await tx
      .update(customFields)
      .set({
        archivedAt: new Date(),
        archivedReason: reason,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(customFields.id, existing.id))
      .returning();
    if (!archivedRow) throw new FormError('That custom field no longer exists.');
    archived = archivedRow;

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'custom_field_remove',
      entityType: 'custom_field',
      entityId: existing.id,
      before: { ...fieldSnapshot(existing), recordedValues },
      after: {
        ...fieldSnapshot(archivedRow),
        archivedAt: archivedRow.archivedAt?.toISOString() ?? null,
      },
      reason,
    });
  });
  if (!archived) throw new FormError('That custom field no longer exists.');
  return archived;
}

// ---------------------------------------------------------------- actions

export async function createCustomFieldAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, customFieldCreateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let created: CustomField;
  try {
    created = await createCustomField(actor.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Custom field “${created.name}” added.`);
}

export async function updateCustomFieldAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, customFieldUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: CustomField;
  try {
    updated = await updateCustomField(actor.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Custom field “${updated.name}” updated.`);
}

export async function removeCustomFieldAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, customFieldRemoveSchema, formData);
  if (!parsed.ok) return parsed.state;

  let archived: CustomField;
  try {
    archived = await removeCustomField(actor.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Custom field “${archived.name}” removed.`);
}
