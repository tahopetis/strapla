import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The carry-over ledger service (ADR-0006 §2–3, #113). The executor is mocked
 * at the module boundary: these tests pin the service contract — a receipt is
 * positive and reasoned where it must be, lineage is one hop and cannot loop,
 * and the `carry_in_*` cache is always recomputed from the ledger sum instead
 * of being incremented.
 */

const NOW = new Date('2026-11-26T00:00:00.000Z');

interface Recorded {
  table: unknown;
  values?: unknown;
  set?: unknown;
}

interface Harness {
  tx: CarryLedgerExecutor;
  inserts: Recorded[];
  updates: Recorded[];
}

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.groupBy.mockResolvedValue(rows);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

/**
 * A Drizzle-shaped executor: `select` returns queued chains in order, while
 * `insert`/`update` record what the service wrote and resolve the given rows.
 */
function harness(options: {
  selects?: unknown[][];
  insertRows?: unknown[];
  updateRows?: unknown[];
}): Harness {
  const selects = [...(options.selects ?? [])];
  const inserts: Recorded[] = [];
  const updates: Recorded[] = [];

  const select = vi.fn(() => {
    if (selects.length === 0) throw new Error('unexpected select: the test ran out of queued rows');
    return selectChain(selects.shift() ?? []);
  });

  const insert = vi.fn((table: unknown) => {
    const record: Recorded = { table };
    inserts.push(record);
    return {
      values: vi.fn((values: unknown) => {
        record.values = values;
        return { returning: vi.fn().mockResolvedValue(options.insertRows ?? [{ id: 'entry-new' }]) };
      }),
    };
  });

  const update = vi.fn((table: unknown) => {
    const record: Recorded = { table };
    updates.push(record);
    const chain = {
      set: vi.fn((set: unknown) => {
        record.set = set;
        return chain;
      }),
      where: vi.fn(() => chain),
      returning: vi.fn().mockResolvedValue(options.updateRows ?? [{ id: 'target-1' }]),
    };
    return chain;
  });

  const tx = { select, insert, update } as unknown as CarryLedgerExecutor;
  return { tx, inserts, updates };
}

import {
  CarryLedgerError,
  appendCarryEntry,
  type CarryLedgerExecutor,
  assertCarryCacheMatches,
  recomputeCarryCache,
  receiveCarry,
} from './carry-ledger';

const TARGET_PLAN = '11111111-1111-4111-8111-111111111111';
const SOURCE_PLAN = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('appendCarryEntry', () => {
  it('writes a close entry with its source, reason and inherited approval reference', async () => {
    const { tx, inserts } = harness({ insertRows: [{ id: 'entry-1', amount: 500 }] });

    const entry = await appendCarryEntry(tx, {
      origin: 'close',
      sourceAnnualPlanId: SOURCE_PLAN,
      sourceEntityId: SOURCE_ID,
      targetAnnualPlanId: TARGET_PLAN,
      entityType: 'program',
      targetEntityId: TARGET_ID,
      component: 'capex',
      amount: 500,
      reason: 'Board decision: finish the network in FY2028',
      approvalReference: 'CLOSE-FY2027',
      actorUserId: 'user-1',
    });

    expect(entry.id).toBe('entry-1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.values).toEqual({
      origin: 'close',
      sourceAnnualPlanId: SOURCE_PLAN,
      sourceEntityId: SOURCE_ID,
      targetAnnualPlanId: TARGET_PLAN,
      entityType: 'program',
      targetEntityId: TARGET_ID,
      component: 'capex',
      amount: 500,
      reason: 'Board decision: finish the network in FY2028',
      approvalReference: 'CLOSE-FY2027',
      sourceEntryId: null,
      createdBy: 'user-1',
    });
  });

  it('writes an opening receipt with no source and its own reason', async () => {
    const { tx, inserts } = harness({ insertRows: [{ id: 'entry-1' }] });

    await appendCarryEntry(tx, {
      origin: 'opening',
      targetAnnualPlanId: TARGET_PLAN,
      entityType: 'allocation',
      targetEntityId: TARGET_ID,
      component: 'opex',
      amount: 1_000,
      reason: 'Opening balance load FY2026',
      actorUserId: 'user-1',
    });

    expect(inserts[0]?.values).toEqual(
      expect.objectContaining({
        origin: 'opening',
        sourceAnnualPlanId: null,
        sourceEntityId: null,
        amount: 1_000,
        reason: 'Opening balance load FY2026',
      }),
    );
  });

  it('refuses a zero or negative amount', async () => {
    const { tx, inserts } = harness({});

    for (const amount of [0, -1]) {
      await expect(
        appendCarryEntry(tx, {
          origin: 'manual',
          targetAnnualPlanId: TARGET_PLAN,
          entityType: 'program',
          targetEntityId: TARGET_ID,
          component: 'capex',
          amount,
          reason: 'Grant',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(CarryLedgerError);
    }
    expect(inserts).toHaveLength(0);
  });

  it('requires a reason for an opening or manual receipt', async () => {
    const { tx } = harness({});

    for (const origin of ['opening', 'manual'] as const) {
      await expect(
        appendCarryEntry(tx, {
          origin,
          targetAnnualPlanId: TARGET_PLAN,
          entityType: 'program',
          targetEntityId: TARGET_ID,
          component: 'capex',
          amount: 10,
          reason: '   ',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(/reason/i);
    }
  });

  it('refuses opening and manual receipts that claim a source', async () => {
    const { tx } = harness({});

    for (const origin of ['opening', 'manual'] as const) {
      await expect(
        appendCarryEntry(tx, {
          origin,
          sourceAnnualPlanId: SOURCE_PLAN,
          sourceEntityId: SOURCE_ID,
          targetAnnualPlanId: TARGET_PLAN,
          entityType: 'program',
          targetEntityId: TARGET_ID,
          component: 'capex',
          amount: 10,
          reason: 'Grant',
          actorUserId: 'user-1',
        }),
      ).rejects.toThrow(/source/i);
    }
  });

  it('requires a source plan and entity for a close entry', async () => {
    const { tx } = harness({});

    await expect(
      appendCarryEntry(tx, {
        origin: 'close',
        targetAnnualPlanId: TARGET_PLAN,
        entityType: 'program',
        targetEntityId: TARGET_ID,
        component: 'capex',
        amount: 10,
        reason: 'Carry',
        approvalReference: 'CLOSE-FY2027',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/source/i);
  });

  it('refuses a lineage reference to a receipt that does not exist', async () => {
    const { tx, inserts } = harness({ selects: [[]] });

    await expect(
      appendCarryEntry(tx, {
        origin: 'close',
        sourceAnnualPlanId: SOURCE_PLAN,
        sourceEntityId: SOURCE_ID,
        targetAnnualPlanId: TARGET_PLAN,
        entityType: 'program',
        targetEntityId: TARGET_ID,
        component: 'capex',
        amount: 10,
        reason: 'Carry of carry',
        approvalReference: 'CLOSE-FY2028',
        sourceEntryId: 'missing-entry',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/not found/i);
    expect(inserts).toHaveLength(0);
  });

  it('refuses a lineage reference that does not end at the source entity', async () => {
    const { tx } = harness({
      selects: [
        [
          {
            id: 'receipt-1',
            sourceEntryId: null,
            targetAnnualPlanId: SOURCE_PLAN,
            targetEntityId: 'another-program',
            entityType: 'program',
            component: 'capex',
          },
        ],
      ],
    });

    await expect(
      appendCarryEntry(tx, {
        origin: 'close',
        sourceAnnualPlanId: SOURCE_PLAN,
        sourceEntityId: SOURCE_ID,
        targetAnnualPlanId: TARGET_PLAN,
        entityType: 'program',
        targetEntityId: TARGET_ID,
        component: 'capex',
        amount: 10,
        reason: 'Carry of carry',
        approvalReference: 'CLOSE-FY2028',
        sourceEntryId: 'receipt-1',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/lineage/i);
  });

  it('refuses a cyclic lineage chain', async () => {
    const cycle = (id: string, next: string) => ({
      id,
      sourceEntryId: next,
      targetAnnualPlanId: SOURCE_PLAN,
      targetEntityId: SOURCE_ID,
      entityType: 'program',
      component: 'capex',
    });
    const { tx } = harness({
      selects: [[cycle('receipt-b', 'receipt-a')], [cycle('receipt-a', 'receipt-b')]],
    });

    await expect(
      appendCarryEntry(tx, {
        origin: 'close',
        sourceAnnualPlanId: SOURCE_PLAN,
        sourceEntityId: SOURCE_ID,
        targetAnnualPlanId: TARGET_PLAN,
        entityType: 'program',
        targetEntityId: TARGET_ID,
        component: 'capex',
        amount: 10,
        reason: 'Carry of carry',
        approvalReference: 'CLOSE-FY2028',
        sourceEntryId: 'receipt-b',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/cyclic/i);
  });

  it('links a valid carry-of-carry one hop', async () => {
    const { tx, inserts } = harness({
      selects: [
        [
          {
            id: 'receipt-1',
            sourceEntryId: null,
            targetAnnualPlanId: SOURCE_PLAN,
            targetEntityId: SOURCE_ID,
            entityType: 'program',
            component: 'capex',
          },
        ],
      ],
      insertRows: [{ id: 'entry-2' }],
    });

    await appendCarryEntry(tx, {
      origin: 'close',
      sourceAnnualPlanId: SOURCE_PLAN,
      sourceEntityId: SOURCE_ID,
      targetAnnualPlanId: TARGET_PLAN,
      entityType: 'program',
      targetEntityId: TARGET_ID,
      component: 'capex',
      amount: 10,
      reason: 'Carry of carry',
      approvalReference: 'CLOSE-FY2028',
      sourceEntryId: 'receipt-1',
      actorUserId: 'user-1',
    });

    expect(inserts[0]?.values).toEqual(expect.objectContaining({ sourceEntryId: 'receipt-1' }));
  });
});

describe('recomputeCarryCache', () => {
  it('writes the ledger sum into the program cache instead of incrementing it', async () => {
    const { tx, updates } = harness({
      selects: [
        [
          { component: 'capex', total: '300' },
          { component: 'opex', total: '0' },
        ],
      ],
    });

    const totals = await recomputeCarryCache(tx, {
      entityType: 'program',
      entityId: TARGET_ID,
      actorUserId: 'user-1',
    });

    expect(totals).toEqual({ capex: 300, opex: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toEqual(
      expect.objectContaining({
        carryInCapex: 300,
        carryInOpex: 0,
        updatedBy: 'user-1',
      }),
    );
  });

  it('writes the allocation cache from the same ledger sum', async () => {
    const { tx, updates } = harness({
      selects: [
        [
          { component: 'capex', total: '0' },
          { component: 'opex', total: '1250' },
        ],
      ],
    });

    const totals = await recomputeCarryCache(tx, {
      entityType: 'allocation',
      entityId: TARGET_ID,
      actorUserId: 'user-1',
    });

    expect(totals).toEqual({ capex: 0, opex: 1_250 });
    expect(updates[0]?.set).toEqual(expect.objectContaining({ carryInCapex: 0, carryInOpex: 1_250 }));
  });

  it('leaves both components at zero when the ledger has no entry yet', async () => {
    const { tx } = harness({ selects: [[]] });

    const totals = await recomputeCarryCache(tx, {
      entityType: 'program',
      entityId: TARGET_ID,
      actorUserId: null,
    });

    expect(totals).toEqual({ capex: 0, opex: 0 });
  });

  it('refuses to recompute a target that does not exist', async () => {
    const { tx } = harness({ selects: [[]], updateRows: [] });

    await expect(
      recomputeCarryCache(tx, { entityType: 'program', entityId: TARGET_ID, actorUserId: 'user-1' }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('receiveCarry', () => {
  it('appends the receipt and recomputes the cache in one call', async () => {
    const { tx, inserts, updates } = harness({
      insertRows: [{ id: 'entry-1' }],
      selects: [[{ component: 'capex', total: '250' }]],
    });

    const result = await receiveCarry(tx, {
      origin: 'manual',
      targetAnnualPlanId: TARGET_PLAN,
      entityType: 'program',
      targetEntityId: TARGET_ID,
      component: 'capex',
      amount: 250,
      reason: 'Owner grant for the security programme',
      actorUserId: 'user-1',
    });

    expect(result.entry.id).toBe('entry-1');
    expect(result.cache).toEqual({ capex: 250, opex: 0 });
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });
});

describe('assertCarryCacheMatches', () => {
  it('passes when the cache equals the ledger sum', async () => {
    const { tx } = harness({
      selects: [
        [
          { component: 'capex', total: '300' },
          { component: 'opex', total: '0' },
        ],
        [{ carryInCapex: 300, carryInOpex: 0 }],
      ],
    });

    await expect(
      assertCarryCacheMatches(tx, { entityType: 'program', entityId: TARGET_ID }),
    ).resolves.toBeUndefined();
  });

  it('names the mismatching component when the cache drifted', async () => {
    const { tx } = harness({
      selects: [
        [
          { component: 'capex', total: '300' },
          { component: 'opex', total: '0' },
        ],
        [{ carryInCapex: 100, carryInOpex: 0 }],
      ],
    });

    await expect(
      assertCarryCacheMatches(tx, { entityType: 'program', entityId: TARGET_ID }),
    ).rejects.toThrow(/capex/);
  });
});
