/** Query value carried when a browser with an ended session is sent back to sign in. */
export const SESSION_ENDED_REASON = 'expired';

/**
 * Where an unauthenticated request lands. A browser that still carries a
 * session cookie had a session that ended (expired, revoked or the account was
 * deactivated); a visitor with no cookie simply needs to sign in.
 */
export function loginRedirectPath(hasSessionCookie: boolean): string {
  return hasSessionCookie ? `/login?reason=${SESSION_ENDED_REASON}` : '/login';
}
