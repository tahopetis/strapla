import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the recurring-ops closed-year guard (#97). The
 * annual plan page hides every action when the fiscal year is closed, so a
 * browser can only pin the visible lock; the server refusal is proven here, at
 * the action boundary: a closed-year void comes back as form state with the
 * closed-year message and never opens the write transaction. An open year still
 * voids with the reason recorded in the audit trail.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));

import type { FormState } from '@/lib/form-state';
import { voidRecurringOpsAction } from './recurring-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const ANNUAL_PLAN_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const FISCAL_YEAR = 2027;
const REASON = 'Correction after the FY2027 close';
const CLOSED_REFUSAL = 'This fiscal year is closed and read-only.';

/** The row shape `loadItem` selects, reduced to the fields the guards read. */
function itemContext(annualPlanStatus: 'active' | 'closed') {
  return {
    item: {
      id: ITEM_ID,
      annualPlanId: ANNUAL_PLAN_ID,
      name: 'Leased lines 2027',
      categoryId: null,
      owner: null,
      opexBudget: 200_000_000,
      carryInOpex: 40_000_000,
      notes: null,
      voidedAt: null,
      voidedReason: null,
    },
    annualPlan: { id: ANNUAL_PLAN_ID, fiscalYear: FISCAL_YEAR, status: annualPlanStatus },
    strategicPlan: { status: 'active' },
  };
}

function voidedItem() {
  return {
    id: ITEM_ID,
    annualPlanId: ANNUAL_PLAN_ID,
    name: 'Leased lines 2027',
    categoryId: null,
    owner: null,
    opexBudget: 200_000_000,
    carryInOpex: 40_000_000,
    notes: null,
    voidedAt: new Date(),
    voidedReason: REASON,
  };
}

/** The read half of a Drizzle select builder: every step chains, `limit` resolves. */
function queryChain(rows: unknown[]) {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

/** A database handle whose select() resolves the given row set. */
function database(rows: unknown[]) {
  const select = vi.fn().mockReturnValue(queryChain(rows));
  const transaction = vi.fn();
  return { select, transaction };
}

/** The write half of a Drizzle update builder; `returning` resolves with the rows. */
function updateChain(rows: unknown[]) {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function voidForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    id: ITEM_ID,
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
  mocks.recordAudit.mockResolvedValue(undefined);
  // A real redirect throws; the action never returns after `finishWith`.
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voidRecurringOpsAction closed-year guard', () => {
  it('refuses a void on a closed annual plan before any write', async () => {
    const db = database([itemContext('closed')]);
    mocks.getDb.mockReturnValue(db);

    const state = await voidRecurringOpsAction(INITIAL, voidForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe(CLOSED_REFUSAL);
    // The refused submission keeps what the user entered.
    expect(state.values?.reason).toBe(REASON);
    // No void timestamp/reason is written and no audit entry is recorded.
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('voids on an open annual plan and records the reason in the audit trail', async () => {
    const db = database([itemContext('active')]);
    const write = updateChain([voidedItem()]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(voidRecurringOpsAction(INITIAL, voidForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ voidedAt: expect.any(Date), voidedReason: REASON }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'void',
        entityType: 'recurring_ops_item',
        entityId: ITEM_ID,
        reason: REASON,
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${ANNUAL_PLAN_ID}`),
    );
  });
});
