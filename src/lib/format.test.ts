import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, toDateInputValue } from './format';

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
