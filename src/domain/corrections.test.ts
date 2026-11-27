import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the closed-year correction classification (ADR-0007, issue
 * #108). The server derives "this write is a correction" from the governing
 * annual plan's status at write time — there is no client-supplied flag — so
 * this module is the single place that decides the audit action and whether a
 * reason is good enough. The bounds are pinned here; the action-level proofs
 * live in `src/server/plan/correction-actions.test.ts`.
 */

import {
  CORRECTION_ACTION,
  CORRECTION_WRITE,
  CORRECTED_AFTER_CLOSE_LABEL,
  isCorrectionAfterClose,
  isCorrectionReason,
  updateAuditAction,
} from './corrections';

describe('isCorrectionAfterClose', () => {
  it('is false while the fiscal year is still draft', () => {
    expect(isCorrectionAfterClose({ status: 'draft' })).toBe(false);
  });

  it('is false while the fiscal year is active', () => {
    expect(isCorrectionAfterClose({ status: 'active' })).toBe(false);
  });

  it('is true once the fiscal year is closed', () => {
    expect(isCorrectionAfterClose({ status: 'closed' })).toBe(true);
  });
});

describe('updateAuditAction', () => {
  it('records an ordinary update on an open year', () => {
    expect(updateAuditAction({ status: 'draft' })).toBe('update');
    expect(updateAuditAction({ status: 'active' })).toBe('update');
  });

  it('records a correction once the year is closed', () => {
    expect(updateAuditAction({ status: 'closed' })).toBe(CORRECTION_ACTION);
    expect(updateAuditAction({ status: 'closed' })).toBe('correction');
  });
});

describe('isCorrectionReason', () => {
  it('refuses a missing or blank reason', () => {
    expect(isCorrectionReason(null)).toBe(false);
    expect(isCorrectionReason(undefined)).toBe(false);
    expect(isCorrectionReason('')).toBe(false);
    expect(isCorrectionReason('   ')).toBe(false);
  });

  it('refuses a reason shorter than the minimum', () => {
    expect(isCorrectionReason('ab')).toBe(false);
    expect(isCorrectionReason('  ab  ')).toBe(false);
  });

  it('accepts a reason at the minimum and above', () => {
    expect(isCorrectionReason('abc')).toBe(true);
    expect(isCorrectionReason('  typo  ')).toBe(true);
    expect(isCorrectionReason('Typo in the approved figure, corrected after the close.')).toBe(true);
  });
});

describe('published constants', () => {
  it('names the correction audit action and the derived label', () => {
    expect(CORRECTION_ACTION).toBe('correction');
    expect(CORRECTED_AFTER_CLOSE_LABEL).toBe('Corrected after close');
  });

  it('exposes the guard option the six update paths pass', () => {
    expect(CORRECTION_WRITE).toEqual({ allowClosed: true });
  });
});
