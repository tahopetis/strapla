/**
 * Custom fields per entity (issue #46).
 *
 * An administrator defines typed extra fields on the four plan-record entities
 * (strategic initiative, annual program, project, recurring ops item).
 * Values live beside the record, keyed by field id, and never take part in money
 * rules, remaining budget, flags, allocations or existing report totals (G1).
 *
 * This module is framework-free: the admin screen, the entity forms, the audit
 * snapshot and the report/export layer all use these same rules, so the four
 * surfaces cannot drift apart.
 */

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_ENTITY_TYPES = [
  'strategic_initiative',
  'annual_program',
  'project',
  'recurring_ops_item',
] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

/** A registry entry: the admin-defined definition of one extra field. */
export interface CustomFieldDefinition {
  id: string;
  entityType: CustomFieldEntityType;
  /** Display name shown on forms, record panels, reports and exports. */
  name: string;
  type: CustomFieldType;
  required: boolean;
  description: string;
}

/** Field values are keyed by field id so renaming a field never rewrites data. */
export type CustomFieldValue = string | number;
export type CustomFieldValues = Record<string, CustomFieldValue>;

export interface CustomFieldError {
  fieldId: string;
  message: string;
}

/** The canonical display term for each entity (see GLOSSARY.md). */
const ENTITY_LABELS: Record<CustomFieldEntityType, string> = {
  strategic_initiative: 'Strategic initiative',
  annual_program: 'Annual program',
  project: 'Project',
  recurring_ops_item: 'Recurring Ops Item',
};

export const CUSTOM_FIELD_ENTITIES: ReadonlyArray<{ type: CustomFieldEntityType; label: string }> =
  CUSTOM_FIELD_ENTITY_TYPES.map((type) => ({ type, label: ENTITY_LABELS[type] }));

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
};

const MAX_TEXT_LENGTH = 2000;
/**
 * Whole numbers only, digits (and an optional minus). Thousands separators are
 * deliberately rejected: with a generic number field, "2.125" could mean 2125 or
 * 2.125, and silently choosing one stores a different value than was typed.
 */
const WHOLE_NUMBER = /^-?\d+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Derives the stable machine key for a new field from the administrator's name
 * ("Delivery note" -> "deliveryNote"). The key is set once and never changes;
 * it links a registry entry to the committed W9 field list and to integrations.
 * A collision gets a numeric suffix so the key stays unique per entity.
 */
export function deriveCustomFieldKey(name: string, takenKeys: Iterable<string>): string {
  const words = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const base = words.length === 0
    ? 'field'
    : words
        .map((word, index) => (index === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
        .join('');
  const taken = new Set(takenKeys);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

export function customFieldTypeLabel(type: CustomFieldType): string {
  return TYPE_LABELS[type];
}

export function isCustomFieldEntityType(value: string): value is CustomFieldEntityType {
  return CUSTOM_FIELD_ENTITIES.some((entity) => entity.type === value);
}

export function customFieldEntityLabel(type: CustomFieldEntityType): string {
  return ENTITY_LABELS[type];
}

export type CustomFieldValueParse =
  | { ok: true; value: CustomFieldValue | null }
  | { ok: false; message: string };

/**
 * Parses one typed value from form or filter input. A blank optional value is
 * `null` (the caller drops it); a blank required value is an error.
 */
export function parseCustomFieldValue(
  field: Pick<CustomFieldDefinition, 'name' | 'type' | 'required'>,
  raw: string | null | undefined,
): CustomFieldValueParse {
  const label = field.name;
  const text = (raw ?? '').trim();

  if (text.length === 0) {
    return field.required
      ? { ok: false, message: `${label} is required.` }
      : { ok: true, value: null };
  }

  if (field.type === 'text') {
    if (text.length > MAX_TEXT_LENGTH) {
      return { ok: false, message: `${label} must be at most ${MAX_TEXT_LENGTH} characters.` };
    }
    return { ok: true, value: text };
  }

  if (field.type === 'number') {
    if (!WHOLE_NUMBER.test(text)) {
      return { ok: false, message: `${label} must be a whole number (digits only).` };
    }
    const value = Number.parseInt(text, 10);
    if (!Number.isSafeInteger(value)) {
      return { ok: false, message: `${label} is outside the supported number range.` };
    }
    return { ok: true, value };
  }

  const match = ISO_DATE.exec(text);
  if (!match) {
    return { ok: false, message: `${label} must be a real date (YYYY-MM-DD).` };
  }
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!real) {
    return { ok: false, message: `${label} must be a real date (YYYY-MM-DD).` };
  }
  return { ok: true, value: text };
}

export type CustomFieldValuesParse =
  | { ok: true; values: CustomFieldValues }
  | { ok: false; errors: CustomFieldError[] };

/**
 * Parses every declared field from raw input keyed by field id. Unknown keys
 * are ignored: only the registry decides which field exists. Errors are
 * collected for the whole form so one save reports every bad field.
 */
export function parseCustomFieldValues(
  fields: readonly CustomFieldDefinition[],
  raw: Readonly<Record<string, string | null | undefined>>,
): CustomFieldValuesParse {
  const values: CustomFieldValues = {};
  const errors: CustomFieldError[] = [];

  for (const field of fields) {
    const parsed = parseCustomFieldValue(field, raw[field.id]);
    if (!parsed.ok) {
      errors.push({ fieldId: field.id, message: parsed.message });
    } else if (parsed.value !== null) {
      values[field.id] = parsed.value;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}

/**
 * The audit-trail view of a record's values: readable names instead of ids,
 * dropped when the record has no values so every audit entry stays small.
 */
export function customFieldSnapshot(
  fields: readonly CustomFieldDefinition[],
  values: CustomFieldValues,
): Record<string, CustomFieldValue> | null {
  const snapshot: Record<string, CustomFieldValue> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === null || value === '') continue;
    snapshot[field.name] = value;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/** Adds the custom-field snapshot to an audit before/after record. */
export function withCustomFields(
  snapshot: Record<string, unknown>,
  fields: readonly CustomFieldDefinition[],
  values: CustomFieldValues,
): Record<string, unknown> {
  const customFields = customFieldSnapshot(fields, values);
  return customFields ? { ...snapshot, customFields } : snapshot;
}

/**
 * A report filter for one custom field: text is a case-insensitive substring,
 * number and date use their typed parser (so a number must be typed as digits,
 * e.g. `1234`). A blank query means "no filter"; a value missing from the record
 * never matches.
 */
export function matchesCustomFieldFilter(
  values: CustomFieldValues | undefined,
  field: Pick<CustomFieldDefinition, 'id' | 'name' | 'type' | 'required'>,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return true;

  const recorded = values?.[field.id];
  if (recorded === undefined || recorded === null) return false;

  if (field.type === 'text') {
    return String(recorded).toLocaleLowerCase().includes(trimmed.toLocaleLowerCase());
  }

  const parsed = parseCustomFieldValue({ ...field, required: false }, trimmed);
  if (!parsed.ok || parsed.value === null) return false;
  return String(recorded) === String(parsed.value);
}

/**
 * Export column selection: the requested field ids in registry order. Unknown
 * ids are ignored so a stale link never breaks an export, and a field removed
 * from the registry cannot appear in a document.
 */
export function selectCustomExportFields(
  fields: readonly CustomFieldDefinition[],
  requestedIds: readonly string[],
): CustomFieldDefinition[] {
  const requested = new Set(requestedIds);
  return fields.filter((field) => requested.has(field.id));
}

/**
 * Resolves the `columns` query parameter for a report or export. Absent means
 * "all active custom fields"; an explicit empty value means "none", so the
 * export form can express both. Accepts repeated params and comma lists.
 */
export function resolveCustomExportFields(
  fields: readonly CustomFieldDefinition[],
  raw: string | readonly string[] | undefined | null,
): CustomFieldDefinition[] {
  if (raw === undefined || raw === null) return [...fields];
  const values = typeof raw === 'string' ? [raw] : raw;
  const ids = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return selectCustomExportFields(fields, ids);
}
