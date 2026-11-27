import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opening import (#113, ADR-0006 §2): the program `carry_in_*` columns are a
 * guarded cache now, so the import cannot write them. It records a ledger
 * receipt of origin `opening` per positive carry amount, which recomputes the
 * cache, and keeps the load reason (with the approval reference) on the receipt.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
  recordAudit: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  getCurrentStrategicPlan: vi.fn(),
  isFirstStrategicPlan: vi.fn(),
  getOpeningLoadScene: vi.fn(),
  listOpeningRegistryFields: vi.fn(),
  parseOpeningImport: vi.fn(),
  receiveCarry: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/server/custom-fields/data', () => ({
  saveCustomFieldValues: mocks.saveCustomFieldValues,
}));
vi.mock('./queries', () => ({
  getCurrentStrategicPlan: mocks.getCurrentStrategicPlan,
  isFirstStrategicPlan: mocks.isFirstStrategicPlan,
}));
vi.mock('./opening-queries', () => ({ getOpeningLoadScene: mocks.getOpeningLoadScene }));
vi.mock('./opening-import-fields', () => ({
  listOpeningRegistryFields: mocks.listOpeningRegistryFields,
}));
vi.mock('@/lib/opening-import/parse', () => ({ parseOpeningImport: mocks.parseOpeningImport }));
vi.mock('./carry-ledger', () => ({ receiveCarry: mocks.receiveCarry }));

import { annualPrograms } from '@/db/schema';
import { openingImportAction } from './opening-import-actions';

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const ANNUAL_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const SI_ID = '33333333-3333-4333-8333-333333333333';
const PROGRAM_ID = '44444444-4444-4444-8444-444444444444';

function importForm(): FormData {
  const form = new FormData();
  form.set('dataSet', 'annual-programs');
  form.set('reference', 'E2E-OPENING-IMPORT');
  form.set('intent', 'load');
  form.set('file', new File(['code,name\nPRG-90,Program PRG-90\n'], 'programs.csv'));
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({ id: 'user-1', email: 'owner@example.test', name: 'Owner' });
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.saveCustomFieldValues.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  mocks.getCurrentStrategicPlan.mockResolvedValue({
    id: PLAN_ID,
    status: 'active',
    startFiscalYear: 2026,
    endFiscalYear: 2030,
  });
  mocks.isFirstStrategicPlan.mockResolvedValue(true);
  mocks.getOpeningLoadScene.mockResolvedValue({
    annualPlan: { id: ANNUAL_PLAN_ID, fiscalYear: 2027, status: 'draft' },
    context: {
      planId: PLAN_ID,
      annualPlanId: ANNUAL_PLAN_ID,
      annualPlanFiscalYear: 2027,
      planStartFiscalYear: 2026,
      planEndFiscalYear: 2030,
      initiativeIdByCode: new Map([['SI-01', SI_ID]]),
      programIdByCode: new Map(),
      existingInitiativeCodes: new Set<string>(),
      existingProgramCodes: new Set<string>(),
      existingProjectCodes: new Set<string>(),
    },
    counts: { initiatives: 1, programs: 0, projects: 0 },
  });
  mocks.listOpeningRegistryFields.mockResolvedValue({ columns: [], fields: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sceneWithProgramCarry() {
  mocks.parseOpeningImport.mockResolvedValue({
    ok: true,
    rows: [
      {
        line: 2,
        values: {
          code: 'PRG-90',
          name: 'Program PRG-90',
          siCode: 'SI-01',
          prevProgramCode: null,
          capexBudget: 500,
          opexBudget: 200,
          carryInCapex: 1_000,
          carryInOpex: 0,
          notes: null,
        },
      },
    ],
  });
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: PROGRAM_ID,
          annualPlanId: ANNUAL_PLAN_ID,
          code: 'PRG-90',
          name: 'Program PRG-90',
          capexBudget: 500,
          opexBudget: 200,
          carryInCapex: 0,
          carryInOpex: 0,
          prevProgramId: null,
          notes: null,
        },
      ]),
    }),
  });
  const tx = { insert };
  const transaction = vi.fn(
    async (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
  );
  mocks.getDb.mockReturnValue({ transaction });
  return { transaction, insert, tx };
}

describe('openingImportAction carry receipts', () => {
  it('writes origin opening ledger receipts instead of the program carry columns', async () => {
    const { transaction, insert, tx } = sceneWithProgramCarry();
    mocks.receiveCarry.mockResolvedValue({
      entry: { id: 'entry-1' },
      cache: { capex: 1_000, opex: 0 },
    });

    await expect(openingImportAction({ status: 'idle' }, importForm())).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(annualPrograms);
    const values = insert.mock.results[0]?.value.values as ReturnType<typeof vi.fn>;
    expect(values).toHaveBeenCalledWith(
      expect.not.objectContaining({ carryInCapex: expect.anything() }),
    );

    expect(mocks.receiveCarry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        origin: 'opening',
        targetAnnualPlanId: ANNUAL_PLAN_ID,
        entityType: 'program',
        targetEntityId: PROGRAM_ID,
        component: 'capex',
        amount: 1_000,
        actorUserId: 'user-1',
      }),
    );
    // The reason carries the load reference so the receipt is traceable.
    expect(mocks.receiveCarry.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ reason: expect.stringContaining('E2E-OPENING-IMPORT') }),
    );
    // Only the capex component had an opening carry.
    expect(mocks.receiveCarry).toHaveBeenCalledTimes(1);

    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'carry_over',
        entityType: 'annual_program',
        entityId: PROGRAM_ID,
        after: expect.objectContaining({ origin: 'opening', component: 'capex', amount: 1_000 }),
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'create', entityType: 'annual_program' }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('/plan/opening-balances'));
  });
});

describe('openingImportAction first-plan gate', () => {
  it('refuses a successor plan before touching the load scene', async () => {
    mocks.isFirstStrategicPlan.mockResolvedValue(false);

    const state = await openingImportAction({ status: 'idle' }, importForm());

    expect(state).toEqual({
      status: 'error',
      message: 'Opening balances are recorded once, for the first plan.',
    });
    expect(mocks.getOpeningLoadScene).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
