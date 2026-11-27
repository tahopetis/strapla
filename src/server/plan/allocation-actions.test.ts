import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the project-year allocation update path (#96).
 *
 * The closed-year refusal this file used to pin is superseded on that path by
 * ADR-0007 (issue #108): a closed fiscal year accepts an in-place correction of
 * an existing allocation, audited under the `correction` action with a reason.
 * The closed-year case below proves the write now reaches the transaction with
 * that action; the refusals that remain (a void, a voided record) and the full
 * six-path correction proof live in correction-actions.test.ts.
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

import type { FormState } from '@/lib/form-state';
import { updateAllocationAction } from './allocation-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_ID = '22222222-2222-4222-8222-222222222222';
const ALLOCATION_ID = '33333333-3333-4333-8333-333333333333';
const ANNUAL_PLAN_ID = '44444444-4444-4444-8444-444444444444';
const SI_ID = '55555555-5555-4555-8555-555555555555';
const FISCAL_YEAR = 2027;

/** The row shape `loadAllocationContext` selects, reduced to the fields the guards read. */
function allocationContext(annualPlanStatus: 'active' | 'closed') {
  return {
    allocation: {
      id: ALLOCATION_ID,
      projectId: PROJECT_ID,
      annualPlanId: ANNUAL_PLAN_ID,
      annualProgramId: PROGRAM_ID,
      allocationCapex: 500_000_000,
      allocationOpex: 100_000_000,
      carryInCapex: 0,
      carryInOpex: 0,
      notes: null,
      voidedAt: null,
      voidedReason: null,
    },
    project: {
      id: PROJECT_ID,
      originatingProgramId: PROGRAM_ID,
      code: 'PRJ-2027-001',
      status: 'active',
      startFiscalYear: FISCAL_YEAR,
      endFiscalYear: FISCAL_YEAR,
    },
    program: { id: PROGRAM_ID, siId: SI_ID },
    annualPlan: { id: ANNUAL_PLAN_ID, fiscalYear: FISCAL_YEAR, status: annualPlanStatus },
    strategicPlan: { status: 'active' },
  };
}

function updatedAllocation() {
  return {
    id: ALLOCATION_ID,
    projectId: PROJECT_ID,
    annualPlanId: ANNUAL_PLAN_ID,
    annualProgramId: PROGRAM_ID,
    allocationCapex: 600_000_000,
    allocationOpex: 100_000_000,
    carryInCapex: 0,
    carryInOpex: 0,
    notes: 'Board revision',
    voidedAt: null,
    voidedReason: null,
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

/** A database handle whose successive select() calls return the given row sets. */
function database(...lookups: unknown[][]) {
  const select = vi.fn();
  for (const rows of lookups) select.mockReturnValueOnce(queryChain(rows));
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

function updateForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    id: ALLOCATION_ID,
    allocationCapex: '600000000',
    allocationOpex: '100000000',
    carryInCapex: '0',
    carryInOpex: '0',
    notes: 'Board revision',
    reason: 'Board revision',
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
  mocks.readCustomFieldPayloadState.mockResolvedValue({ fields: [], values: {}, errors: {} });
  mocks.readCustomFieldValues.mockResolvedValue({});
  mocks.saveCustomFieldValues.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
  // A real redirect throws; the action never returns after `finishWith`.
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateAllocationAction closed-year correction', () => {
  it('saves a closed-year update as a correction instead of refusing it', async () => {
    const db = database([allocationContext('closed')], [{ siId: SI_ID }]);
    const write = updateChain([updatedAllocation()]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(updateAllocationAction(INITIAL, updateForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ allocationCapex: 600_000_000, notes: 'Board revision' }),
    );
    // ADR-0007 §5: the closed year names the write a correction, not an update.
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'correction',
        entityType: 'project_year_allocation',
        entityId: ALLOCATION_ID,
        reason: 'Board revision',
        before: expect.objectContaining({ allocationCapex: 500_000_000 }),
        after: expect.objectContaining({ allocationCapex: 600_000_000 }),
      }),
    );
  });

  it('lets an update on an open annual plan reach the transaction', async () => {
    const db = database([allocationContext('active')], [{ siId: SI_ID }]);
    const write = updateChain([updatedAllocation()]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(updateAllocationAction(INITIAL, updateForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ allocationCapex: 600_000_000, notes: 'Board revision' }),
    );
    expect(mocks.saveCustomFieldValues).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'update',
        entityType: 'project_year_allocation',
        entityId: ALLOCATION_ID,
        reason: 'Board revision',
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/projects/${PROJECT_ID}`),
    );
  });
});

describe('updateAllocationAction capex/opex shift guard', () => {
  const SHIFT_REFUSAL = /capex and opex never shift/i;

  it('refuses a save that raises capex while lowering opex', async () => {
    const db = database([allocationContext('active')], [{ siId: SI_ID }]);
    mocks.getDb.mockReturnValue(db);

    const state = await updateAllocationAction(
      INITIAL,
      updateForm({ allocationCapex: '600000000', allocationOpex: '50000000' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toMatch(SHIFT_REFUSAL);
    expect(state.values?.allocationOpex).toBe('50000000');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('lets both components move in the same direction', async () => {
    const db = database([allocationContext('active')], [{ siId: SI_ID }]);
    const write = updateChain([updatedAllocation()]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateAllocationAction(
        INITIAL,
        updateForm({ allocationCapex: '600000000', allocationOpex: '150000000' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
