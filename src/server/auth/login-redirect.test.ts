import { describe, expect, it } from 'vitest';
import { isSessionEnded, loginRedirectUrl } from './login-redirect';

/**
 * The redirect an unauthenticated request receives. A visitor who never had a
 * session sees the plain login screen; a browser that still carries a session
 * cookie has an ended session and must be told so.
 */
describe('loginRedirectUrl', () => {
  it('keeps the plain login URL when no session cookie is present', () => {
    expect(loginRedirectUrl(false)).toBe('/login');
  });

  it('explains an ended session when a session cookie is present', () => {
    expect(loginRedirectUrl(true)).toBe('/login?reason=ended');
  });
});

/** The login page asks the same module whether to show the explanation. */
describe('isSessionEnded', () => {
  it('recognises the ended-session reason', () => {
    expect(isSessionEnded('ended')).toBe(true);
  });

  it('ignores other or missing reasons', () => {
    expect(isSessionEnded(undefined)).toBe(false);
    expect(isSessionEnded('other')).toBe(false);
  });
});
