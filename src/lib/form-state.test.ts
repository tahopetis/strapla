import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  collectFormValues,
  errorFormState,
  initialFormState,
  invalidFormState,
  parseFormResult,
  type FormState,
} from './form-state';
import { projectCreateSchema } from '@/domain/inputs';

const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';

function projectForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values: Record<string, string> = {
    originatingProgramId: PROGRAM_ID,
    name: 'Device Refresh',
    owner: 'IT Infrastructure Lead',
    startFiscalYear: '2027',
    endFiscalYear: '2027',
    allocatedBudgetFullLife: '1000000000',
    submittedPrice: '950000000',
    finalDealPrice: '900000000',
    openingAllocated: '0',
    openingCommitted: '0',
    openingSpent: '0',
    notes: '',
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

/**
 * The seam under test is the shared form-state module: it turns a Zod schema
 * and a submitted FormData into either typed input or the exact state a client
 * form needs to re-render with every value intact. Expected messages come from
 * the schemas themselves, not from re-running the same parse in the assertion.
 */
describe('parseFormResult', () => {
  it('returns the parsed input and every submitted string on success', () => {
    const result = parseFormResult(projectCreateSchema, projectForm());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Device Refresh');
      expect(result.data.startFiscalYear).toBe(2027);
      expect(result.values.owner).toBe('IT Infrastructure Lead');
    }
  });

  it('maps a bad field to its input name and keeps every other value', () => {
    const result = parseFormResult(
      projectCreateSchema,
      projectForm({ startFiscalYear: '1999', name: 'Imported project' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.startFiscalYear).toBe('Start fiscal year must be between 2000 and 2100.');
      expect(result.values.name).toBe('Imported project');
      expect(result.values.startFiscalYear).toBe('1999');
      expect(result.values.allocatedBudgetFullLife).toBe('1000000000');
    }
  });

  it('reports each offending field once, at the field that caused it', () => {
    const result = parseFormResult(
      projectCreateSchema,
      projectForm({ name: '', allocatedBudgetFullLife: 'not money' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.name).toBe('Project name is required.');
      expect(result.fieldErrors.allocatedBudgetFullLife).toBe(
        'Full-life allocated budget must be a whole Rupiah amount (digits only).',
      );
      expect(Object.keys(result.fieldErrors)).toHaveLength(2);
    }
  });

  it('validates an omitted field but never echoes its value', () => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(8) });
    const formData = new FormData();
    formData.set('email', 'owner@strapla.test');
    formData.set('password', 'correct horse battery staple');

    const result = parseFormResult(schema, formData, { omit: ['password'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.password).toBe('correct horse battery staple');
      expect(result.values).toEqual({ email: 'owner@strapla.test' });
    }
  });

  it('does not echo an omitted field when the submission is invalid', () => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(8) });
    const formData = new FormData();
    formData.set('email', 'not-an-email');
    formData.set('password', 'short');

    const result = parseFormResult(schema, formData, { omit: ['password'] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.email).toBe('Invalid email address');
      expect(result.values).toEqual({ email: 'not-an-email' });
    }
  });

  it('keeps a schema-level message separate from the field errors', () => {
    const schema = z
      .object({ start: z.string(), end: z.string() })
      .refine((value) => Number(value.start) < Number(value.end), 'The start must come before the end.');
    const formData = new FormData();
    formData.set('start', '10');
    formData.set('end', '1');

    const result = parseFormResult(schema, formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toBe('The start must come before the end.');
      expect(result.fieldErrors).toEqual({});
      expect(result.values.start).toBe('10');
    }
  });
});

describe('collectFormValues', () => {
  it('keeps the last entry for a name, like the checkbox hidden/visible pair', () => {
    const formData = new FormData();
    formData.set('required', 'off');
    formData.set('required', 'on');
    expect(collectFormValues(formData).required).toBe('on');
  });

  it('never echoes omitted fields such as passwords', () => {
    const formData = new FormData();
    formData.set('email', 'owner@strapla.test');
    formData.set('password', 'correct horse battery staple');
    expect(collectFormValues(formData, { omit: ['password'] })).toEqual({ email: 'owner@strapla.test' });
  });

  it('drops non-string entries such as file uploads', () => {
    const formData = new FormData();
    formData.set('reference', 'E2E');
    formData.set('file', new File(['irrelevant'], 'rows.csv', { type: 'text/csv' }));
    expect(collectFormValues(formData)).toEqual({ reference: 'E2E' });
  });
});

describe('form states', () => {
  const previous: FormState = { status: 'idle', attempt: 0 };

  it('starts idle with attempt zero', () => {
    expect(initialFormState).toEqual({ status: 'idle', attempt: 0 });
  });

  it('increments the attempt on an invalid submission so uncontrolled fields remount with values', () => {
    const state = invalidFormState(previous, { name: 'Project name is required.' }, { name: '' });

    expect(state.status).toBe('invalid');
    expect(state.attempt).toBe(1);
    expect(state.fieldErrors).toEqual({ name: 'Project name is required.' });
    expect(state.values).toEqual({ name: '' });
    expect(invalidFormState(state, {}, {}).attempt).toBe(2);
  });

  it('carries a form-level message and the values on a failed business rule', () => {
    const state = errorFormState(previous, 'A strategic plan already exists.', { name: 'Plan B' });

    expect(state.status).toBe('error');
    expect(state.message).toBe('A strategic plan already exists.');
    expect(state.values).toEqual({ name: 'Plan B' });
    expect(state.attempt).toBe(1);
  });
});
