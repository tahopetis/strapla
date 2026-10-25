import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requireUser, type CurrentUser } from '@/server/auth/session';

/**
 * Shared plumbing for server actions: authenticated user, form parsing with
 * Zod, and flash-style redirects.
 */

export class FormError extends Error {}

export async function actionUser(): Promise<CurrentUser> {
  return requireUser();
}

/** Parses a FormData payload with a Zod schema; only string entries are kept. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): z.output<S> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new FormError(issue?.message ?? 'Invalid input.');
  }
  return result.data;
}

function appendParam(path: string, key: string, value: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

export function failWith(path: string, message: string): never {
  redirect(appendParam(path, 'error', message));
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

/** Maps an error to a user-facing flash message. */
export function describeError(error: unknown, fallbackPathMessage = 'Something went wrong. Please try again.'): string {
  if (error instanceof FormError) return error.message;
  switch (findSqlState(error)) {
    case '23505':
      return 'A record with that code already exists.';
    case '23503':
      return 'A related record does not exist any more.';
    case '23514':
      return 'A data constraint was violated. Check the amounts and try again.';
    default:
      console.error('server action failed', error);
      return fallbackPathMessage;
  }
}
