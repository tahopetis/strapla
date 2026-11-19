import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { customFields, customFieldValues, type CustomField } from '@/db/schema';
import {
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldType,
  type CustomFieldValues,
} from '@/domain/custom-fields';

/**
 * Registry and value storage for the custom fields (#46).
 *
 * Values are one JSON object per (entity type, record id) keyed by field id.
 * Every mutation passes the same transaction as the record it belongs to, so a
 * record and its extra values cannot drift apart (ADR-0004).
 */

/** Enough of the database handle for a read or write; both `Db` and a transaction satisfy it. */
export type CustomFieldExecutor = Pick<Db, 'select' | 'insert' | 'update'>;

export function toCustomFieldDefinition(row: CustomField): CustomFieldDefinition {
  return {
    id: row.id,
    entityType: row.entityType as CustomFieldEntityType,
    name: row.name,
    type: row.type as CustomFieldType,
    required: row.required,
    description: row.description,
  };
}

/** The active registry, in creation order; optionally scoped to one entity. */
export async function listCustomFieldDefinitions(
  entityType?: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  const active = isNull(customFields.archivedAt);
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(entityType ? and(active, eq(customFields.entityType, entityType)) : active)
    .orderBy(asc(customFields.createdAt), asc(customFields.name));
  return rows.map(toCustomFieldDefinition);
}

export async function findCustomField(id: string): Promise<CustomFieldDefinition | null> {
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, id), isNull(customFields.archivedAt)))
    .limit(1);
  const row = rows[0];
  return row ? toCustomFieldDefinition(row) : null;
}

export async function readCustomFieldValues(
  entityType: CustomFieldEntityType,
  entityId: string,
  executor: CustomFieldExecutor = getDb(),
): Promise<CustomFieldValues> {
  const rows = await executor
    .select({ values: customFieldValues.values })
    .from(customFieldValues)
    .where(
      and(eq(customFieldValues.entityType, entityType), eq(customFieldValues.entityId, entityId)),
    )
    .limit(1);
  return rows[0]?.values ?? {};
}

/** Values for many records at once, keyed by record id; used by list pages and reports. */
export async function readCustomFieldValuesMap(
  entityType: CustomFieldEntityType,
  entityIds: readonly string[],
): Promise<Map<string, CustomFieldValues>> {
  if (entityIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ entityId: customFieldValues.entityId, values: customFieldValues.values })
    .from(customFieldValues)
    .where(
      and(
        eq(customFieldValues.entityType, entityType),
        inArray(customFieldValues.entityId, [...new Set(entityIds)]),
      ),
    );
  return new Map(rows.map((row) => [row.entityId, row.values]));
}

/** Values for every record of one entity; used by reports and exports. */
export async function readAllCustomFieldValues(
  entityType: CustomFieldEntityType,
): Promise<Map<string, CustomFieldValues>> {
  const rows = await getDb()
    .select({ entityId: customFieldValues.entityId, values: customFieldValues.values })
    .from(customFieldValues)
    .where(eq(customFieldValues.entityType, entityType));
  return new Map(rows.map((row) => [row.entityId, row.values]));
}

/**
 * Upserts the record's values. The app never hard-deletes: a record whose values
 * are cleared keeps an empty `{}` row rather than removing it.
 *
 * Values for archived fields are retained: the registry never deletes a
 * definition, so a record's history is not trimmed when another field changes.
 */
export async function saveCustomFieldValues(
  executor: CustomFieldExecutor,
  input: {
    entityType: CustomFieldEntityType;
    entityId: string;
    fields: readonly CustomFieldDefinition[];
    values: CustomFieldValues;
    userId: string;
  },
): Promise<void> {
  const current = await readCustomFieldValues(input.entityType, input.entityId, executor);
  const activeIds = new Set(input.fields.map((field) => field.id));
  const retained: CustomFieldValues = {};
  for (const [fieldId, value] of Object.entries(current)) {
    if (!activeIds.has(fieldId)) retained[fieldId] = value;
  }
  const next = { ...retained, ...input.values };

  await executor
    .insert(customFieldValues)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      values: next,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [customFieldValues.entityType, customFieldValues.entityId],
      set: {
        values: next,
        updatedBy: input.userId,
        updatedAt: new Date(),
      },
    });
}
