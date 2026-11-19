import {
  parseCustomFieldValues,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import { FormError } from '@/server/actions/common';
import { listCustomFieldDefinitions } from './data';

/** The declared registry plus one record's parsed values, as an action needs them. */
export interface CustomFieldPayload {
  fields: readonly CustomFieldDefinition[];
  values: CustomFieldValues;
}

/**
 * Reads the declared fields for one entity and parses the submitted
 * `custom.<fieldId>` inputs against them, in one step.
 */
export async function readCustomFieldPayload(
  entityType: CustomFieldEntityType,
  formData: FormData,
): Promise<CustomFieldPayload> {
  const fields = await listCustomFieldDefinitions(entityType);
  return { fields, values: parseCustomFieldForm(fields, formData) };
}

/**
 * Reads the `custom.<fieldId>` inputs of an entity form against the declared
 * registry. Unknown inputs cannot create a value: the registry decides which
 * fields exist. The first validation error is raised as a `FormError`, which
 * the shared action plumbing turns into the page flash message.
 */
export function parseCustomFieldForm(
  fields: readonly CustomFieldDefinition[],
  formData: FormData,
): CustomFieldValues {
  if (fields.length === 0) return {};

  const raw: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(`custom.${field.id}`);
    if (typeof value === 'string') raw[field.id] = value;
  }

  const parsed = parseCustomFieldValues(fields, raw);
  if (!parsed.ok) throw new FormError(parsed.errors[0]!.message);
  return parsed.values;
}
