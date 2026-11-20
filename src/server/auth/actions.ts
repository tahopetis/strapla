'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { errorFormState, type FormState } from '@/lib/form-state';
import { validateForm } from '@/server/actions/common';
import { validatePasswordPolicy, verifyPassword } from './password';
import { clearAttempts, isRateLimited, recordFailedAttempt } from './rate-limit';
import { createSession, destroyCurrentSession } from './session';
import { countUsers, createUser, findUserByEmail } from './users';

/**
 * Authentication forms (W5b): the login and setup pages stay server components
 * that check the session and the administrator count, and submit into these
 * actions through the shared client `<Form>`. Validation issues come back under
 * the input that caused them; rate-limit and credential failures are form-level
 * messages. A successful sign-in or setup redirects exactly as before.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Input names whose submitted value is never echoed back into form state. */
const SECRET_FIELDS = ['password', 'confirm'] as const;
const AUTH_FORM = { omit: SECRET_FIELDS };

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email must be at most 254 characters.')
  .regex(EMAIL_PATTERN, 'Enter a valid email address.');

/** The password policy lives in one place; the schema only decides which field it belongs to. */
const passwordSchema = z.string().superRefine((value, ctx) => {
  const message = validatePasswordPolicy(value);
  if (message !== null) ctx.addIssue({ code: 'custom', message });
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

const setupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name.')
      .max(120, 'Name must be at most 120 characters.'),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirm the password.'),
  })
  .refine((data) => data.password === data.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match.',
  });

export async function setupAction(previous: FormState, formData: FormData): Promise<FormState> {
  if ((await countUsers()) > 0) {
    redirect('/login');
  }

  const parsed = validateForm(previous, setupSchema, formData, AUTH_FORM);
  if (!parsed.ok) return parsed.state;
  const { name, email, password } = parsed.data;

  let userId: string;
  try {
    const created = await createUser({ name, email, password, actorUserId: null });
    userId = created.id;
  } catch (error) {
    console.error('setup: failed to create the first administrator', error);
    return errorFormState(previous, 'Could not create the account. Please try again.', parsed.values);
  }

  await createSession(userId);
  redirect('/dashboard');
}

export async function loginAction(previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = validateForm(previous, loginSchema, formData, AUTH_FORM);
  if (!parsed.ok) return parsed.state;
  const { email, password } = parsed.data;

  if (isRateLimited(email)) {
    return errorFormState(previous, 'Too many attempts. Try again in 15 minutes.', parsed.values);
  }

  const user = await findUserByEmail(email);
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !user.isActive || !passwordOk) {
    recordFailedAttempt(email);
    console.warn('login failed', { email });
    return errorFormState(previous, 'Email or password is incorrect.', parsed.values);
  }

  clearAttempts(email);
  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect('/login');
}
