import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the year close (#113, ADR-0006 §3). The state and the
 * database are mocked at the module boundary; the tests pin what the close does
 * with a submitted form: guard the typed phrase and every carry field, record a
 * snapshot row per entity and component (zero carry included), write ledger
 * receipts of origin `close`, recompute the carry cache from the ledger sum, and
 * refuse to finish when the snapshot and the ledger disagree.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getCloseState: vi.fn(),
  getDb: vi.fn(),
  recordAudit: vi.fn(),
  listReceiptEntriesForEntities: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('./close-queries', () => ({ getCloseState: mocks.getCloseState }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('./carry-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./carry-queries')>();
  return {
    ...actual,
    listReceiptEntriesForEntities: mocks.listReceiptEntriesForEntities,
  };
});

import {
  annualPlans,
  annualPrograms,
  carryOverEntries,
  closeSnapshots,
  projectYearAllocations,
} from '@/db/schema';
import type { FormState } from '@/lib/form-state';
import { finalCloseReason } from '@/lib/close-form';
import type { CloseState } from './close-queries';
import { closeFiscalYearAction } from './close-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const PROGRAM_ID = '33333333-3333-4333-8333-333333333333';
const CONTINUATION_ID = '44444444-4444-4444-8444-444444444444';
const ZERO_PROGRAM_ID = '55555555-5555-4555-8555-555555555555';

function programRow(overrides: Record<string, unknown> = {}) {
  return {
    program: {
      id: PROGRAM_ID,
      code: 'PRG-01',
      name: 'Platform',
      siId: 'si-1',
      annualPlanId: PLAN_ID,
      capexBudget: 1_000,
      opexBudget: 500,
      carryInCapex: 0,
      carryInOpex: 0,
      voidedAt: null,
    },
    availableCapex: 700,
    availableOpex: 300,
    allocatedCapex: 300,
    allocatedOpex: 200,
    unallocatedCapex: 700,
    unallocatedOpex: 300,
    continuationProgramId: CONTINUATION_ID,
    targetProgramIds: [CONTINUATION_ID],
    targetPrograms: [{ value: CONTINUATION_ID, label: 'PRG-02 · Platform 2028 (FY2028)' }],
    ...overrides,
  };
}

function closeState(overrides: Record<string, unknown> = {}): CloseState {
  return {
    plan: { id: PLAN_ID, fiscalYear: 2027, status: 'active' },
    strategicPlan: { status: 'active' },
    targetPlan: { id: TARGET_PLAN_ID, fiscalYear: 2028, status: 'active' },
    programs: [programRow()],
    allocations: [],
    carryOvers: [],
    snapshots: [],
    carriedTotals: { program: { capex: 0, opex: 0 }, allocation: { capex: 0, opex: 0 } },
    totalCarryCapex: 0,
    totalCarryOpex: 0,
    ...overrides,
  } as unknown as CloseState;
}

function closeForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

const BASE_FORM = {
  annualPlanId: PLAN_ID,
  reference: 'Board memo 12/2027',
  confirmation: 'CLOSE FY2027',
};

function carryForm(overrides: Record<string, string> = {}): FormData {
  return closeForm({
    ...BASE_FORM,
    [`carry_program_${PROGRAM_ID}_capex`]: '700',
    [`carry_program_${PROGRAM_ID}_opex`]: '300',
    ...overrides,
  });
}

async function runAction(form: FormData): Promise<FormState> {
  return closeFiscalYearAction(INITIAL, form);
}

interface Recorded {
  table: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
}

interface TxOptions {
  /** Rows returned for a ledger-sum select (`component` + `total`). */
  ledgerSums?: Array<{ component: string; total: string }>;
  /** Override the close-invariant read-back (to prove a mismatch is caught). */
  summarize?: Array<{
    entityType: string;
    sourceEntityId: string;
    component: string;
    total: string;
  }>;
  /** Rows returned by the no-column read `appendCarryEntry` uses for lineage. */
  lineageRows?: Array<Record<string, unknown>>;
}

/**
 * A Drizzle-shaped transaction. Inserts and updates are recorded, and the
 * select chains answer by the column set the caller asked for: cache sums,
 * the close summary (derived from what was inserted, so the invariant sees the
 * truth), or the cache row.
 */
function transactionHarness(options: TxOptions = {}) {
  const inserts: Recorded[] = [];
  const updates: Recorded[] = [];
  let entrySequence = 0;

  function summarizeFromInserts() {
    if (options.summarize) return options.summarize;
    const totals = new Map<string, number>();
    for (const insert of inserts) {
      if (insert.table !== carryOverEntries || !insert.values) continue;
      const key = `${insert.values.entityType}:${insert.values.sourceEntityId}:${insert.values.component}`;
      totals.set(key, (totals.get(key) ?? 0) + Number(insert.values.amount ?? 0));
    }
    return [...totals.entries()].map(([key, total]) => {
      const [entityType, sourceEntityId, component] = key.split(':');
      return { entityType, sourceEntityId, component, total: String(total) };
    });
  }

  const select = vi.fn((columns?: Record<string, unknown>) => {
    let rows: unknown[] = [];
    if (columns && 'carryInCapex' in columns) {
      const capex = options.ledgerSums?.find((row) => row.component === 'capex');
      const opex = options.ledgerSums?.find((row) => row.component === 'opex');
      rows = [{ carryInCapex: Number(capex?.total ?? 0), carryInOpex: Number(opex?.total ?? 0) }];
    } else if (columns && 'sourceEntityId' in columns) {
      rows = summarizeFromInserts();
    } else if (columns && 'total' in columns) {
      rows = options.ledgerSums ?? [];
    } else if (!columns && options.lineageRows) {
      rows = options.lineageRows;
    }
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn().mockResolvedValue(rows),
      limit: vi.fn().mockResolvedValue(rows),
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const record: Recorded = { table };
    inserts.push(record);
    return {
      values: vi.fn((values: Record<string, unknown>) => {
        record.values = values;
        const row =
          table === carryOverEntries
            ? { id: `entry-${++entrySequence}`, ...values }
            : table === projectYearAllocations
              ? { id: 'new-allocation-id', ...values }
              : { id: 'row-1', ...values };
        const thenable = {
          returning: vi.fn().mockResolvedValue([row]),
          then: (resolve: (value: unknown) => void) => resolve(undefined),
        };
        return thenable;
      }),
    };
  });

  const update = vi.fn((table: unknown) => {
    const record: Recorded = { table };
    updates.push(record);
    const chain = {
      set: vi.fn((set: Record<string, unknown>) => {
        record.set = set;
        return chain;
      }),
      where: vi.fn(() => chain),
      returning: vi.fn().mockResolvedValue([
        table === annualPlans
          ? { id: PLAN_ID, fiscalYear: 2027, status: 'closed' }
          : table === annualPrograms
            ? { id: PROGRAM_ID }
            : { id: 'allocation-1' },
      ]),
    };
    return chain;
  });

  return { tx: { select, insert, update }, inserts, updates };
}

/** The pre-close read of existing receipts: a chain that resolves to none. */
function receiptsSelect() {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function postableDatabase(options: TxOptions = {}) {
  const harness = transactionHarness(options);
  const transaction = vi.fn(
    async (callback: (tx: typeof harness.tx) => Promise<void>) => callback(harness.tx),
  );
  mocks.getDb.mockReturnValue({ transaction, select: vi.fn(receiptsSelect) });
  return { ...harness, transaction };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({ id: 'user-1', email: 'owner@example.test', name: 'Owner' });
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.listReceiptEntriesForEntities.mockResolvedValue([]);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('closeFiscalYearAction guards', () => {
  it('rejects a wrong typed confirmation before any database work', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(carryForm({ confirmation: 'CLOSE FY2026' }));

    expect(state.status).toBe('error');
    expect(state.message).toContain('Type "CLOSE FY2027" exactly to confirm the close.');
    expect(state.values?.reference).toBe('Board memo 12/2027');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('returns a field error when the typed confirmation is blank', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(carryForm({ confirmation: '' }));

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.confirmation).toContain('Type the close confirmation phrase');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects a blank carry-over field even when the phrase is right', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(carryForm({ [`carry_program_${PROGRAM_ID}_capex`]: '' }));

    expect(state.status).toBe('error');
    expect(state.message).toContain('PRG-01 capex carry-over is required (use 0 for none).');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('requires a reason for the part that is not carried', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(carryForm({ [`carry_program_${PROGRAM_ID}_capex`]: '400' }));

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/PRG-01.*reason/i);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('refuses a carried amount with no explicit target on a discontinued program', async () => {
    mocks.getCloseState.mockResolvedValue(
      closeState({
        programs: [
          programRow({ continuationProgramId: null, targetProgramIds: ['program-9'] }),
        ],
      }),
    );

    const state = await runAction(carryForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/target program/i);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('lets explicit zeros with reasons reach the close transaction', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('stop after the guards'));
    mocks.getDb.mockReturnValue({ transaction, select: vi.fn(receiptsSelect) });
    mocks.getCloseState.mockResolvedValue(closeState());

    await expect(
      runAction(
        carryForm({
          [`carry_program_${PROGRAM_ID}_capex`]: '0',
          [`carry_program_${PROGRAM_ID}_opex`]: '0',
          [`not_carried_reason_program_${PROGRAM_ID}`]: 'No approved use in the target year',
        }),
      ),
    ).rejects.toThrow('stop after the guards');

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('closeFiscalYearAction close writes', () => {
  it('records a snapshot per entity and component and a close receipt per carried amount', async () => {
    const zeroProgram = programRow({
      program: { ...programRow().program, id: ZERO_PROGRAM_ID, code: 'PRG-03', name: 'Zero carry' },
      availableCapex: 100,
      availableOpex: 0,
      continuationProgramId: CONTINUATION_ID,
    });
    mocks.getCloseState.mockResolvedValue(
      closeState({ programs: [programRow(), zeroProgram] }),
    );
    const { inserts, updates, transaction } = postableDatabase({
      ledgerSums: [
        { component: 'capex', total: '700' },
        { component: 'opex', total: '300' },
      ],
    });

    await expect(
      runAction(
        carryForm({
          [`carry_program_${ZERO_PROGRAM_ID}_capex`]: '0',
          [`carry_program_${ZERO_PROGRAM_ID}_opex`]: '0',
          [`not_carried_reason_program_${ZERO_PROGRAM_ID}`]: 'No approved use in the target year',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(transaction).toHaveBeenCalledTimes(1);

    const entries = inserts.filter((row) => row.table === carryOverEntries);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.values).toEqual(
      expect.objectContaining({
        origin: 'close',
        sourceAnnualPlanId: PLAN_ID,
        sourceEntityId: PROGRAM_ID,
        targetAnnualPlanId: TARGET_PLAN_ID,
        entityType: 'program',
        targetEntityId: CONTINUATION_ID,
        component: 'capex',
        amount: 700,
        approvalReference: 'Board memo 12/2027',
        createdBy: 'user-1',
      }),
    );
    expect(entries[0]?.values?.reason).toMatch(/Carried into FY2028/);

    const snapshots = inserts.filter((row) => row.table === closeSnapshots);
    // Two programs: four component rows, the zero-carry program included.
    expect(snapshots).toHaveLength(4);
    expect(snapshots.map((row) => row.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: PROGRAM_ID,
          component: 'capex',
          available: 700,
          carried: 700,
          notCarried: 0,
          notCarriedReason: '',
        }),
        expect.objectContaining({
          entityId: ZERO_PROGRAM_ID,
          component: 'capex',
          available: 100,
          carried: 0,
          notCarried: 100,
          notCarriedReason: 'No approved use in the target year',
        }),
        expect.objectContaining({
          entityId: ZERO_PROGRAM_ID,
          component: 'opex',
          available: 0,
          carried: 0,
          notCarried: 0,
          notCarriedReason: '',
        }),
      ]),
    );

    // The cache is written from the ledger sum, never incremented.
    const cacheUpdate = updates.find(
      (row) => row.table === annualPrograms && row.set && 'carryInCapex' in row.set,
    );
    expect(cacheUpdate?.set).toEqual(
      expect.objectContaining({ carryInCapex: 700, carryInOpex: 300, updatedBy: 'user-1' }),
    );

    const closeUpdate = updates.find((row) => row.table === annualPlans);
    expect(closeUpdate?.set).toEqual(
      expect.objectContaining({ status: 'closed', closeReference: 'Board memo 12/2027' }),
    );

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'close', entityType: 'annual_plan', entityId: PLAN_ID }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${PLAN_ID}`),
    );
  });

  it('carries into an explicitly chosen same-initiative target when discontinued', async () => {
    const OTHER_ID = '66666666-6666-4666-8666-666666666666';
    mocks.getCloseState.mockResolvedValue(
      closeState({
        programs: [programRow({ continuationProgramId: null, targetProgramIds: [OTHER_ID] })],
      }),
    );
    const { inserts } = postableDatabase({
      ledgerSums: [
        { component: 'capex', total: '700' },
        { component: 'opex', total: '300' },
      ],
    });

    await expect(
      runAction(carryForm({ [`target_program_${PROGRAM_ID}`]: OTHER_ID })),
    ).rejects.toThrow('NEXT_REDIRECT');

    const entries = inserts.filter((row) => row.table === carryOverEntries);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.values).toEqual(expect.objectContaining({ targetEntityId: OTHER_ID }));
  });

  it('records one-hop lineage when a single receipt funded the source entity', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());
    const priorReceipt = {
      id: 'prior-receipt',
      origin: 'opening',
      sourceAnnualPlanId: null,
      sourceEntityId: null,
      targetAnnualPlanId: PLAN_ID,
      entityType: 'program',
      targetEntityId: PROGRAM_ID,
      component: 'capex',
      amount: 700,
      reason: 'Opening balance migration',
      approvalReference: null,
      sourceEntryId: null,
      createdBy: null,
      createdAt: new Date(),
    };
    mocks.listReceiptEntriesForEntities.mockResolvedValue([priorReceipt]);
    const { inserts } = postableDatabase({
      ledgerSums: [
        { component: 'capex', total: '700' },
        { component: 'opex', total: '300' },
      ],
      lineageRows: [priorReceipt],
    });

    await expect(runAction(carryForm())).rejects.toThrow('NEXT_REDIRECT');

    const entries = inserts.filter((row) => row.table === carryOverEntries);
    const capexEntry = entries.find((row) => row.values?.component === 'capex');
    expect(capexEntry?.values?.sourceEntryId).toBe('prior-receipt');
    const opexEntry = entries.find((row) => row.values?.component === 'opex');
    expect(opexEntry?.values?.sourceEntryId).toBeNull();
  });

  it('rolls the close back when the snapshot and the ledger disagree', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());
    postableDatabase({
      ledgerSums: [
        { component: 'capex', total: '700' },
        { component: 'opex', total: '300' },
      ],
      // Simulate a ledger that wrote less than the snapshot claims.
      summarize: [
        { entityType: 'program', sourceEntityId: PROGRAM_ID, component: 'capex', total: '690' },
        { entityType: 'program', sourceEntityId: PROGRAM_ID, component: 'opex', total: '300' },
      ],
    });

    const state = await runAction(carryForm());

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/could not be recorded/i);
    expect(state.message).toMatch(/capex/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('closeFiscalYearAction final close', () => {
  // The end year of the strategic plan: no next-year target exists, and the
  // close must not need one (#109).
  const FINAL_STATE = {
    isFinalClose: true,
    targetPlan: null,
    strategicPlan: { status: 'active', endFiscalYear: 2027 },
  };

  it('closes the end year without a target plan, writing zero carry and the fixed reason', async () => {
    mocks.getCloseState.mockResolvedValue(closeState(FINAL_STATE));
    const { inserts, updates } = postableDatabase();

    await expect(runAction(closeForm(BASE_FORM))).rejects.toThrow('NEXT_REDIRECT');

    // Nothing crosses the plan boundary: no ledger receipt and no target allocation.
    expect(inserts.filter((row) => row.table === carryOverEntries)).toHaveLength(0);
    expect(inserts.filter((row) => row.table === projectYearAllocations)).toHaveLength(0);

    // One snapshot row per source program/allocation and component.
    const snapshots = inserts.filter((row) => row.table === closeSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((row) => row.values)).toEqual([
      expect.objectContaining({
        annualPlanId: PLAN_ID,
        entityType: 'program',
        entityId: PROGRAM_ID,
        component: 'capex',
        available: 700,
        carried: 0,
        notCarried: 700,
        notCarriedReason: finalCloseReason(2027),
      }),
      expect.objectContaining({
        annualPlanId: PLAN_ID,
        entityType: 'program',
        entityId: PROGRAM_ID,
        component: 'opex',
        available: 300,
        carried: 0,
        notCarried: 300,
        notCarriedReason: finalCloseReason(2027),
      }),
    ]);

    // No target entity was touched, so no carry cache is recomputed for one.
    expect(updates.some((row) => row.table === annualPrograms)).toBe(false);

    const closeUpdate = updates.find((row) => row.table === annualPlans);
    expect(closeUpdate?.set).toEqual(
      expect.objectContaining({ status: 'closed', closeReference: 'Board memo 12/2027' }),
    );

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'close',
        entityType: 'annual_plan',
        entityId: PLAN_ID,
        after: expect.objectContaining({
          status: 'closed',
          finalClose: true,
          targetAnnualPlanId: null,
          carryOverEntries: 0,
          closeSnapshots: 2,
        }),
      }),
    );

    const redirectUrl = mocks.redirect.mock.calls[0]?.[0] as string;
    expect(decodeURIComponent(redirectUrl)).toContain(
      'Fiscal year FY2027 closed as the final close: no carry-over, 2 snapshot rows.',
    );
  });

  it('ignores posted carry fields at the plan end year', async () => {
    mocks.getCloseState.mockResolvedValue(closeState(FINAL_STATE));
    const { inserts } = postableDatabase();

    // A carry form that the normal path would accept: the final close does not
    // read any of it.
    await expect(runAction(carryForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(inserts.filter((row) => row.table === carryOverEntries)).toHaveLength(0);
    const snapshots = inserts.filter((row) => row.table === closeSnapshots);
    expect(snapshots.map((row) => row.values?.carried)).toEqual([0, 0]);
  });

  it('still refuses a non-final close without the next-year plan', async () => {
    mocks.getCloseState.mockResolvedValue(closeState({ targetPlan: null }));

    const state = await runAction(carryForm());

    expect(state.status).toBe('error');
    expect(state.message).toContain(
      'The FY2028 annual plan does not exist yet; create it before closing.',
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
