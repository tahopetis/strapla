import type { z } from 'zod';

/**
 * The shared form pattern (W5b).
 *
 * Validation failures are returned to the client as state instead of a
 * redirect, so the form renders again with every submitted value and the
 * message attached to the field that caused it. Success still redirects with a
 * record-naming flash message.
 *
 * This module is deliberately free of server-only imports: the server actions
 * produce the state and the client form components consume it.
 */

export type FormFieldErrors = Record<string, string>;

export interface FormState {
  status: 'idle' | 'invalid' | 'error';
  /**
   * Per-form submission counter. Uncontrolled inputs are remounted when it
   * changes, so the echoed `values` replace what React's form reset cleared.
   */
  attempt: number;
  /** Form-level message: a business-rule refusal or a recognized server error. */
  message?: string;
  /** One message per offending input name, rendered under that input. */
  fieldErrors?: FormFieldErrors;
  /** Every submitted string value, echoed back so a failed submission loses nothing. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { status: 'idle', attempt: 0 };

/** The server-action signature a client `<Form>` or `<ConfirmDialog>` expects. */
export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export interface CollectFormValuesOptions {
  /** Input names that are never echoed back, such as passwords. */
  omit?: readonly string[];
}

/**
 * Every submitted string value, keyed by input name. Later entries win, which
 * mirrors the parser: the custom-field `required` checkbox submits a hidden
 * "off" followed by the visible "on".
 */
function submittedEntries(formData: FormData): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') entries[name] = value;
  }
  return entries;
}

function echoedValues(
  entries: Record<string, string>,
  omit: readonly string[] | undefined,
): Record<string, string> {
  if (!omit || omit.length === 0) return { ...entries };
  const excluded = new Set(omit);
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(entries)) {
    if (!excluded.has(name)) values[name] = value;
  }
  return values;
}

export function collectFormValues(
  formData: FormData,
  options: CollectFormValuesOptions = {},
): Record<string, string> {
  return echoedValues(submittedEntries(formData), options.omit);
}

export type ParseFormResult<S extends z.ZodType> =
  | { ok: true; data: z.output<S>; values: Record<string, string> }
  | { ok: false; fieldErrors: FormFieldErrors; formError?: string; values: Record<string, string> };

/**
 * Parses a form payload with a domain schema. Field issues map to the input
 * name they were raised on (Zod's `path`), and an issue without a path is a
 * form-level message.
 */
export function parseFormResult<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  options: CollectFormValuesOptions = {},
): ParseFormResult<S> {
  // Validation sees every submitted string; echo only hides the omitted ones.
  const raw = submittedEntries(formData);
  const values = echoedValues(raw, options.omit);

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data, values };

  const fieldErrors: FormFieldErrors = {};
  let formError: string | undefined;
  for (const issue of result.error.issues) {
    if (issue.path.length === 0) {
      formError ??= issue.message;
      continue;
    }
    const name = issue.path.map(String).join('.');
    fieldErrors[name] ??= issue.message;
  }
  return { ok: false, fieldErrors, formError, values };
}

function nextAttempt(previous: FormState | undefined): number {
  return (previous?.attempt ?? 0) + 1;
}

export function invalidFormState(
  previous: FormState | undefined,
  fieldErrors: FormFieldErrors,
  values: Record<string, string>,
  message?: string,
): FormState {
  return {
    status: 'invalid',
    attempt: nextAttempt(previous),
    fieldErrors,
    values,
    ...(message === undefined ? {} : { message }),
  };
}

export function errorFormState(
  previous: FormState | undefined,
  message: string,
  values: Record<string, string>,
): FormState {
  return {
    status: 'error',
    attempt: nextAttempt(previous),
    message,
    values,
  };
}
