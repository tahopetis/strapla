import { describe, expect, it } from 'vitest';
import { loginRedirectPath, SESSION_ENDED_REASON } from './login-redirect';

/**
 * The redirect an unauthenticated request receives. A visitor who never had a
 * session sees the plain login screen; a browser that still carries a session
 * cookie has an ended session and must be told so.
 */
describe('loginRedirectPath', () => {
  it('keeps the plain login URL when the visitor never had a session', () => {
    expect(loginRedirectPath(false)).toBe('/login');
  });

  it('explains an ended session when a session cookie is still present', () => {
    expect(SESSION_ENDED_REASON).toBe('expired');
    expect(loginRedirectPath(true)).toBe('/login?reason=expired');
  });
});
