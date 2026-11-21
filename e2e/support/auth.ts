import type { BrowserContext } from '@playwright/test';
import { SESSION_COOKIE } from '../../src/server/auth/cookie';
import { hashPassword } from '../../src/server/auth/password';
import { createUser, mintSessionToken } from './db';

/**
 * The account the foundation journey creates through /setup. Later tiers sign
 * in as it (through the saved storageState) or mint extra members for
 * boundary cases.
 */
export const ADMIN = {
  name: 'Portfolio Owner',
  email: 'e2e-owner@strapla.test',
  password: 'correct horse battery staple',
};

export interface TestMember {
  userId: string;
  email: string;
  name: string;
  password: string;
  isActive: boolean;
}

/**
 * Creates a member straight in the database, with a real scrypt password hash
 * (the app's own hashing, imported rather than re-implemented) so the sign-in
 * form accepts it. Used for member lifecycle and session boundaries.
 */
export async function createMember(input: {
  name: string;
  email: string;
  password: string;
  isActive?: boolean;
}): Promise<TestMember> {
  const passwordHash = await hashPassword(input.password);
  const userId = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    isActive: input.isActive ?? true,
  });
  return { userId, ...input, isActive: input.isActive ?? true };
}

/** Mints a session for a member without touching the sign-in form. */
export async function signInWithSessionCookie(
  context: BrowserContext,
  baseURL: string,
  userId: string,
): Promise<void> {
  const token = await mintSessionToken(userId);
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }]);
}
