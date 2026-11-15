import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sessions, users } from '@/db/schema';
import { SESSION_COOKIE } from './cookie';
import { loginRedirectUrl } from './login-redirect';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * The cookie outlives the database session. A session that expired leaves the
 * stale cookie behind, which is how the app tells "your session ended" apart
 * from "you were never signed in" — the cookie is never trusted for access.
 */
const SESSION_COOKIE_DURATION_MS = SESSION_DURATION_MS + 60 * 24 * 60 * 60 * 1000;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function secureCookieEnabled(): boolean {
  return (process.env.APP_BASE_URL ?? '').startsWith('https://');
}

/** Creates a database session and sets the HttpOnly cookie. Call from an action or route handler. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookieEnabled(),
    path: '/',
    expires: new Date(Date.now() + SESSION_COOKIE_DURATION_MS),
  });
}

/** Revokes the current session (if any) and clears the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** The request's session token, whether or not it is still valid. */
async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function getUserForToken(token: string | null): Promise<CurrentUser | null> {
  if (!token) return null;

  const rows = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getUserForToken(await readSessionToken());
}

export async function requireUser(): Promise<CurrentUser> {
  const token = await readSessionToken();
  const user = await getUserForToken(token);
  if (!user) redirect(loginRedirectUrl(token !== null));
  return user;
}
