import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for strategic plan succession (#109, ADR-0008). They sit
 * at the action boundary: a successor may only be created once every existing
 * plan is archived, its horizon starts after the archived horizons, archiving
 * needs every annual plan closed, activation needs the slot free, and a horizon
 * edit may not orphan an annual plan or a project. The database is mocked at the
 * module boundary, the way the other server-action tests do it.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  getStrategicPlan: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('./queries', () => ({ getStrategicPlan: mocks.getStrategicPlan }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));

import type { FormState } from '@/lib/form-state';
import {
  activatePlanAction,
  archivePlanAction,
  createPlanAction,
  updatePlanAction,
} from './actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const REASON = 'Board decision 12/2026';

interface PlanRow {
  name: string;
  startFiscalYear: number;
  endFiscalYear: number;
  status: 'draft' | 'active' | 'archived';
}

const CURRENT_PLAN: PlanRow = {
  name: 'IT Strategic Plan 2026–2030',
  startFiscalYear: 2026,
  endFiscalYear: 2030,
  status: 'active',
};

/**
 * A select builder whose every step chains and which itself resolves to the
 * given rows: the actions await both `select().from(...)` and the longer
 * `...where(...).limit(...)` shapes.
 */
function selectChain(rows: unknown[]) {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  for (const step of ['select', 'from', 'innerJoin', 'where', 'orderBy', 'limit'] as const) {
    chain[step].mockReturnValue(chain);
  }
  return chain;
}

function insertChain(rows: unknown[]) {
  const chain = { values: vi.fn(), returning: vi.fn().mockResolvedValue(rows) };
  chain.values.mockReturnValue(chain);
  return chain;
}

function updateChain(rows: unknown[]) {
  const chain = { set: vi.fn(), where: vi.fn(), returning: vi.fn().mockResolvedValue(rows) };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

/**
 * A transaction executor whose selects answer in call order, plus the write
 * builders the action under test constructs.
 */
function database(selects: unknown[][]) {
  let index = 0;
  const tx = {
    select: vi.fn(() => selectChain(selects[index++] ?? [])),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<void>) => callback(tx)),
  };
  return { db, tx };
}

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return { ...CURRENT_PLAN, ...overrides };
}

function planCreateForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    name: 'IT Strategic Plan 2031–2035',
    startFiscalYear: '2031',
    endFiscalYear: '2035',
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function planUpdateForm(overrides: Record<string, string> = {}): FormData {
  const form = planCreateForm({
    startFiscalYear: '2026',
    endFiscalYear: '2030',
    reason: REASON,
    ...overrides,
  });
  form.set('id', PLAN_ID);
  return form;
}

function planStatusForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = { id: PLAN_ID, reason: REASON, ...overrides };
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
    ...CURRENT_PLAN,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPlanAction — succession', () => {
  it('refuses a second plan while one is active', async () => {
    const { db, tx } = database([[planRow()]]);
    mocks.getDb.mockReturnValue(db);

    const state = await createPlanAction(INITIAL, planCreateForm());

    expect(state.status).toBe('error');
    expect(state.message).toContain(
      'The strategic plan “IT Strategic Plan 2026–2030” is still active. Archive it before creating a successor plan.',
    );
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('refuses a draft plan too: only an archived plan frees the slot', async () => {
    const { db, tx } = database([[planRow({ status: 'draft' })]]);
    mocks.getDb.mockReturnValue(db);

    const state = await createPlanAction(INITIAL, planCreateForm());

    expect(state.status).toBe('error');
    expect(state.message).toContain('is still draft');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('refuses a successor horizon that overlaps the archived plan', async () => {
    const { db, tx } = database([[planRow({ status: 'archived' })]]);
    mocks.getDb.mockReturnValue(db);

    const state = await createPlanAction(INITIAL, planCreateForm({ startFiscalYear: '2030' }));

    expect(state.status).toBe('error');
    expect(state.message).toContain(
      'The successor plan must start after FY2030, the end of “IT Strategic Plan 2026–2030”.',
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('creates a draft successor after the archived horizon and audits it', async () => {
    const created = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'IT Strategic Plan 2031–2035',
      startFiscalYear: 2031,
      endFiscalYear: 2035,
      status: 'draft',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { db, tx } = database([[planRow({ status: 'archived' })]]);
    tx.insert.mockReturnValue(insertChain([created]));
    mocks.getDb.mockReturnValue(db);

    await expect(createPlanAction(INITIAL, planCreateForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'create',
        entityType: 'strategic_plan',
        entityId: created.id,
        after: expect.objectContaining({ status: 'draft', startFiscalYear: 2031 }),
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining('message=Strategic%20plan%20%E2%80%9CIT%20Strategic%20Plan%202031%E2%80%932035%E2%80%9D%20created.'),
    );
  });
});

describe('archivePlanAction — every annual plan closed', () => {
  it('refuses while an annual plan is open and names the year', async () => {
    const { db, tx } = database([
      [
        { fiscalYear: 2029, status: 'active' },
        { fiscalYear: 2027, status: 'closed' },
        { fiscalYear: 2028, status: 'draft' },
      ],
    ]);
    mocks.getDb.mockReturnValue(db);

    const state = await archivePlanAction(INITIAL, planStatusForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      'Every annual plan must be closed before the strategic plan is archived: FY2028 is still draft.',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('archives the plan once every annual plan is closed', async () => {
    const archived = { ...CURRENT_PLAN, status: 'archived' as const };
    const { db, tx } = database([[{ fiscalYear: 2027, status: 'closed' }]]);
    const write = updateChain([
      {
        id: PLAN_ID,
        name: archived.name,
        startFiscalYear: archived.startFiscalYear,
        endFiscalYear: archived.endFiscalYear,
        status: 'archived',
        createdBy: null,
        updatedBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    tx.update.mockReturnValue(write);
    mocks.getDb.mockReturnValue(db);

    await expect(archivePlanAction(INITIAL, planStatusForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'status_change',
        entityType: 'strategic_plan',
        entityId: PLAN_ID,
        reason: REASON,
        after: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });

  it('lets a draft plan be archived: it has no annual plans to close', async () => {
    mocks.getStrategicPlan.mockResolvedValue({
      id: PLAN_ID,
      ...CURRENT_PLAN,
      status: 'draft',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { db, tx } = database([[]]);
    tx.update.mockReturnValue(
      updateChain([
        {
          id: PLAN_ID,
          name: CURRENT_PLAN.name,
          startFiscalYear: CURRENT_PLAN.startFiscalYear,
          endFiscalYear: CURRENT_PLAN.endFiscalYear,
          status: 'archived',
          createdBy: null,
          updatedBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(archivePlanAction(INITIAL, planStatusForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});

describe('activatePlanAction — one active plan', () => {
  it('refuses while another plan is active', async () => {
    mocks.getStrategicPlan.mockResolvedValue({
      id: PLAN_ID,
      ...CURRENT_PLAN,
      status: 'draft',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { db, tx } = database([[{ id: 'other-plan' }]]);
    mocks.getDb.mockReturnValue(db);

    const state = await activatePlanAction(INITIAL, planStatusForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      'Another strategic plan is active. Archive it before activating this one.',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('activates the plan when the slot is free', async () => {
    mocks.getStrategicPlan.mockResolvedValue({
      id: PLAN_ID,
      ...CURRENT_PLAN,
      status: 'draft',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { db, tx } = database([[]]);
    tx.update.mockReturnValue(
      updateChain([
        {
          id: PLAN_ID,
          name: CURRENT_PLAN.name,
          startFiscalYear: CURRENT_PLAN.startFiscalYear,
          endFiscalYear: CURRENT_PLAN.endFiscalYear,
          status: 'active',
          createdBy: null,
          updatedBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(activatePlanAction(INITIAL, planStatusForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});

describe('updatePlanAction — horizon containment', () => {
  it('refuses a horizon that excludes an annual plan and names the year', async () => {
    const { db, tx } = database([[{ fiscalYear: 2030 }], []]);
    mocks.getDb.mockReturnValue(db);

    const state = await updatePlanAction(INITIAL, planUpdateForm({ endFiscalYear: '2029' }));

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      'The new horizon excludes the FY2030 annual plan. An annual plan must stay inside the plan horizon.',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('refuses a horizon that excludes a project full-life year and names the project', async () => {
    const { db, tx } = database([
      [],
      [{ code: 'PRJ-2027-001', startFiscalYear: 2027, endFiscalYear: 2029 }],
    ]);
    mocks.getDb.mockReturnValue(db);

    const state = await updatePlanAction(INITIAL, planUpdateForm({ startFiscalYear: '2028' }));

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      "The new horizon excludes project PRJ-2027-001 (FY2027–FY2029). A project's full-life years must stay inside the plan horizon.",
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('saves a horizon that contains every annual plan and project, and audits it', async () => {
    const { db, tx } = database([
      [{ fiscalYear: 2027 }],
      [{ code: 'PRJ-2027-001', startFiscalYear: 2027, endFiscalYear: 2028 }],
    ]);
    tx.update.mockReturnValue(
      updateChain([
        {
          id: PLAN_ID,
          name: CURRENT_PLAN.name,
          startFiscalYear: 2027,
          endFiscalYear: 2030,
          status: 'active',
          createdBy: null,
          updatedBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      updatePlanAction(INITIAL, planUpdateForm({ startFiscalYear: '2027' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'update',
        entityType: 'strategic_plan',
        entityId: PLAN_ID,
        reason: REASON,
        after: expect.objectContaining({ startFiscalYear: 2027 }),
      }),
    );
  });

  it('refuses every edit of an archived plan', async () => {
    mocks.getStrategicPlan.mockResolvedValue({
      id: PLAN_ID,
      ...CURRENT_PLAN,
      status: 'archived',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { db, tx } = database([]);
    mocks.getDb.mockReturnValue(db);

    const state = await updatePlanAction(INITIAL, planUpdateForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('This strategic plan is archived and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('updatePlanAction — succession boundaries', () => {
  it('refuses an edit that moves the start year back over the archived plan', async () => {
    // The draft successor is the only editable plan; its horizon may not start
    // before the archived plan's end (#109 §3: horizons never overlap).
    mocks.getStrategicPlan.mockResolvedValue({
      id: PLAN_ID,
      name: 'IT Strategic Plan 2031–2035',
      startFiscalYear: 2031,
      endFiscalYear: 2035,
      status: 'draft',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { db, tx } = database([
      [],
      [],
      [planRow({ status: 'archived' })],
      [],
    ]);
    mocks.getDb.mockReturnValue(db);

    const state = await updatePlanAction(
      INITIAL,
      planUpdateForm({ name: 'IT Strategic Plan 2031–2035', startFiscalYear: '2030', endFiscalYear: '2035' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toContain(
      'The successor plan must start after FY2030, the end of “IT Strategic Plan 2026–2030”.',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('refuses moving the start year once the opening balances are signed off', async () => {
    // The prior year of the opening-balance bridge is derived from the start
    // year, so a signed-off plan cannot move it (#109 §7).
    const { db, tx } = database([
      [{ fiscalYear: 2027 }],
      [],
      [],
      [{ signedOffAt: new Date('2026-11-01T00:00:00Z') }],
    ]);
    mocks.getDb.mockReturnValue(db);

    const state = await updatePlanAction(INITIAL, planUpdateForm({ startFiscalYear: '2027' }));

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      'The opening balances for FY2026 are signed off, so the start fiscal year cannot move. Shrink the plan horizon from the end year instead.',
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('allows the end year to shrink while the start year stays put', async () => {
    const { db, tx } = database([[{ fiscalYear: 2027 }], [], [], [{ signedOffAt: new Date() }]]);
    tx.update.mockReturnValue(
      updateChain([
        {
          id: PLAN_ID,
          name: CURRENT_PLAN.name,
          startFiscalYear: 2026,
          endFiscalYear: 2028,
          status: 'active',
          createdBy: null,
          updatedBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(
      updatePlanAction(INITIAL, planUpdateForm({ endFiscalYear: '2028' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});
