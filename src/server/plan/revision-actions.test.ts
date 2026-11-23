import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for budget revisions (#112, ADR-0006 §4). The domain
 * rules have their own unit tests; this file proves the action boundary: only
 * an active plan accepts a revision, the per-plan number is assigned inside the
 * transaction, header and lines are written together with one audit entry, and
 * a refused switch never opens the write transaction.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  recordAudit: vi.fn(),
  getRevisionContext: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/plan/revision-queries', () => ({
  getRevisionContext: mocks.getRevisionContext,
}));

import type { FormState } from '@/lib/form-state';
import {
  revisionProgramFieldName,
  revisionAllocationFieldName,
} from '@/lib/revision-form';
import { createRevisionAction, recordRevisionDecisionAction } from './revision-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_A = '22222222-2222-4222-8222-222222222222';
const PROGRAM_B = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const FISCAL_YEAR = 2027;

function planRow(status: 'draft' | 'active' | 'closed', strategicStatus = 'active') {
  return {
    annualPlan: { id: PLAN_ID, fiscalYear: FISCAL_YEAR, status, planId: 'sp-1' },
    strategicPlan: { id: 'sp-1', status: strategicStatus },
  };
}

/** PRG-A has 600.000 unallocated; a 400.000 switch out of it is allowed. */
function revisionContext() {
  return {
    programs: [
      {
        programId: PROGRAM_A,
        code: 'PRG-A',
        name: 'Programme A',
        capexBudget: 1_000_000,
        opexBudget: 0,
        carryInCapex: 0,
        carryInOpex: 0,
        allocatedCapex: 400_000,
        allocatedOpex: 0,
      },
      {
        programId: PROGRAM_B,
        code: 'PRG-B',
        name: 'Programme B',
        capexBudget: 0,
        opexBudget: 0,
        carryInCapex: 0,
        carryInOpex: 0,
        allocatedCapex: 0,
        allocatedOpex: 0,
      },
    ],
    allocations: [],
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
    orderBy: vi.fn(),
    groupBy: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.groupBy.mockResolvedValue(rows);
  return chain;
}

function database(...lookups: unknown[][]) {
  const select = vi.fn();
  for (const rows of lookups) select.mockReturnValueOnce(queryChain(rows));
  const transaction = vi.fn();
  return { select, transaction };
}

/** `insert(...).values(...)` awaited directly (the lines). */
function plainInsert() {
  const values = vi.fn().mockResolvedValue(undefined);
  return { values };
}

/** `insert(...).values(...).returning()` (the header). */
function returningInsert(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row]);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function revisionForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    annualPlanId: PLAN_ID,
    revisionDate: '2027-03-15',
    decisionReference: 'SC-2027-04',
    reason: 'Steering committee switch',
    [revisionProgramFieldName(PROGRAM_A, 'capex')]: '-400000',
    [revisionProgramFieldName(PROGRAM_B, 'capex')]: '400000',
    ...overrides,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
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
  mocks.getRevisionContext.mockResolvedValue(revisionContext());
  // A real redirect throws; the action never returns after `finishWith`.
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function postableDatabase(options: { number?: string } = {}) {
  const headerRow = {
    id: REVISION_ID,
    annualPlanId: PLAN_ID,
    number: 1,
    revisionDate: '2027-03-15',
    decisionReference: 'SC-2027-04',
    reason: 'Steering committee switch',
  };
  const maxChain = queryChain([{ max: options.number ?? '0' }]);
  const header = returningInsert(headerRow);
  const lines = plainInsert();
  const insert = vi
    .fn()
    .mockReturnValueOnce({ values: header.values })
    .mockReturnValueOnce({ values: lines.values });
  const tx = { select: vi.fn().mockReturnValue(maxChain), insert };
  const db = database([planRow('active')]);
  db.transaction.mockImplementation(
    async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
  );
  return { db, tx, maxChain, insert, header, lines };
}

describe('createRevisionAction', () => {
  it('refuses a draft plan: revisions exist only for an active year', async () => {
    const db = database([planRow('draft')]);
    mocks.getDb.mockReturnValue(db);

    const state = await createRevisionAction(INITIAL, revisionForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/active/i);
    expect(state.values?.reason).toBe('Steering committee switch');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('refuses a closed year', async () => {
    const db = database([planRow('closed')]);
    mocks.getDb.mockReturnValue(db);

    const state = await createRevisionAction(INITIAL, revisionForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/closed/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses an unbalanced switch with the message on the line inputs', async () => {
    const db = database([planRow('active')]);
    mocks.getDb.mockReturnValue(db);

    const state = await createRevisionAction(
      INITIAL,
      revisionForm({ [revisionProgramFieldName(PROGRAM_B, 'capex')]: '250000' }),
    );

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.[revisionProgramFieldName(PROGRAM_A, 'capex')]).toMatch(/balance/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a switch above the donor program unallocated budget', async () => {
    const db = database([planRow('active')]);
    mocks.getDb.mockReturnValue(db);
    mocks.getRevisionContext.mockResolvedValue({
      ...revisionContext(),
      programs: [
        { ...revisionContext().programs[0], allocatedCapex: 1_000_000 },
        revisionContext().programs[1],
      ],
    });

    const state = await createRevisionAction(INITIAL, revisionForm());

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.[revisionProgramFieldName(PROGRAM_A, 'capex')]).toMatch(/unallocated/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a line that names a program outside the annual plan', async () => {
    const db = database([planRow('active')]);
    mocks.getDb.mockReturnValue(db);
    const unknownField = 'program_99999999-9999-4999-8999-999999999999_capex';

    const state = await createRevisionAction(
      INITIAL,
      revisionForm({
        [revisionProgramFieldName(PROGRAM_B, 'capex')]: '',
        [unknownField]: '400000',
      }),
    );

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.[unknownField]).toMatch(/not part of the annual plan/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('posts the header and its lines in one transaction with the next plan number', async () => {
    const { db, header, lines, maxChain, tx } = postableDatabase({ number: '4' });
    mocks.getDb.mockReturnValue(db);

    await expect(createRevisionAction(INITIAL, revisionForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(maxChain.where).toHaveBeenCalledTimes(1);
    expect(header.values).toHaveBeenCalledWith(
      expect.objectContaining({
        annualPlanId: PLAN_ID,
        number: 5,
        revisionDate: '2027-03-15',
        decisionReference: 'SC-2027-04',
        reason: 'Steering committee switch',
        createdBy: 'user-1',
      }),
    );
    expect(lines.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          revisionId: REVISION_ID,
          entityType: 'program',
          entityId: PROGRAM_A,
          component: 'capex',
          delta: -400_000,
        }),
        expect.objectContaining({
          revisionId: REVISION_ID,
          entityType: 'program',
          entityId: PROGRAM_B,
          component: 'capex',
          delta: 400_000,
        }),
      ]),
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'revision_post',
        entityType: 'budget_revision',
        entityId: REVISION_ID,
        reason: 'Steering committee switch',
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${PLAN_ID}/revisions`),
    );
  });

  it('posts a revision without a decision reference as awaiting the decision', async () => {
    const headerRow = {
      id: REVISION_ID,
      annualPlanId: PLAN_ID,
      number: 1,
      revisionDate: '2027-03-15',
      decisionReference: null,
      reason: 'Annual efficiency cut',
    };
    const maxChain = queryChain([{ max: '0' }]);
    const header = returningInsert(headerRow);
    const lines = plainInsert();
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: header.values })
      .mockReturnValueOnce({ values: lines.values });
    const tx = { select: vi.fn().mockReturnValue(maxChain), insert };
    const db = database([planRow('active')]);
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      createRevisionAction(
        INITIAL,
        revisionForm({
          decisionReference: '',
          [revisionProgramFieldName(PROGRAM_A, 'capex')]: '-400000',
          [revisionProgramFieldName(PROGRAM_B, 'capex')]: '',
          [revisionAllocationFieldName('55555555-5555-4555-8555-555555555555', 'capex')]: '',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(header.values).toHaveBeenCalledWith(
      expect.objectContaining({ decisionReference: null }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: expect.objectContaining({ awaitingDecision: true }) }),
    );
  });
});

describe('recordRevisionDecisionAction', () => {
  function decisionForm(overrides: Record<string, string> = {}): FormData {
    const values: Record<string, string> = {
      id: REVISION_ID,
      decisionReference: 'SC-2027-11',
      reason: 'Steering committee decision received',
      ...overrides,
    };
    const form = new FormData();
    for (const [name, value] of Object.entries(values)) form.set(name, value);
    return form;
  }

  function decisionDatabase(decisionReference: string | null) {
    const revisionRow = {
      id: REVISION_ID,
      annualPlanId: PLAN_ID,
      number: 3,
      revisionDate: '2027-03-15',
      decisionReference,
      reason: 'Annual efficiency cut',
    };
    const db = database([
      { revision: revisionRow, fiscalYear: FISCAL_YEAR },
    ]);
    const updateChain = {
      set: vi.fn(),
      where: vi.fn(),
      returning: vi.fn().mockResolvedValue([
        { ...revisionRow, decisionReference: 'SC-2027-11', decidedAt: new Date() },
      ]),
    };
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    const tx = { update: vi.fn().mockReturnValue(updateChain) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    return { db, tx, updateChain };
  }

  it('attaches the decision reference as metadata and audits it', async () => {
    const { db, tx, updateChain } = decisionDatabase(null);
    mocks.getDb.mockReturnValue(db);

    await expect(
      recordRevisionDecisionAction(INITIAL, decisionForm()),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionReference: 'SC-2027-11',
        decidedBy: 'user-1',
      }),
    );
    // Lines and deltas are already frozen: the only write is the header.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'revision_decision',
        entityType: 'budget_revision',
        entityId: REVISION_ID,
        reason: 'Steering committee decision received',
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${PLAN_ID}/revisions`),
    );
  });

  it('refuses to record a decision twice', async () => {
    const { db } = decisionDatabase('SC-2027-04');
    mocks.getDb.mockReturnValue(db);

    const state = await recordRevisionDecisionAction(INITIAL, decisionForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/already/i);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
