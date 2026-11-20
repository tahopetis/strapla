import { redirect } from 'next/navigation';
import type { z } from 'zod';
import {
  errorFormState,
  invalidFormState,
  parseFormResult,
  type FormFieldErrors,
  type FormState,
} from '@/lib/form-state';
import { requireUser, type CurrentUser } from '@/server/auth/session';

/**
 * Shared plumbing for server actions: authenticated user, form parsing with
 * Zod, flash-style redirects, and the state a form receives when a submission
 * is refused. Success keeps redirecting with a record-naming message.
 */

export class FormError extends Error {}

export async function actionUser(): Promise<CurrentUser> {
  return requireUser();
}

function appendParam(path: string, key: string, value: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export function finishWith(path: string, message = 'Saved.'): never {
  redirect(appendParam(path, 'message', message));
}

/** Postgres errors can arrive wrapped by Drizzle; walk the cause chain for the SQLSTATE. */
function findSqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** A message the user can act on, or undefined when the failure is unexpected. */
function knownFailureMessage(error: unknown): string | undefined {
  if (error instanceof FormError) return error.message;
  switch (findSqlState(error)) {
    case '23505':
      return 'A record with that code already exists.';
    case '23503':
      return 'A related record does not exist any more.';
    case '23514':
      return 'A data constraint was violated. Check the amounts and try again.';
    default:
      return undefined;
  }
}

/** Maps an error to a user-facing flash message. */
export function describeError(error: unknown, fallbackPathMessage = 'Something went wrong. Please try again.'): string {
  const known = knownFailureMessage(error);
  if (known !== undefined) return known;
  console.error('server action failed', error);
  return fallbackPathMessage;
}

export type ValidatedForm<S extends z.ZodType> =
  | { ok: true; data: z.output<S>; values: Record<string, string> }
  | { ok: false; state: FormState };

/**
 * Validates a submission and returns either the typed input or the state the
 * form renders: every value echoed, every field issue attached to its input.
 */
export function validateForm<S extends z.ZodType>(
  previous: FormState,
  schema: S,
  formData: FormData,
): ValidatedForm<S> {
  const parsed = parseFormResult(schema, formData);
  if (parsed.ok) return parsed;
  return {
    ok: false,
    state: invalidFormState(previous, parsed.fieldErrors, parsed.values, parsed.formError),
  };
}

/**
 * Turns a refused submission into form state. Recognized failures (business
 * rules, constraint violations) return a message beside the preserved values;
 * anything unexpected is rethrown so the styled error boundary renders instead
 * of a form that pretends the save can be retried.
 */
export function failureState(
  previous: FormState,
  error: unknown,
  values: Record<string, string>,
): FormState {
  const message = knownFailureMessage(error);
  if (message === undefined) throw error;
  return errorFormState(previous, message, values);
}

/** Custom-field issues keyed by the input name the field renders (`custom.<id>`). */
export function customFieldState(
  previous: FormState,
  values: Record<string, string>,
  errors: FormFieldErrors,
): FormState | null {
  if (Object.keys(errors).length === 0) return null;
  return invalidFormState(previous, errors, values);
}

