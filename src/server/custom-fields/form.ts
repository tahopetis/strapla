import {
  parseCustomFieldValues,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import type { FormFieldErrors } from '@/lib/form-state';
import { listCustomFieldDefinitions } from './data';

/** The declared registry plus one record's parsed values, as an action needs them. */
export interface CustomFieldPayload {
  fields: readonly CustomFieldDefinition[];
  values: CustomFieldValues;
}

/** A custom-field parse where every issue is keyed by the input it came from. */
export interface CustomFieldPayloadState extends CustomFieldPayload {
  errors: FormFieldErrors;
}

/**
 * Reads the declared fields and parses the submitted `custom.<fieldId>` inputs,
 * returning the issues keyed by the input name each field renders instead of
 * throwing. A migrated action keeps those messages beside the values the user
 * typed; the record-writing functions still receive a clean payload.
 */
export async function readCustomFieldPayloadState(
  entityType: CustomFieldEntityType,
  formData: FormData,
): Promise<CustomFieldPayloadState> {
  const fields = await listCustomFieldDefinitions(entityType);
  const raw: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(`custom.${field.id}`);
    if (typeof value === 'string') raw[field.id] = value;
  }

  const parsed = parseCustomFieldValues(fields, raw);
  if (parsed.ok) return { fields, values: parsed.values, errors: {} };

  const errors: FormFieldErrors = {};
  for (const issue of parsed.errors) {
    errors[`custom.${issue.fieldId}`] = issue.message;
  }
  return { fields, values: {}, errors };
}
