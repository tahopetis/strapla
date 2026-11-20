'use server';

import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { customFieldValues, customFields, type CustomField } from '@/db/schema';
import {
  customFieldCreateSchema,
  customFieldRemoveSchema,
  customFieldRestoreSchema,
  customFieldUpdateSchema,
} from '@/domain/inputs';
import {
  customFieldEntityLabel,
  customFieldRestoreConflictMessage,
  customFieldTypeLabel,
  deriveCustomFieldKey,
  parseCustomFieldValue,
  type CustomFieldEntityType,
  type CustomFieldRestoreConflict,
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
import type { ArchivedFieldRow } from './data';

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

/** The archived mirror of requireField: only a field currently out of the registry can be restored. */
async function requireArchivedField(id: string): Promise<ArchivedFieldRow> {
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, id), isNotNull(customFields.archivedAt)))
    .limit(1);
  const row = rows[0];
  if (!row || row.archivedAt === null) {
    throw new FormError('That archived custom field no longer exists.');
  }
  return { ...row, archivedAt: row.archivedAt };
}

/**
 * Active fields of one entity that collide with a name (case-insensitive) or a
 * key. One query serves both the duplicate guard on create/update and the named
 * refusal on restore, so the two cannot disagree about what "taken" means.
 */
async function findActiveFieldConflicts(
  executor: Pick<Db, 'select'>,
  entityType: string,
  match: { name?: string; key?: string; excludeId?: string },
): Promise<CustomFieldRestoreConflict> {
  const matches = [];
  if (match.name !== undefined) {
    matches.push(sql`lower(${customFields.name}) = lower(${match.name})`);
  }
  if (match.key !== undefined) matches.push(eq(customFields.key, match.key));
  if (matches.length === 0) return {};

  const conditions = [eq(customFields.entityType, entityType), isNull(customFields.archivedAt)];
  if (match.excludeId) conditions.push(ne(customFields.id, match.excludeId));

  const rows = await executor
    .select({
      name: customFields.name,
      sameName:
        match.name === undefined
          ? sql<boolean>`false`
          : sql<boolean>`lower(${customFields.name}) = lower(${match.name})`,
      sameKey:
        match.key === undefined
          ? sql<boolean>`false`
          : sql<boolean>`${customFields.key} = ${match.key}`,
    })
    .from(customFields)
    .where(and(...conditions, or(...matches)));

  const conflict: CustomFieldRestoreConflict = {};
  for (const row of rows) {
    if (row.sameName) conflict.sameName = row.name;
    if (row.sameKey) conflict.sameKey = row.name;
  }
  return conflict;
}

/**
 * A restore puts the archived name and key back into the active registry, where
 * the partial unique indexes require both to be free. Checking first names the
 * active field in the refusal instead of surfacing a constraint violation.
 */
async function assertRestoreIsFree(
  executor: Pick<Db, 'select'>,
  field: ArchivedFieldRow,
): Promise<void> {
  const conflict = await findActiveFieldConflicts(executor, field.entityType, {
    name: field.name,
    key: field.key,
  });
  const message = customFieldRestoreConflictMessage(
    field,
    conflict,
    customFieldEntityLabel(field.entityType as CustomFieldEntityType),
  );
  if (message) throw new FormError(message);
}

/** Case-insensitive duplicate name check within one entity. */
async function assertNameFree(
  entityType: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const conflict = await findActiveFieldConflicts(getDb(), entityType, { name, excludeId });
  if (conflict.sameName !== undefined) {
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

/**
 * Restores an archived field (#72). The definition returns to the active
 * registry, so it shows again on forms, record panels, reports and exports;
 * values are keyed by field id, so the recorded values appear with it. The
 * update and its audit entry share one transaction, like every other mutation.
 */
async function restoreCustomField(
  actorId: string,
  input: { id: string; reason: string },
): Promise<CustomField> {
  const archived = await requireArchivedField(input.id);

  let restored: CustomField | undefined;
  await getDb().transaction(async (tx) => {
    // The conflict check runs inside the transaction, against the registry the
    // update is about to write to; the partial unique indexes stay the
    // last-resort guard for a concurrent create that commits after this read.
    await assertRestoreIsFree(tx, archived);
    [restored] = await tx
      .update(customFields)
      .set({
        archivedAt: null,
        archivedReason: null,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(and(eq(customFields.id, archived.id), isNotNull(customFields.archivedAt)))
      .returning();
    if (!restored) throw new FormError('That archived custom field no longer exists.');

    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'custom_field_restore',
      entityType: 'custom_field',
      entityId: archived.id,
      before: {
        ...fieldSnapshot(archived),
        archivedAt: archived.archivedAt.toISOString(),
        archivedReason: archived.archivedReason,
      },
      after: { ...fieldSnapshot(restored), archivedAt: null, archivedReason: null },
      reason: input.reason,
    });
  });
  if (!restored) throw new FormError('That archived custom field no longer exists.');
  return restored;
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

/**
 * Restores an archived field, for issue #72. Values are keyed by field id, so
 * they show again everywhere once the definition is active again.
 */
export async function restoreCustomFieldAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, customFieldRestoreSchema, formData);
  if (!parsed.ok) return parsed.state;

  let restored: CustomField;
  try {
    restored = await restoreCustomField(actor.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(PAGE, `Custom field “${restored.name}” restored.`);
}
