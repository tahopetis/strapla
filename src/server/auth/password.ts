import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt parameters per ADR-0002: N = 2^15, r = 8, p = 1, 64-byte key.
 * Using Node's built-in scrypt keeps the image free of native build
 * dependencies on arm64/musl.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

export const PASSWORD_MIN_LENGTH = 12;

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return 'Password must be at most 200 characters.';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;

  const salt = Buffer.from(saltRaw ?? '', 'base64');
  const expected = Buffer.from(keyRaw ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length, { ...PARAMS, N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
