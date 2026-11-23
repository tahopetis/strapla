import { describe, expect, it } from 'vitest';
import {
  parseRevisionForm,
  revisionAllocationFieldName,
  revisionProgramFieldName,
} from './revision-form';

/**
 * The budget revision form (#112). The header is one form like any other; the
 * lines are a grid of per-entity, per-component signed amounts, so their names
 * are derived rather than indexed and a blank cell simply means "no line".
 */

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_ID = '22222222-2222-4222-8222-222222222222';
const ALLOCATION_ID = '33333333-3333-4333-8333-333333333333';

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values: Record<string, string> = {
    annualPlanId: PLAN_ID,
    revisionDate: '2027-03-15',
    decisionReference: 'SC-2027-04',
    reason: 'Steering committee switch',
    [revisionProgramFieldName(PROGRAM_ID, 'capex')]: '-400000',
    [revisionProgramFieldName(PROGRAM_ID, 'opex')]: '',
    [revisionAllocationFieldName(ALLOCATION_ID, 'capex')]: '-400000',
    [revisionAllocationFieldName(ALLOCATION_ID, 'opex')]: '',
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe('revision form field names', () => {
  it('names a line by entity, id and component', () => {
    expect(revisionProgramFieldName(PROGRAM_ID, 'capex')).toBe(`program_${PROGRAM_ID}_capex`);
    expect(revisionAllocationFieldName(ALLOCATION_ID, 'opex')).toBe(
      `allocation_${ALLOCATION_ID}_opex`,
    );
  });
});

describe('parseRevisionForm', () => {
  it('reads a header and the filled line cells, ignoring blank cells', () => {
    const result = parseRevisionForm(form());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      annualPlanId: PLAN_ID,
      revisionDate: '2027-03-15',
      decisionReference: 'SC-2027-04',
      reason: 'Steering committee switch',
      lines: [
        { entityType: 'program', entityId: PROGRAM_ID, component: 'capex', delta: -400_000 },
        { entityType: 'allocation', entityId: ALLOCATION_ID, component: 'capex', delta: -400_000 },
      ],
    });
  });

  it('treats an omitted decision reference as awaiting the decision', () => {
    const result = parseRevisionForm(form({ decisionReference: '' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decisionReference).toBeNull();
  });

  it('refuses a malformed delta under its own field, keeping the other lines', () => {
    const result = parseRevisionForm(
      form({ [revisionProgramFieldName(PROGRAM_ID, 'capex')]: 'lots' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.[revisionProgramFieldName(PROGRAM_ID, 'capex')]).toMatch(
      /whole Rupiah/i,
    );
    expect(result.values?.[revisionProgramFieldName(PROGRAM_ID, 'capex')]).toBe('lots');
  });

  it('refuses a form without any line', () => {
    const result = parseRevisionForm(
      form({
        [revisionProgramFieldName(PROGRAM_ID, 'capex')]: '',
        [revisionAllocationFieldName(ALLOCATION_ID, 'capex')]: '',
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/at least one revision line/i);
  });

  it('refuses a header without a reason or date', () => {
    const result = parseRevisionForm(form({ reason: '', revisionDate: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.reason).toMatch(/required/i);
    expect(result.fieldErrors?.revisionDate).toMatch(/YYYY-MM-DD/);
  });
});
