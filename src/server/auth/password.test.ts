import { describe, expect, it } from 'vitest';
import { hashPassword, validatePasswordPolicy, verifyPassword } from './password';

const PASSWORD = 'correct horse battery staple';

describe('hashPassword', () => {
  it('produces a scrypt record with a unique salt each time', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);
    expect(first.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(first).not.toBe(second);
    expect(first.split('$')).toHaveLength(6);
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword('incorrect horse battery staple', stored)).toBe(false);
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'scrypt$bad$bad$bad$bad$bad')).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
  });
});

describe('validatePasswordPolicy', () => {
  it('requires at least 12 characters', () => {
    expect(validatePasswordPolicy('short')).not.toBeNull();
    expect(validatePasswordPolicy('twelve-chars')).toBeNull();
  });
});
