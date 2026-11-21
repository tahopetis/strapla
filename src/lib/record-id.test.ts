import { describe, expect, it } from 'vitest';
import { isRecordId } from './record-id';

describe('isRecordId', () => {
  it('accepts the canonical hyphenated UUID the app links to', () => {
    expect(isRecordId('3f6c0a52-8f3e-4a5e-9c47-1d2b3a4c5d6e')).toBe(true);
    expect(isRecordId('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('accepts an upper-case UUID, which Postgres also accepts', () => {
    expect(isRecordId('3F6C0A52-8F3E-4A5E-9C47-1D2B3A4C5D6E')).toBe(true);
  });

  it('rejects route words and empty segments', () => {
    expect(isRecordId('close')).toBe(false);
    expect(isRecordId('anything')).toBe(false);
    expect(isRecordId('')).toBe(false);
  });

  it('rejects truncated, over-long or malformed UUIDs', () => {
    expect(isRecordId('3f6c0a52-8f3e-4a5e-9c47-1d2b3a4c5d6')).toBe(false);
    expect(isRecordId('3f6c0a52-8f3e-4a5e-9c47-1d2b3a4c5d6ee')).toBe(false);
    expect(isRecordId('3f6c0a528f3e4a5e9c471d2b3a4c5d6e')).toBe(false);
    expect(isRecordId('{3f6c0a52-8f3e-4a5e-9c47-1d2b3a4c5d6e}')).toBe(false);
    expect(isRecordId('3f6c0a52-8f3e-4a5e-9c47-1d2b3a4c5d6g')).toBe(false);
  });

  it('rejects a missing value', () => {
    expect(isRecordId(undefined)).toBe(false);
    expect(isRecordId(null)).toBe(false);
  });
});
