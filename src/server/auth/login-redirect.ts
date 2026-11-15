/** Query value carried when a browser with an ended session is sent back to sign in. */
export const SESSION_ENDED_REASON = 'ended';

/**
 * Where an unauthenticated request lands. A browser that still carries a
 * session cookie had a session that ended (expired, revoked or the account was
 * deactivated); a visitor with no cookie simply needs to sign in.
 */
export function loginRedirectUrl(sessionCookiePresent: boolean): string {
  return sessionCookiePresent ? `/login?reason=${SESSION_ENDED_REASON}` : '/login';
}

/** The login page uses this to show the explanation without re-spelling the query value. */
export function isSessionEnded(reason: string | undefined): boolean {
  return reason === SESSION_ENDED_REASON;
}
