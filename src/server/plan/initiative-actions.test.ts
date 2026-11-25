import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the per-component SI envelope (ADR-0006 §5, #114).
 * They sit at the action boundary: an envelope edit writes the four split
 * figures, keeps the mandatory reason in the audit trail (before and after), and
 * never writes an annual program budget — the envelope is a plan-level SI edit,
 * not a budget edit. A submission missing either figure of a pair is refused
 * before any database work.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  getStrategicPlan: vi.fn(),
  readCustomFieldPayloadState: vi.fn(),
  readCustomFieldValues: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('./queries', () => ({ getStrategicPlan: mocks.getStrategicPlan }));
vi.mock('@/server/custom-fields/form', () => ({
  readCustomFieldPayloadState: mocks.readCustomFieldPayloadState,
}));
vi.mock('@/server/custom-fields/data', () => ({
  readCustomFieldValues: mocks.readCustomFieldValues,
  saveCustomFieldValues: mocks.saveCustomFieldValues,
}));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));

import type { FormState } from '@/lib/form-state';
import { updateInitiativeAction } from './actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const SI_ID = '22222222-2222-4222-8222-222222222222';
const REASON = 'Steering committee decision 12/2026';

function currentInitiative() {
  return {
    id: SI_ID,
    planId: PLAN_ID,
    code: 'SI-01',
    name: 'Digital Workplace',
    owner: 'Head of IT',
    objective: null,
    envelopeCapex: 3_000_000_000,
    envelopeOpex: 500_000_000,
    priorProgramBudgetUsedCapex: 250_000_000,
    priorProgramBudgetUsedOpex: 100_000_000,
    notes: null,
    voidedAt: null,
    voidedReason: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function updatedInitiative() {
  return {
    ...currentInitiative(),
    envelopeCapex: 4_000_000_000,
    envelopeOpex: 1_500_000_000,
    priorProgramBudgetUsedCapex: 300_000_000,
    priorProgramBudgetUsedOpex: 200_000_000,
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

function initiativeForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    id: SI_ID,
    code: 'SI-01',
    name: 'Digital Workplace',
    owner: 'Head of IT',
    objective: '',
    envelopeCapex: '4.000.000.000',
    envelopeOpex: '1.500.000.000',
    priorCapex: '300.000.000',
    priorOpex: '200.000.000',
    notes: '',
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
  mocks.readCustomFieldPayloadState.mockResolvedValue({ fields: [], values: {}, errors: [] });
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

describe('updateInitiativeAction — per-component envelope', () => {
  it('writes both envelopes and both prior figures, keeping the reason in the audit trail', async () => {
    const db = database([currentInitiative()]);
    const write = updateChain([updatedInitiative()]);
    const tx = { update: vi.fn().mockReturnValue(write) };
    db.transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    mocks.getDb.mockReturnValue(db);

    await expect(updateInitiativeAction(INITIAL, initiativeForm())).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({
        envelopeCapex: 4_000_000_000,
        envelopeOpex: 1_500_000_000,
        priorProgramBudgetUsedCapex: 300_000_000,
        priorProgramBudgetUsedOpex: 200_000_000,
      }),
    );
    // The envelope edit is plan-level: the action's only write is the initiative.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'update',
        entityType: 'strategic_initiative',
        entityId: SI_ID,
        reason: REASON,
        before: expect.objectContaining({
          envelopeCapex: 3_000_000_000,
          envelopeOpex: 500_000_000,
          priorProgramBudgetUsedCapex: 250_000_000,
          priorProgramBudgetUsedOpex: 100_000_000,
        }),
        after: expect.objectContaining({
          envelopeCapex: 4_000_000_000,
          envelopeOpex: 1_500_000_000,
          priorProgramBudgetUsedCapex: 300_000_000,
          priorProgramBudgetUsedOpex: 200_000_000,
        }),
      }),
    );
  });

  it('refuses a missing opex envelope before any database work', async () => {
    const db = database([currentInitiative()]);
    mocks.getDb.mockReturnValue(db);

    const state = await updateInitiativeAction(INITIAL, initiativeForm({ envelopeOpex: '' }));

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.envelopeOpex).toContain('Opex envelope is required (use 0 for none).');
    expect(state.values?.envelopeCapex).toBe('4.000.000.000');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a missing prior component figure before any database work', async () => {
    const db = database([currentInitiative()]);
    mocks.getDb.mockReturnValue(db);

    const state = await updateInitiativeAction(INITIAL, initiativeForm({ priorOpex: '' }));

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.priorOpex).toContain(
      'Prior program budget consumed (opex) is required (use 0 for none).',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
