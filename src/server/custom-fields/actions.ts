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
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
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
): Promise<void> {
  await assertNameFree(input.entityType, input.name);

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
    const [created] = await tx
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
): Promise<void> {
  const existing = await requireField(input.id);
  await assertNameFree(existing.entityType, input.name, existing.id);
  await assertTypeChangeKeepsValues(existing, input.type);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
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
}

/**
 * Removal archives the definition rather than deleting it, like every other
 * record in the app. The field leaves the active registry (forms, record panels,
 * reports and exports) and its name is freed for reuse; the recorded values stay
 * in place and their before-state is kept in the audit snapshot.
 */
async function removeCustomField(actorId: string, id: string, reason: string): Promise<void> {
  const existing = await requireField(id);

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

    const [archived] = await tx
      .update(customFields)
      .set({
        archivedAt: new Date(),
        archivedReason: reason,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(customFields.id, existing.id))
      .returning();
    if (!archived) throw new FormError('That custom field no longer exists.');

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'custom_field_remove',
      entityType: 'custom_field',
      entityId: existing.id,
      before: { ...fieldSnapshot(existing), recordedValues },
      after: {
        ...fieldSnapshot(archived),
        archivedAt: archived.archivedAt?.toISOString() ?? null,
      },
      reason,
    });
  });
}

// ---------------------------------------------------------------- actions

export async function createCustomFieldAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(customFieldCreateSchema, formData);
    await createCustomField(actor.id, input);
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Custom field added.');
}

export async function updateCustomFieldAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(customFieldUpdateSchema, formData);
    await updateCustomField(actor.id, input);
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Custom field updated.');
}

export async function removeCustomFieldAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(customFieldRemoveSchema, formData);
    await removeCustomField(actor.id, input.id, input.reason);
  } catch (error) {
    failWith(PAGE, describeError(error));
  }
  finishWith(PAGE, 'Custom field removed.');
}
