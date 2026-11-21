import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { MoneyError, formatRupiah } from '@/domain/money';
import { SettlementError } from '@/domain/settlement';
import {
  errorFormState,
  invalidFormState,
  parseFormResult,
  type CollectFormValuesOptions,
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

/**
 * A business-rule refusal aimed at named inputs rather than the whole form.
 * `failureState` renders it as field state, so a refused submission keeps every
 * value the user entered and each message lands under the input that caused it.
 * A refusal about the entry as a whole carries a form-level message instead.
 */
export class FieldError extends Error {
  readonly fields: FormFieldErrors;
  readonly formMessage?: string;

  constructor(fields: FormFieldErrors, formMessage?: string) {
    super(formMessage ?? 'The submitted values were refused.');
    this.name = 'FieldError';
    this.fields = fields;
    this.formMessage = formMessage;
  }
}

/** One settlement split as the domain validator sees it, keyed by its commitment. */
export interface SettlementSplitInput {
  commitmentId: string;
  amount: number;
  commitmentAmount: number;
  alreadySettled: number;
}

const SETTLEMENT_DUPLICATE = 'the same commitment cannot be settled twice in one spend entry';
const SETTLEMENT_NOT_POSITIVE = 'a settlement amount must be positive';
const SETTLEMENT_OVER_OPEN = 'a settlement cannot exceed the open commitment amount';
const SETTLEMENT_OVER_SPEND = 'settlements cannot exceed the spend amount';
const SETTLEMENT_UNSAFE_TOTAL = 'settlement total is unsafe';
const SETTLEMENT_MISSING_COMMITMENT = 'a settlement split needs a commitment';
const SETTLEMENT_ALREADY_OVER_COMMITMENT = 'settled amount exceeds the commitment amount';

const SETTLEMENT_ROW_ERROR = 'The settlement amounts could not be checked. Review the rows and try again.';
const SETTLEMENT_AMOUNT_ERROR = 'The settlement amount must be greater than zero.';
const SETTLEMENT_DUPLICATE_ERROR = 'The same commitment cannot be settled twice in one entry.';

function settlementFieldName(commitmentId: string): string {
  return `settle_${commitmentId}`;
}

function openAmount(split: SettlementSplitInput): number {
  return split.commitmentAmount - split.alreadySettled;
}

/**
 * The domain's settlement rules are framework-free and raise `SettlementError`
 * (or `MoneyError` for a malformed amount). The form needs a per-input refusal
 * instead, so this translates each violation to the settlement input it belongs
 * to — `settle_<commitmentId>`, the name the settlement row renders — and a
 * form-level message for violations of the entry as a whole. It never lets a
 * settlement refusal escape to the route error boundary.
 */
export function settlementFieldError(
  error: unknown,
  splits: readonly SettlementSplitInput[],
  spendAmount: number,
): FieldError | null {
  if (error instanceof SettlementError) {
    if (error.message === SETTLEMENT_DUPLICATE) {
      const seen = new Set<string>();
      const duplicate = splits.find((split) => {
        const first = !seen.has(split.commitmentId);
        seen.add(split.commitmentId);
        return !first;
      });
      if (duplicate) {
        return new FieldError({ [settlementFieldName(duplicate.commitmentId)]: SETTLEMENT_DUPLICATE_ERROR });
      }
    }

    if (error.message === SETTLEMENT_NOT_POSITIVE) {
      const invalid = splits.find(
        (split) => !Number.isSafeInteger(split.amount) || split.amount <= 0,
      );
      if (invalid) {
        return new FieldError({
          [settlementFieldName(invalid.commitmentId)]: SETTLEMENT_AMOUNT_ERROR,
        });
      }
    }

    if (error.message === SETTLEMENT_OVER_OPEN) {
      const overOpen = splits.find((split) => {
        const open = openAmount(split);
        return open >= 0 && split.amount > open;
      });
      if (overOpen) {
        return new FieldError({
          [settlementFieldName(overOpen.commitmentId)]:
            `This settlement is more than the commitment's open amount (${formatRupiah(openAmount(overOpen))}).`,
        });
      }
    }

    switch (error.message) {
      case SETTLEMENT_OVER_SPEND:
        return new FieldError(
          {},
          `The settlements add up to more than the spend amount (${formatRupiah(spendAmount)}).`,
        );
      case SETTLEMENT_UNSAFE_TOTAL:
        return new FieldError({}, 'The settlement total is too large to record.');
      case SETTLEMENT_MISSING_COMMITMENT:
        return new FieldError({}, 'Choose a commitment for every settlement amount.');
      case SETTLEMENT_ALREADY_OVER_COMMITMENT:
        return new FieldError(
          {},
          "The commitment's settled amount is already above its total, so no further settlement can be recorded.",
        );
      default:
        return new FieldError({}, SETTLEMENT_ROW_ERROR);
    }
  }

  // A negative split amount trips the money guard before the domain's own
  // positive-amount rule; the form still refuses it on the offending row.
  if (error instanceof MoneyError) {
    const invalid = splits.find(
      (split) => !Number.isSafeInteger(split.amount) || split.amount <= 0,
    );
    if (invalid) {
      return new FieldError({
        [settlementFieldName(invalid.commitmentId)]: SETTLEMENT_AMOUNT_ERROR,
      });
    }
    return new FieldError({}, SETTLEMENT_ROW_ERROR);
  }

  return null;
}

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
  options: CollectFormValuesOptions = {},
): ValidatedForm<S> {
  const parsed = parseFormResult(schema, formData, options);
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
  if (error instanceof FieldError) {
    return invalidFormState(previous, error.fields, values, error.formMessage);
  }
  const message = knownFailureMessage(error);
  if (message === undefined) throw error;
  return errorFormState(previous, message, values);
}

/** Custom-field issues keyed by the input name the field renders (`custom.<id>`). */
export function invalidCustomFieldState(
  previous: FormState,
  values: Record<string, string>,
  errors: FormFieldErrors,
): FormState | null {
  if (Object.keys(errors).length === 0) return null;
  return invalidFormState(previous, errors, values);
}
