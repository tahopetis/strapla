import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { customFields, customFieldValues, type CustomField } from '@/db/schema';
import {
  countCustomFieldUsage,
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
    key: row.key,
    type: row.type as CustomFieldType,
    required: row.required,
    description: row.description,
    example: row.example,
    position: row.position,
  };
}

/**
 * The active registry, in administrator order; optionally scoped to one entity.
 * This is the one ordering read (#73): the position column is authoritative,
 * with creation order and then name as tie-breakers so legacy rows and a
 * concurrent insert can never leave the order undefined.
 */
export async function listCustomFieldDefinitions(
  entityType?: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  const active = isNull(customFields.archivedAt);
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(entityType ? and(active, eq(customFields.entityType, entityType)) : active)
    .orderBy(
      asc(customFields.position),
      asc(customFields.createdAt),
      asc(customFields.name),
    );
  return rows.map(toCustomFieldDefinition);
}

/** The next position for a new field: one past the highest, archived rows included. */
export async function nextCustomFieldPosition(
  executor: Pick<Db, 'select'>,
  entityType: CustomFieldEntityType,
): Promise<number> {
  const rows = await executor
    .select({ position: customFields.position })
    .from(customFields)
    .where(eq(customFields.entityType, entityType))
    .orderBy(desc(customFields.position))
    .limit(1);
  return (rows[0]?.position ?? -1) + 1;
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

/** A stored custom-field row known to be archived, so its timestamp is present. */
export type ArchivedFieldRow = CustomField & { archivedAt: Date };

/** An active definition plus the number of records that hold a value for it (issue #76). */
export interface CustomFieldWithUsage extends CustomFieldDefinition {
  recordsWithValue: number;
}

/**
 * Reads every record's stored values once per entity type, keyed by record id.
 * One scan serves every field of that entity, whether active or archived.
 */
async function readValuesByEntityType(
  entityTypes: Iterable<CustomFieldEntityType>,
): Promise<Map<CustomFieldEntityType, Map<string, CustomFieldValues>>> {
  const valuesByEntity = new Map<CustomFieldEntityType, Map<string, CustomFieldValues>>();
  for (const type of entityTypes) {
    valuesByEntity.set(type, await readAllCustomFieldValues(type));
  }
  return valuesByEntity;
}

/**
 * The active registry with the number of records that hold a value for each
 * field, for the administration screen and the remove confirmation. Counting
 * uses the same `countCustomFieldUsage` rule as the archived list, so usage
 * reads the same before and after a field is archived.
 */
export async function listCustomFieldDefinitionsWithUsage(): Promise<CustomFieldWithUsage[]> {
  const definitions = await listCustomFieldDefinitions();
  if (definitions.length === 0) return [];

  const valuesByEntity = await readValuesByEntityType(
    new Set(definitions.map((definition) => definition.entityType)),
  );

  return definitions.map((definition) => ({
    ...definition,
    recordsWithValue: countCustomFieldUsage(
      valuesByEntity.get(definition.entityType)?.values() ?? [],
      definition.id,
    ),
  }));
}

/** An archived definition plus what a restore would bring back into view (#72). */
export interface ArchivedCustomField extends CustomFieldDefinition {
  archivedAt: Date;
  archivedReason: string;
  /** Number of records of this entity that hold a non-empty value for the field. */
  recordsWithValue: number;
}

/**
 * Archived registry entries, newest archive first, optionally scoped to one
 * entity. Each row carries the number of records that still hold a value for
 * it, so the admin screen can show what a restore would bring back (#72).
 *
 * The value rows are keyed by field id, so a restore never needs to rewrite
 * data: counting is a membership check on each record's stored object.
 */
export async function listArchivedCustomFields(
  entityType?: CustomFieldEntityType,
): Promise<ArchivedCustomField[]> {
  const archived = isNotNull(customFields.archivedAt);
  const rows = await getDb()
    .select()
    .from(customFields)
    .where(entityType ? and(archived, eq(customFields.entityType, entityType)) : archived)
    .orderBy(desc(customFields.archivedAt), asc(customFields.name));

  // The where clause already guarantees a timestamp; the filter only carries
  // that guarantee into the row type.
  const scoped = rows.filter((row): row is ArchivedFieldRow => row.archivedAt !== null);
  if (scoped.length === 0) return [];

  const valuesByEntity = await readValuesByEntityType(
    new Set(scoped.map((row) => row.entityType as CustomFieldEntityType)),
  );

  return scoped.map((row) => ({
    ...toCustomFieldDefinition(row),
    archivedAt: row.archivedAt,
    archivedReason: row.archivedReason ?? '',
    recordsWithValue: countCustomFieldUsage(
      valuesByEntity.get(row.entityType as CustomFieldEntityType)?.values() ?? [],
      row.id,
    ),
  }));
}
