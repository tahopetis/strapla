'use server';

import { redirect } from 'next/navigation';
import { validatePasswordPolicy, verifyPassword } from './password';
import { clearAttempts, isRateLimited, recordFailedAttempt } from './rate-limit';
import { createSession, destroyCurrentSession } from './session';
import { countUsers, createUser, findUserByEmail } from './users';

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function setupAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (await countUsers() > 0) {
    redirect('/login');
  }
  if (name.length === 0 || name.length > 120) errorRedirect('/setup', 'Enter a name (at most 120 characters).');
  if (!EMAIL_PATTERN.test(email)) errorRedirect('/setup', 'Enter a valid email address.');
  if (password !== confirm) errorRedirect('/setup', 'The passwords do not match.');
  const policyError = validatePasswordPolicy(password);
  if (policyError) errorRedirect('/setup', policyError);

  let userId: string;
  try {
    const created = await createUser({ name, email, password, actorUserId: null });
    userId = created.id;
  } catch (error) {
    console.error('setup: failed to create the first administrator', error);
    errorRedirect('/setup', 'Could not create the account. Please try again.');
  }

  await createSession(userId);
  redirect('/dashboard');
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) errorRedirect('/login', 'Enter your email and password.');

  if (isRateLimited(email)) {
    errorRedirect('/login', 'Too many attempts. Try again in 15 minutes.');
  }

  const user = await findUserByEmail(email);
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !user.isActive || !passwordOk) {
    recordFailedAttempt(email);
    console.warn('login failed', { email });
    errorRedirect('/login', 'Email or password is incorrect.');
  }

  clearAttempts(email);
  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect('/login');
}
