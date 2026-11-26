import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the activation freeze on annual program budgets
 * (#112, ADR-0006 §4). The form hides the budget inputs once the plan is
 * active, but the refusal has to live on the server: a browser can replay the
 * draft form. Non-amount fields stay editable, and a program created during an
 * active year must start at zero — its money arrives through a revision.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  readCustomFieldPayloadState: vi.fn(),
  readCustomFieldValues: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  recordAudit: vi.fn(),
  receiveCarry: vi.fn(),
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
vi.mock('@/server/plan/carry-ledger', () => ({ receiveCarry: mocks.receiveCarry }));

import type { FormState } from '@/lib/form-state';
import { createProgramAction, receiveManualCarryAction, updateProgramAction } from './annual-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_ID = '22222222-2222-4222-8222-222222222222';
const SI_ID = '33333333-3333-4333-8333-333333333333';
const FISCAL_YEAR = 2027;

/** The row shape `loadProgram` selects, reduced to the fields the guards read. */
function programContext(status: 'draft' | 'active' | 'closed') {
  return {
    program: {
      id: PROGRAM_ID,
      annualPlanId: PLAN_ID,
      siId: SI_ID,
      prevProgramId: null,
      code: 'PRG-2027-01',
      name: 'Network renewal',
      capexBudget: 1_000_000_000,
      opexBudget: 200_000_000,
      carryInCapex: 0,
      carryInOpex: 0,
      notes: null,
      voidedAt: null,
      voidedReason: null,
    },
    annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status },
    strategicPlan: { id: 'sp-1', status: 'active' },
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

function database(...lookups: unknown[][]) {
  const select = vi.fn();
  for (const rows of lookups) select.mockReturnValueOnce(queryChain(rows));
  const transaction = vi.fn();
  return { select, transaction };
}

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
    id: PROGRAM_ID,
    code: 'PRG-2027-01',
    name: 'Network renewal',
    siId: SI_ID,
    prevProgramId: '',
    capexBudget: '1000000000',
    opexBudget: '200000000',
    carryInCapex: '0',
    carryInOpex: '0',
    notes: 'Scope clarified',
    reason: 'Scope clarified',
    ...overrides,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

function createForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    annualPlanId: PLAN_ID,
    code: 'PRG-2027-09',
    name: 'New workstream',
    siId: SI_ID,
    prevProgramId: '',
    capexBudget: '0',
    opexBudget: '0',
    carryInCapex: '0',
    carryInOpex: '0',
    notes: '',
    ...overrides,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({ id: 'user-1', email: 'owner@example.test', name: 'Owner' });
  mocks.readCustomFieldPayloadState.mockResolvedValue({ fields: [], values: {}, errors: {} });
  mocks.readCustomFieldValues.mockResolvedValue({});
  mocks.saveCustomFieldValues.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateProgramAction activation freeze', () => {
  it('refuses a budget change on an active plan and points at the revision flow', async () => {
    const db = database([programContext('active')], [{ annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status: 'active' }, strategicPlan: { id: 'sp-1', status: 'active' } }]);
    mocks.getDb.mockReturnValue(db);

    const state = await updateProgramAction(
      INITIAL,
      updateForm({ capexBudget: '1200000000' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/budget revision/i);
    // The refused submission keeps what the user typed.
    expect(state.values?.capexBudget).toBe('1200000000');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still lets non-amount fields change on an active plan', async () => {
    const db = database(
      [programContext('active')],
      [{ annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status: 'active' }, strategicPlan: { id: 'sp-1', status: 'active' } }],
      [{ id: SI_ID, planId: 'sp-1', voidedAt: null }],
    );
    const write = updateChain([{ ...programContext('active').program, name: 'Network renewal II' }]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateProgramAction(INITIAL, updateForm({ name: 'Network renewal II' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Network renewal II', capexBudget: 1_000_000_000 }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'update', entityType: 'annual_program', reason: 'Scope clarified' }),
    );
  });

  it('keeps budget edits while the plan is a draft', async () => {
    const db = database(
      [programContext('draft')],
      [{ annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status: 'draft' }, strategicPlan: { id: 'sp-1', status: 'active' } }],
      [{ id: SI_ID, planId: 'sp-1', voidedAt: null }],
    );
    const write = updateChain([{ ...programContext('draft').program, capexBudget: 1_200_000_000 }]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateProgramAction(INITIAL, updateForm({ capexBudget: '1200000000' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ capexBudget: 1_200_000_000 }),
    );
  });
});

describe('updateProgramAction component shift', () => {
  it('refuses a draft edit that lowers capex while raising opex', async () => {
    const db = database(
      [programContext('draft')],
      [
        {
          annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status: 'draft' },
          strategicPlan: { id: 'sp-1', status: 'active' },
        },
      ],
    );
    mocks.getDb.mockReturnValue(db);

    const state = await updateProgramAction(
      INITIAL,
      updateForm({ capexBudget: '900000000', opexBudget: '300000000' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/never shift/i);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe('createProgramAction activation freeze', () => {
  it('refuses a new program with a budget while the plan is active', async () => {
    const db = database([programContext('active')]);
    mocks.getDb.mockReturnValue(db);

    const state = await createProgramAction(INITIAL, createForm({ capexBudget: '500000000' }));

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/zero budget/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('accepts a new program starting at zero and funds it by revision later', async () => {
    const db = database([programContext('active')], [{ id: SI_ID, planId: 'sp-1', voidedAt: null }]);
    const duplicateCheck = queryChain([]);
    const insert = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            ...programContext('active').program,
            id: '44444444-4444-4444-8444-444444444444',
            code: 'PRG-2027-09',
            name: 'New workstream',
            capexBudget: 0,
            opexBudget: 0,
            notes: null,
            voidedAt: null,
          },
        ]),
      }),
    };
    const tx = {
      select: vi.fn().mockReturnValue(duplicateCheck),
      insert: vi.fn().mockReturnValue(insert),
    };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(createProgramAction(INITIAL, createForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ capexBudget: 0, opexBudget: 0 }),
    );
  });
});

describe('receiveManualCarryAction (#113, ADR-0006 §2)', () => {
  const ALLOCATION_ID = '66666666-6666-4666-8666-666666666666';

  function manualForm(overrides: Record<string, string> = {}): FormData {
    const values: Record<string, string> = {
      annualPlanId: PLAN_ID,
      entityType: 'program',
      entityId: PROGRAM_ID,
      component: 'capex',
      amount: '500',
      reason: 'Owner grant for the security programme',
      ...overrides,
    };
    const form = new FormData();
    for (const [name, value] of Object.entries(values)) form.set(name, value);
    return form;
  }

  function manualDatabase(options: {
    status?: 'draft' | 'active' | 'closed';
    entity?: Record<string, unknown>;
  } = {}) {
    const status = options.status ?? 'active';
    const db = database(
      [
        {
          annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status },
          strategicPlan: { id: 'sp-1', status: 'active' },
        },
      ],
      [
        options.entity ?? {
          id: PROGRAM_ID,
          annualPlanId: PLAN_ID,
          code: 'PRG-2027-01',
          voidedAt: null,
        },
      ],
    );
    const tx = {};
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    return { db, tx };
  }

  it('records a reasoned manual receipt and recomputes the cache from the ledger', async () => {
    const { db, tx } = manualDatabase();
    mocks.getDb.mockReturnValue(db);
    mocks.receiveCarry.mockResolvedValue({
      entry: { id: 'entry-1' },
      cache: { capex: 500, opex: 0 },
    });

    await expect(receiveManualCarryAction(INITIAL, manualForm())).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(mocks.receiveCarry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        origin: 'manual',
        targetAnnualPlanId: PLAN_ID,
        entityType: 'program',
        targetEntityId: PROGRAM_ID,
        component: 'capex',
        amount: 500,
        reason: 'Owner grant for the security programme',
        actorUserId: 'user-1',
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'carry_over',
        entityType: 'annual_program',
        entityId: PROGRAM_ID,
        reason: 'Owner grant for the security programme',
        after: expect.objectContaining({ origin: 'manual', component: 'capex', amount: 500 }),
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${PLAN_ID}`),
    );
  });

  it('records an allocation receipt against its target allocation', async () => {
    const { db, tx } = manualDatabase({
      entity: {
        id: ALLOCATION_ID,
        annualPlanId: PLAN_ID,
        projectCode: 'PRJ-2027-001',
        voidedAt: null,
      },
    });
    mocks.getDb.mockReturnValue(db);
    mocks.receiveCarry.mockResolvedValue({
      entry: { id: 'entry-2' },
      cache: { capex: 0, opex: 250 },
    });

    await expect(
      receiveManualCarryAction(
        INITIAL,
        manualForm({ entityType: 'allocation', entityId: ALLOCATION_ID, component: 'opex' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.receiveCarry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        origin: 'manual',
        entityType: 'allocation',
        targetEntityId: ALLOCATION_ID,
        component: 'opex',
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ entityType: 'project_year_allocation', entityId: ALLOCATION_ID }),
    );
  });

  it('refuses an entity that is not part of the annual plan', async () => {
    const { db } = manualDatabase({
      entity: {
        id: PROGRAM_ID,
        annualPlanId: '77777777-7777-4777-8777-777777777777',
        code: 'PRG-OTHER',
        voidedAt: null,
      },
    });
    mocks.getDb.mockReturnValue(db);

    const state = await receiveManualCarryAction(INITIAL, manualForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/not part of this annual plan/i);
    expect(mocks.receiveCarry).not.toHaveBeenCalled();
  });

  it('refuses a receipt on a closed year', async () => {
    const { db } = manualDatabase({ status: 'closed' });
    mocks.getDb.mockReturnValue(db);

    const state = await receiveManualCarryAction(INITIAL, manualForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/closed/i);
    expect(mocks.receiveCarry).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    mocks.getDb.mockReturnValue(database());

    const state = await receiveManualCarryAction(INITIAL, manualForm({ reason: '' }));

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.reason).toMatch(/required/i);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
