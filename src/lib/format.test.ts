import { describe, expect, it } from 'vitest';
import { formatBuildVersion, formatDate, formatDateTime, toDateInputValue } from './format';

describe('formatDate', () => {
  it('formats dates as DD/MM/YYYY in Asia/Jakarta', () => {
    expect(formatDate('2026-10-25T12:00:00Z')).toBe('25/10/2026');
    // 2026-10-25T20:00Z is already 26 October in Jakarta (UTC+7)
    expect(formatDate('2026-10-25T20:00:00Z')).toBe('26/10/2026');
  });
});

describe('formatDateTime', () => {
  it('formats date and time in Asia/Jakarta', () => {
    expect(formatDateTime('2026-10-25T12:07:59Z')).toBe('25/10/2026, 19:07');
  });
});

describe('toDateInputValue', () => {
  it('renders YYYY-MM-DD in the app time zone', () => {
    expect(toDateInputValue('2026-10-25T20:00:00Z')).toBe('2026-10-26');
  });
});

describe('formatBuildVersion', () => {
  it('prefixes a bare version with one v', () => {
    expect(formatBuildVersion('0.5.0')).toBe('v0.5.0');
    expect(formatBuildVersion('2026.12.0')).toBe('v2026.12.0');
  });

  it('does not double the prefix on a tag ref', () => {
    expect(formatBuildVersion('v0.5.0')).toBe('v0.5.0');
    expect(formatBuildVersion('vv0.5.0')).toBe('v0.5.0');
  });

  it('shows branch and local builds as they are', () => {
    expect(formatBuildVersion('main')).toBe('main');
    expect(formatBuildVersion('dev')).toBe('dev');
  });

  it('falls back to dev for an empty value', () => {
    expect(formatBuildVersion('  ')).toBe('dev');
  });
});
