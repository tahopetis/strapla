import { carryOverAmountSchema } from '@/domain/inputs';

/**
 * The close form's carry-over field contract (W4a): the field name and its raw
 * value reading live here, so the form's live preview and the server action use
 * one definition and can never disagree about which fields are carry-over.
 */

export type CarryOverEntityType = 'program' | 'allocation';
export type CarryOverComponent = 'capex' | 'opex';

export function carryOverFieldName(
  entityType: CarryOverEntityType,
  entityId: string,
  component: CarryOverComponent,
): string {
  return `carry_${entityType}_${entityId}_${component}`;
}

export type CarryOverFieldResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

/**
 * Validates one raw close-form carry-over field against the shared input schema.
 * A non-string value (a File, or a missing field) is treated as blank and left to
 * the schema to reject, so zero carry-over must always be an explicit "0".
 */
export function readCarryOverField(raw: unknown, label: string): CarryOverFieldResult {
  const result = carryOverAmountSchema(label).safeParse(typeof raw === 'string' ? raw : '');
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    message: result.error.issues[0]?.message ?? 'Enter a whole Rupiah amount (use 0 for none).',
  };
}
