import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the split opening-balance control totals (ADR-0006
 * §5, #114). The spreadsheet control totals are four figures now: envelope
 * capex/opex and prior consumed capex/opex. The action must persist all four,
 * keep the reason in the audit trail, and refuse a submission that leaves one of
 * them blank before any database work.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  getOpeningReconciliation: vi.fn(),
  getStrategicPlan: vi.fn(),
  isFirstStrategicPlan: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('./opening-queries', () => ({ getOpeningReconciliation: mocks.getOpeningReconciliation }));
vi.mock('./queries', () => ({
  getStrategicPlan: mocks.getStrategicPlan,
  isFirstStrategicPlan: mocks.isFirstStrategicPlan,
}));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));

import type { FormState } from '@/lib/form-state';
import { saveOpeningReconciliationAction } from './opening-reconciliation-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const REASON = 'Reconciled to the FY2026 spreadsheets';

function savedRow() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    planId: PLAN_ID,
    controlEnvelopeCapex: 9_000_000_000,
    controlEnvelopeOpex: 4_500_000_000,
    controlPriorProgramBudgetUsedCapex: 1_200_000_000,
    controlPriorProgramBudgetUsedOpex: 300_000_000,
    controlProgramBudgets: 0,
    controlProgramCarryIn: 0,
    controlProjectOpeningAllocated: 0,
    controlProjectOpeningCommitted: 0,
    controlProjectOpeningSpent: 0,
    controlProjectFullLifeAllocated: 0,
    signedOffAt: null,
    signOffReason: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function existingRow() {
  return {
    ...savedRow(),
    controlEnvelopeCapex: 8_000_000_000,
    controlEnvelopeOpex: 4_000_000_000,
    controlPriorProgramBudgetUsedCapex: 1_000_000_000,
    controlPriorProgramBudgetUsedOpex: 200_000_000,
  };
}

/** The insert half of a Drizzle upsert builder; `returning` resolves with the row. */
function insertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.values.mockReturnValue(chain);
  chain.onConflictDoUpdate.mockReturnValue(chain);
  return chain;
}

function database(rows: unknown[]) {
  const insert = vi.fn().mockReturnValue(insertChain(rows));
  const transaction = vi.fn();
  return { insert, transaction };
}

function controlForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    planId: PLAN_ID,
    controlEnvelopeCapex: '9.000.000.000',
    controlEnvelopeOpex: '4.500.000.000',
    controlPriorProgramBudgetUsedCapex: '1.200.000.000',
    controlPriorProgramBudgetUsedOpex: '300.000.000',
    controlProgramBudgets: '0',
    controlProgramCarryIn: '0',
    controlProjectOpeningAllocated: '0',
    controlProjectOpeningCommitted: '0',
    controlProjectOpeningSpent: '0',
    controlProjectFullLifeAllocated: '0',
    reason: REASON,
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.test',
    name: 'Owner',
  });
  mocks.getStrategicPlan.mockResolvedValue({
    id: PLAN_ID,
    name: 'IT Strategic Plan 2026–2030',
    startFiscalYear: 2026,
    endFiscalYear: 2030,
    status: 'active',
  });
  mocks.isFirstStrategicPlan.mockResolvedValue(true);
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveOpeningReconciliationAction — split control totals', () => {
  it('persists the four split controls and audits them with the reason', async () => {
    const db = database([savedRow()]);
    const tx = { insert: db.insert };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);
    mocks.getOpeningReconciliation.mockResolvedValue(null);

    await expect(
      saveOpeningReconciliationAction(INITIAL, controlForm()),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(db.insert).toHaveBeenCalledWith(expect.anything());
    const inserted = db.insert.mock.results[0]?.value;
    expect(inserted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: PLAN_ID,
        controlEnvelopeCapex: 9_000_000_000,
        controlEnvelopeOpex: 4_500_000_000,
        controlPriorProgramBudgetUsedCapex: 1_200_000_000,
        controlPriorProgramBudgetUsedOpex: 300_000_000,
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'create',
        entityType: 'opening_balance_reconciliation',
        reason: REASON,
        after: expect.objectContaining({
          controlEnvelopeCapex: 9_000_000_000,
          controlEnvelopeOpex: 4_500_000_000,
          controlPriorProgramBudgetUsedCapex: 1_200_000_000,
          controlPriorProgramBudgetUsedOpex: 300_000_000,
        }),
      }),
    );
  });

  it('keeps the before/after split figures when an existing reconciliation is updated', async () => {
    const db = database([savedRow()]);
    const tx = { insert: db.insert };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);
    mocks.getOpeningReconciliation.mockResolvedValue(existingRow());

    await expect(
      saveOpeningReconciliationAction(INITIAL, controlForm()),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'update',
        before: expect.objectContaining({
          controlEnvelopeCapex: 8_000_000_000,
          controlPriorProgramBudgetUsedOpex: 200_000_000,
        }),
        after: expect.objectContaining({
          controlEnvelopeCapex: 9_000_000_000,
          controlPriorProgramBudgetUsedOpex: 300_000_000,
        }),
      }),
    );
  });

  it('refuses a blank opex envelope control before any database work', async () => {
    const db = database([savedRow()]);
    mocks.getDb.mockReturnValue(db);

    const state = await saveOpeningReconciliationAction(
      INITIAL,
      controlForm({ controlEnvelopeOpex: '' }),
    );

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.controlEnvelopeOpex).toContain(
      'Total envelope (opex) is required (use 0 for none).',
    );
    expect(state.values?.controlEnvelopeCapex).toBe('9.000.000.000');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a blank prior opex control before any database work', async () => {
    const db = database([savedRow()]);
    mocks.getDb.mockReturnValue(db);

    const state = await saveOpeningReconciliationAction(
      INITIAL,
      controlForm({ controlPriorProgramBudgetUsedOpex: '' }),
    );

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.controlPriorProgramBudgetUsedOpex).toContain(
      'Prior program budget consumed (opex) is required (use 0 for none).',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('saveOpeningReconciliationAction — first-plan gate', () => {
  it('refuses a successor plan before any database work', async () => {
    mocks.isFirstStrategicPlan.mockResolvedValue(false);
    const db = database([savedRow()]);
    mocks.getDb.mockReturnValue(db);

    const state = await saveOpeningReconciliationAction(INITIAL, controlForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('Opening balances are recorded once, for the first plan.');
    expect(state.values?.controlEnvelopeCapex).toBe('9.000.000.000');
    expect(mocks.getOpeningReconciliation).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
