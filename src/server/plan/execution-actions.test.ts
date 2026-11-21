import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the execution refusals (#99, #100). The database,
 * session, custom-field registry, audit writer and redirect are mocked at the
 * module boundary, so these tests observe what an action does with a submitted
 * form: refuse a settlement violation inline on the settlement row (keeping the
 * values and opening no transaction), accept or refuse a component change on a
 * spend entry, and record the accepted change in the audit entry.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  readCustomFieldPayloadState: vi.fn(),
  readCustomFieldValues: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/custom-fields/form', () => ({
  readCustomFieldPayloadState: mocks.readCustomFieldPayloadState,
}));
vi.mock('@/server/custom-fields/data', () => ({
  readCustomFieldValues: mocks.readCustomFieldValues,
  saveCustomFieldValues: mocks.saveCustomFieldValues,
}));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));

import { MoneyError } from '@/domain/money';
import { SettlementError, validateSettlementSplits, type SettlementSplit } from '@/domain/settlement';
import type { FormState } from '@/lib/form-state';
import {
  FieldError,
  settlementFieldError,
  type SettlementSplitInput,
} from '@/server/actions/common';
import { createSpendAction, updateSpendAction } from './execution-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const ALLOCATION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const COMMITMENT_ID = '33333333-3333-4333-8333-333333333333';
const SPEND_ID = '44444444-4444-4444-8444-444444444444';

function spendForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/** The row `loadParent` returns for a project year allocation. */
function allocationParent() {
  return {
    allocation: { id: ALLOCATION_ID },
    project: { id: PROJECT_ID, status: 'active' },
    annualPlan: { id: '55555555-5555-4555-8555-555555555555', status: 'active', fiscalYear: 2028 },
    strategicPlan: { status: 'active' },
  };
}

function commitmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMITMENT_ID,
    amount: 10_000_000,
    component: 'capex',
    voidedAt: null,
    projectYearAllocationId: ALLOCATION_ID,
    recurringOpsItemId: null,
    ...overrides,
  };
}

function spendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SPEND_ID,
    component: 'capex',
    amount: 4_000_000,
    spentOn: '2028-06-01',
    categoryId: null,
    vendor: 'PT Edits Vendor',
    reference: 'EDITS-SP-2',
    description: null,
    settlementKind: 'current',
    voidedAt: null,
    projectYearAllocationId: ALLOCATION_ID,
    recurringOpsItemId: null,
    ...overrides,
  };
}

/**
 * A `getDb()` stand-in: every query consumes the next queued result. Drizzle's
 * builder is a thenable whose plain `await` and terminal `limit(1)` both resolve
 * to the queued rows, which is enough for the action's read queries.
 */
function queuedDb(results: unknown[][]) {
  let index = 0;
  const transaction = vi.fn();
  const database = {
    select: () => {
      const rows = results[index] ?? [];
      index += 1;
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(rows),
        then: (
          onFulfilled: (value: unknown[]) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(rows).then(onFulfilled, onRejected),
      };
      return chain;
    },
    transaction,
  };
  mocks.getDb.mockReturnValue(database);
  return database;
}

/** Runs the real domain validator so the tests pin the messages it actually raises. */
function domainRefusal(input: {
  spendAmount: number;
  splits: SettlementSplit[];
}): SettlementError | MoneyError {
  try {
    validateSettlementSplits(input);
  } catch (error) {
    if (error instanceof SettlementError || error instanceof MoneyError) return error;
    throw error;
  }
  throw new Error('expected the domain to refuse the settlement splits');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.test',
    name: 'Owner',
  });
  mocks.readCustomFieldPayloadState.mockResolvedValue({ fields: [], values: {}, errors: {} });
  mocks.readCustomFieldValues.mockResolvedValue({});
  mocks.saveCustomFieldValues.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settlementFieldError', () => {
  it('attaches an over-settlement to the settlement row and names the open amount', () => {
    const splits: SettlementSplitInput[] = [
      {
        commitmentId: COMMITMENT_ID,
        amount: 11_000_000,
        commitmentAmount: 10_000_000,
        alreadySettled: 0,
      },
    ];
    const error = domainRefusal({ spendAmount: 12_000_000, splits });

    const refusal = settlementFieldError(error, splits, 12_000_000);

    expect(refusal).toBeInstanceOf(FieldError);
    expect(refusal?.fields[`settle_${COMMITMENT_ID}`]).toBe(
      "This settlement is more than the commitment's open amount (Rp 10.000.000).",
    );
    expect(refusal?.formMessage).toBeUndefined();
  });

  it('counts the already settled amount towards the open amount', () => {
    const splits: SettlementSplitInput[] = [
      {
        commitmentId: COMMITMENT_ID,
        amount: 7_000_000,
        commitmentAmount: 10_000_000,
        alreadySettled: 4_000_000,
      },
    ];
    const error = domainRefusal({ spendAmount: 7_000_000, splits });

    const refusal = settlementFieldError(error, splits, 7_000_000);

    expect(refusal?.fields[`settle_${COMMITMENT_ID}`]).toContain('(Rp 6.000.000)');
  });

  it('attaches a duplicated commitment to its settlement row', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: COMMITMENT_ID, amount: 1_000_000, commitmentAmount: 5_000_000, alreadySettled: 0 },
      { commitmentId: COMMITMENT_ID, amount: 1_000_000, commitmentAmount: 5_000_000, alreadySettled: 0 },
    ];
    const error = domainRefusal({ spendAmount: 2_000_000, splits });

    const refusal = settlementFieldError(error, splits, 2_000_000);

    expect(refusal?.fields[`settle_${COMMITMENT_ID}`]).toBe(
      'The same commitment cannot be settled twice in one entry.',
    );
  });

  it('attaches a zero settlement amount to its row', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: COMMITMENT_ID, amount: 0, commitmentAmount: 5_000_000, alreadySettled: 0 },
    ];
    const error = domainRefusal({ spendAmount: 5_000_000, splits });

    const refusal = settlementFieldError(error, splits, 5_000_000);

    expect(refusal?.fields[`settle_${COMMITMENT_ID}`]).toBe(
      'The settlement amount must be greater than zero.',
    );
  });

  it('attaches a negative settlement amount to its row', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: COMMITMENT_ID, amount: -1, commitmentAmount: 5_000_000, alreadySettled: 0 },
    ];
    const error = domainRefusal({ spendAmount: 5_000_000, splits });

    const refusal = settlementFieldError(error, splits, 5_000_000);

    expect(error).toBeInstanceOf(MoneyError);
    expect(refusal?.fields[`settle_${COMMITMENT_ID}`]).toBe(
      'The settlement amount must be greater than zero.',
    );
  });

  it('reports settlements above the spend amount on the form', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: COMMITMENT_ID, amount: 8_000_000, commitmentAmount: 10_000_000, alreadySettled: 0 },
    ];
    const error = domainRefusal({ spendAmount: 5_000_000, splits });

    const refusal = settlementFieldError(error, splits, 5_000_000);

    expect(refusal?.fields).toEqual({});
    expect(refusal?.formMessage).toBe(
      'The settlements add up to more than the spend amount (Rp 5.000.000).',
    );
  });

  it('reports an unsafe settlement total on the form', () => {
    const splits: SettlementSplitInput[] = [
      {
        commitmentId: COMMITMENT_ID,
        amount: Number.MAX_SAFE_INTEGER,
        commitmentAmount: Number.MAX_SAFE_INTEGER,
        alreadySettled: 0,
      },
      {
        commitmentId: '66666666-6666-4666-8666-666666666666',
        amount: 1,
        commitmentAmount: 1,
        alreadySettled: 0,
      },
    ];
    const error = domainRefusal({ spendAmount: Number.MAX_SAFE_INTEGER, splits });

    const refusal = settlementFieldError(error, splits, Number.MAX_SAFE_INTEGER);

    expect(refusal?.formMessage).toBe('The settlement total is too large to record.');
  });

  it('reports a split without a commitment on the form', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: '', amount: 1_000_000, commitmentAmount: 5_000_000, alreadySettled: 0 },
    ];
    const error = domainRefusal({ spendAmount: 1_000_000, splits });

    const refusal = settlementFieldError(error, splits, 1_000_000);

    expect(refusal?.formMessage).toBe('Choose a commitment for every settlement amount.');
  });

  it('reports a commitment already settled above its total on the form', () => {
    const splits: SettlementSplitInput[] = [
      { commitmentId: COMMITMENT_ID, amount: 1_000_000, commitmentAmount: 1_000_000, alreadySettled: 2_000_000 },
    ];
    const error = domainRefusal({ spendAmount: 1_000_000, splits });

    const refusal = settlementFieldError(error, splits, 1_000_000);

    expect(refusal?.formMessage).toContain('already above its total');
  });

  it('leaves failures that are not settlement violations to the shared translation', () => {
    expect(settlementFieldError(new Error('boom'), [], 0)).toBeNull();
    expect(settlementFieldError(null, [], 0)).toBeNull();
  });
});

describe('createSpendAction settlement refusals', () => {
  function overSettlementForm(): FormData {
    return spendForm({
      allocationId: ALLOCATION_ID,
      component: 'capex',
      amount: '12000000',
      spentOn: '2028-04-04',
      settlementKind: 'current',
      reference: 'EXEC-SP-6',
      [`settle_${COMMITMENT_ID}`]: '11000000',
    });
  }

  it('returns the over-settlement inline, preserving every entered value and writing nothing', async () => {
    const database = queuedDb([
      [allocationParent()],
      [commitmentRow()],
      [{ projectId: PROJECT_ID, fiscalYear: 2028 }],
      [{ amount: 0 }],
    ]);

    const state = await createSpendAction(INITIAL, overSettlementForm());

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.[`settle_${COMMITMENT_ID}`]).toBe(
      "This settlement is more than the commitment's open amount (Rp 10.000.000).",
    );
    // the refused submission keeps the typed values, including the settlement row
    expect(state.values?.[`settle_${COMMITMENT_ID}`]).toBe('11000000');
    expect(state.values?.amount).toBe('12000000');
    expect(state.values?.reference).toBe('EXEC-SP-6');
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('reports settlements above the spend amount in the form without writing', async () => {
    const database = queuedDb([
      [allocationParent()],
      [commitmentRow()],
      [{ projectId: PROJECT_ID, fiscalYear: 2028 }],
      [{ amount: 0 }],
    ]);

    const state = await createSpendAction(
      INITIAL,
      spendForm({
        allocationId: ALLOCATION_ID,
        component: 'capex',
        amount: '5000000',
        spentOn: '2028-04-04',
        settlementKind: 'current',
        reference: 'EXEC-SP-7',
        [`settle_${COMMITMENT_ID}`]: '8000000',
      }),
    );

    expect(state.status).toBe('invalid');
    expect(state.message).toBe(
      'The settlements add up to more than the spend amount (Rp 5.000.000).',
    );
    expect(state.fieldErrors).toEqual({});
    expect(database.transaction).not.toHaveBeenCalled();
  });
});

describe('updateSpendAction component changes', () => {
  function updateForm(component: string, extra: Record<string, string> = {}): FormData {
    return spendForm({
      id: SPEND_ID,
      component,
      amount: '4000000',
      spentOn: '2028-06-01',
      settlementKind: 'current',
      vendor: 'PT Edits Vendor',
      reference: 'EDITS-SP-2',
      reason: 'Corrected the spend entry.',
      ...extra,
    });
  }

  /** The transaction executor `updateSpend` writes the spend update through. */
  function updateExecutor(updated: Record<string, unknown>) {
    const set = vi.fn(() => ({
      where: () => ({ returning: () => Promise.resolve([updated]) }),
    }));
    const transaction = { update: vi.fn(() => ({ set })) };
    return { transaction, set };
  }

  it('persists a component change while nothing is settled and audits it', async () => {
    const updated = spendRow({ component: 'opex', vendor: 'PT Edits Vendor' });
    const { transaction, set } = updateExecutor(updated);
    const database = queuedDb([[spendRow()], [allocationParent()], []]);
    database.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
    );

    await updateSpendAction(INITIAL, updateForm('opex'));

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ component: 'opex' }));
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.recordAudit.mock.calls[0]?.[1] as {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    };
    expect(audit.before?.component).toBe('capex');
    expect(audit.after?.component).toBe('opex');
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('message='));
  });

  it('refuses a component change once the spend has settlements', async () => {
    const database = queuedDb([
      [spendRow()],
      [allocationParent()],
      [{ amount: 4_000_000 }],
    ]);

    const state = await updateSpendAction(INITIAL, updateForm('opex'));

    expect(state.status).toBe('error');
    expect(state.message).toBe('Void the spend entry and re-enter it to change its component.');
    // the attempted value is preserved so nothing the user typed is lost
    expect(state.values?.component).toBe('opex');
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('keeps a vendor edit working on a settled spend', async () => {
    const updated = spendRow({ vendor: 'PT Edits Vendor (revised)' });
    const { transaction, set } = updateExecutor(updated);
    const database = queuedDb([
      [spendRow()],
      [allocationParent()],
      [{ amount: 4_000_000 }],
    ]);
    database.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
    );

    await updateSpendAction(
      INITIAL,
      updateForm('capex', { vendor: 'PT Edits Vendor (revised)' }),
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'capex', vendor: 'PT Edits Vendor (revised)' }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('message='));
  });
});
