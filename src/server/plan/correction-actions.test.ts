import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for closed-year audited corrections (ADR-0007, issue
 * #108). A closed fiscal year accepts an in-place update of an existing record,
 * audited under the `correction` action, with a mandatory reason and without
 * touching the close snapshot, the carry-over ledger, the program/allocation
 * carry-in caches or the revision register. Everything else keeps refusing:
 * creates, voids, status changes, a cancelled project, a voided record and an
 * archived strategic plan.
 *
 * One field distinction matters here: a recurring ops item's carry-in is an
 * in-place input that sits outside the ledger and outside the year close (ADR-0006
 * §7), so a correction writes it with the item's opex budget (ADR-0007 §2).
 * A program's or an allocation's carry-in is a ledger-derived cache and a
 * correction never writes it (ADR-0007 §4).
 *
 * The database, session, custom-field registry, audit writer, carry ledger and
 * redirect are mocked at the module boundary — the same harness the issue-level
 * action tests use — so each test observes exactly what the action does with a
 * submitted form: one `correction` entry and no `update` entry, or a refusal
 * that never opens the write transaction.
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
// The carry-over ledger is the only ledger writer these modules pull in; a
// correction must never reach it (ADR-0007 §4).
vi.mock('./carry-ledger', () => ({ receiveCarry: mocks.receiveCarry }));

import type { FormState } from '@/lib/form-state';
import {
  annualPrograms,
  projectYearAllocations,
  recurringOpsItems,
} from '@/db/schema';
import { updateProgramAction, voidProgramAction } from './annual-actions';
import {
  createProjectAction,
  saveIjinPrinsipAction,
  updateProjectAction,
} from './project-actions';
import { updateAllocationAction, voidAllocationAction } from './allocation-actions';
import { updateRecurringOpsAction, voidRecurringOpsAction } from './recurring-actions';
import { updateCommitmentAction, voidCommitmentAction } from './execution-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };

const STRATEGIC_PLAN_ID = '11111111-1111-4111-8111-111111111111';
const ANNUAL_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const PROGRAM_ID = '33333333-3333-4333-8333-333333333333';
const SI_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const ALLOCATION_ID = '66666666-6666-4666-8666-666666666666';
const ITEM_ID = '77777777-7777-4777-8777-777777777777';
const COMMITMENT_ID = '88888888-8888-4888-8888-888888888888';
const IJIN_ID = '99999999-9999-4999-8999-999999999999';
const FISCAL_YEAR = 2027;

const REASON = 'Typo in the approved figure, corrected after the close';
/** The ADR-0007 §5 wording; the contract pins it verbatim. */
const CORRECTION_REASON_REFUSAL = 'Give a reason for a correction after close.';
const CLOSED_REFUSAL = 'This fiscal year is closed and read-only.';

type PlanStatus = 'draft' | 'active' | 'closed';
type StrategicPlanStatus = 'draft' | 'active' | 'archived';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

/**
 * One read chain: every step chains, and both `limit(1)` and a bare `await`
 * resolve the queued rows (Drizzle builders are thenable, and the actions use
 * both shapes).
 */
function readChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return chain;
}

/**
 * A `getDb()` stand-in: reads consume the queued row sets in call order, and
 * the transaction runs the callback against the given executor.
 */
function database(results: unknown[][], tx: unknown = {}) {
  let index = 0;
  const transaction = vi.fn();
  mocks.getDb.mockReturnValue({
    select: () => {
      const rows = results[index] ?? [];
      index += 1;
      return readChain(rows);
    },
    transaction,
  });
  transaction.mockImplementation(async (callback: (executor: unknown) => Promise<unknown>) =>
    callback(tx),
  );
  return { transaction };
}

/** The write half: `tx.update(...).set(...).where(...).returning()` plus reads. */
function writeExecutor(updated: Record<string, unknown>) {
  const write = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue([updated]),
  };
  write.set.mockReturnValue(write);
  write.where.mockReturnValue(write);
  const tx = {
    update: vi.fn().mockReturnValue(write),
    select: vi.fn(() => readChain([])),
    insert: vi.fn(),
  };
  return { tx, write };
}

/** The audit inputs the action recorded, in call order. */
function auditEntries(): Array<Record<string, unknown>> {
  return mocks.recordAudit.mock.calls.map((call) => call[1] as Record<string, unknown>);
}

/** A single `correction` entry and no `update` entry — the ADR-0007 §5 shape. */
function expectOneCorrection(entry: Record<string, unknown>): void {
  const entries = auditEntries();
  expect(entries).toHaveLength(1);
  expect(entries.some((candidate) => candidate.action === 'update')).toBe(false);
  expect(entries[0]).toMatchObject({
    action: 'correction',
    reason: REASON,
    ...entry,
  });
}

// ------------------------------------------------------------------ fixtures

const STRATEGIC_PLAN_ROW = {
  id: STRATEGIC_PLAN_ID,
  status: 'active' as StrategicPlanStatus,
  startFiscalYear: 2026,
  endFiscalYear: 2032,
};

function annualPlanRow(status: PlanStatus, strategicPlanStatus: StrategicPlanStatus = 'active') {
  return {
    annualPlan: {
      id: ANNUAL_PLAN_ID,
      planId: STRATEGIC_PLAN_ID,
      fiscalYear: FISCAL_YEAR,
      status,
    },
    strategicPlan: { ...STRATEGIC_PLAN_ROW, status: strategicPlanStatus },
  };
}

function programRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROGRAM_ID,
    annualPlanId: ANNUAL_PLAN_ID,
    siId: SI_ID,
    prevProgramId: null,
    code: 'PRG-2027-001',
    name: 'Workplace Modernisation 2027',
    capexBudget: 1_000_000_000,
    opexBudget: 200_000_000,
    carryInCapex: 0,
    carryInOpex: 0,
    notes: null,
    voidedAt: null,
    voidedReason: null,
    ...overrides,
  };
}

/** The row `loadProgram` selects. */
function programContext(
  status: PlanStatus,
  options: { program?: Record<string, unknown>; strategicPlanStatus?: StrategicPlanStatus } = {},
) {
  const { annualPlan, strategicPlan } = annualPlanRow(status, options.strategicPlanStatus);
  return { program: programRow(options.program), annualPlan, strategicPlan };
}

function initiativeRow() {
  return { id: SI_ID, planId: STRATEGIC_PLAN_ID, voidedAt: null };
}

function programForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    id: PROGRAM_ID,
    code: 'PRG-2027-001',
    name: 'Workplace Modernisation 2027',
    siId: SI_ID,
    prevProgramId: '',
    capexBudget: '1000000000',
    opexBudget: '200000000',
    notes: 'Corrected notes',
    reason: REASON,
    ...overrides,
  });
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    originatingProgramId: PROGRAM_ID,
    code: 'PRJ-2027-001',
    name: 'Device Refresh 2027',
    description: null,
    externalReference: null,
    owner: null,
    status: 'active',
    startFiscalYear: FISCAL_YEAR,
    endFiscalYear: FISCAL_YEAR,
    allocatedBudgetFullLife: 900_000_000,
    submittedPrice: null,
    finalDealPrice: null,
    openingAllocated: 0,
    openingCommitted: 0,
    openingSpent: 0,
    cancelledReason: null,
    ...overrides,
  };
}

/** The row `loadProjectContext` selects (project, program, annual plan, strategic plan). */
function projectContext(options: {
  annualPlanStatus?: PlanStatus;
  projectStatus?: 'active' | 'cancelled';
  strategicPlanStatus?: StrategicPlanStatus;
} = {}) {
  const { annualPlan, strategicPlan } = annualPlanRow(
    options.annualPlanStatus ?? 'closed',
    options.strategicPlanStatus,
  );
  return {
    project: projectRow({ status: options.projectStatus ?? 'active' }),
    program: { id: PROGRAM_ID, siId: SI_ID },
    annualPlan,
    strategicPlan,
  };
}

function projectForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    id: PROJECT_ID,
    code: 'PRJ-2027-001',
    name: 'Device Refresh 2027',
    externalReference: '',
    owner: '',
    description: '',
    startFiscalYear: String(FISCAL_YEAR),
    endFiscalYear: String(FISCAL_YEAR),
    allocatedBudgetFullLife: '950000000',
    submittedPrice: '',
    finalDealPrice: '',
    openingAllocated: '0',
    openingCommitted: '0',
    openingSpent: '0',
    reason: REASON,
    ...overrides,
  });
}

function ijinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IJIN_ID,
    projectId: PROJECT_ID,
    documentNumber: 'IJIN/2027/001',
    documentDate: '2027-01-15',
    approvedAmount: 500_000_000,
    approver: 'Owner',
    documentUrl: null,
    notes: null,
    ...overrides,
  };
}

function ijinForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    projectId: PROJECT_ID,
    documentNumber: 'IJIN/2027/002',
    documentDate: '2027-01-20',
    approvedAmount: '525000000',
    approver: 'Owner',
    documentUrl: '',
    notes: 'Corrected document number',
    reason: REASON,
    ...overrides,
  });
}

function allocationRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

/** The row `loadAllocationContext` selects, with its originating initiative lookup. */
function allocationContext(status: PlanStatus, options: { voidedAt?: Date } = {}) {
  const { annualPlan, strategicPlan } = annualPlanRow(status);
  return {
    allocation: allocationRow(options.voidedAt ? { voidedAt: options.voidedAt } : {}),
    project: projectRow(),
    program: { id: PROGRAM_ID, siId: SI_ID },
    annualPlan,
    strategicPlan,
  };
}

function allocationForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    id: ALLOCATION_ID,
    allocationCapex: '600000000',
    allocationOpex: '100000000',
    notes: 'Corrected allocation',
    reason: REASON,
    ...overrides,
  });
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

/** The row `loadItem` selects. */
function itemContext(status: PlanStatus, options: { voidedAt?: Date } = {}) {
  const { annualPlan, strategicPlan } = annualPlanRow(status);
  return {
    item: itemRow(options.voidedAt ? { voidedAt: options.voidedAt } : {}),
    annualPlan,
    strategicPlan,
  };
}

function itemForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    id: ITEM_ID,
    name: 'Leased lines 2027',
    categoryId: '',
    owner: '',
    opexBudget: '250000000',
    carryInOpex: '40000000',
    notes: 'Corrected opex budget',
    reason: REASON,
    ...overrides,
  });
}

function commitmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMITMENT_ID,
    projectYearAllocationId: ALLOCATION_ID,
    recurringOpsItemId: null,
    component: 'capex',
    amount: 10_000_000,
    commitmentDate: '2027-03-01',
    reference: 'PO-2027-01',
    description: null,
    voidedAt: null,
    ...overrides,
  };
}

/** The parent row `loadParent` selects for an allocation. */
function parentContext(status: PlanStatus, projectStatus: 'active' | 'cancelled' = 'active') {
  const { annualPlan, strategicPlan } = annualPlanRow(status);
  return {
    allocation: { id: ALLOCATION_ID },
    project: { id: PROJECT_ID, status: projectStatus },
    annualPlan,
    strategicPlan,
  };
}

function commitmentForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    id: COMMITMENT_ID,
    component: 'capex',
    amount: '12000000',
    commitmentDate: '2027-03-05',
    reference: 'PO-2027-01',
    description: 'Corrected commitment amount',
    allocationId: ALLOCATION_ID,
    recurringOpsItemId: '',
    reason: REASON,
    ...overrides,
  });
}

function reasonForm(id: string, overrides: Record<string, string> = {}): FormData {
  return formData({ id, reason: REASON, ...overrides });
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

// ------------------------------------------------------- annual program update

describe('updateProgramAction closed-year correction', () => {
  it('saves a closed-year program correction as one `correction` audit entry', async () => {
    const { tx, write } = writeExecutor(
      programRow({ name: 'Workplace Modernisation 2027 (corrected)' }),
    );
    database(
      [[programContext('closed')], [annualPlanRow('closed')], [initiativeRow()]],
      tx,
    );

    await expect(
      updateProgramAction(
        INITIAL,
        programForm({ name: 'Workplace Modernisation 2027 (corrected)' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Workplace Modernisation 2027 (corrected)' }),
    );
    // A program's carry-in is a ledger-derived cache, not a correctable field:
    // the correction never writes it (ADR-0007 §4).
    const programPayload = write.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(programPayload).not.toHaveProperty('carryInCapex');
    expect(programPayload).not.toHaveProperty('carryInOpex');
    expectOneCorrection({
      entityType: 'annual_program',
      entityId: PROGRAM_ID,
      before: expect.objectContaining({ name: 'Workplace Modernisation 2027' }),
      after: expect.objectContaining({ name: 'Workplace Modernisation 2027 (corrected)' }),
    });
    // A correction is in place: no revision row, no close snapshot, no ledger.
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.receiveCarry).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/annual/${ANNUAL_PLAN_ID}`),
    );
  });

  it('still refuses a closed-year correction that shifts capex into opex', async () => {
    const db = database([[programContext('closed')], [annualPlanRow('closed')]]);

    const state = await updateProgramAction(
      INITIAL,
      programForm({ capexBudget: '900000000', opexBudget: '300000000' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/capex and opex never shift/i);
    // The refusal keeps what the user typed and writes nothing.
    expect(state.values?.opexBudget).toBe('300000000');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('accepts a closed-year budget correction that keeps the components apart', async () => {
    const { tx, write } = writeExecutor(programRow({ capexBudget: 1_200_000_000 }));
    database(
      [[programContext('closed')], [annualPlanRow('closed')], [initiativeRow()]],
      tx,
    );

    await expect(
      updateProgramAction(INITIAL, programForm({ capexBudget: '1200000000' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ capexBudget: 1_200_000_000, opexBudget: 200_000_000 }),
    );
    expectOneCorrection({
      entityType: 'annual_program',
      entityId: PROGRAM_ID,
      before: expect.objectContaining({ capexBudget: 1_000_000_000 }),
      after: expect.objectContaining({ capexBudget: 1_200_000_000 }),
    });
  });

  it('still refuses to void a program in a closed year', async () => {
    const db = database([[programContext('closed')], [annualPlanRow('closed')]]);

    const state = await voidProgramAction(INITIAL, reasonForm(PROGRAM_ID));

    expect(state.status).toBe('error');
    expect(state.message).toBe(CLOSED_REFUSAL);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still refuses a voided program in a closed year', async () => {
    const db = database([
      [programContext('closed', { program: { voidedAt: new Date() } })],
    ]);

    const state = await voidProgramAction(INITIAL, reasonForm(PROGRAM_ID));

    expect(state.status).toBe('error');
    expect(state.message).toBe('This program is already voided.');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- project update

describe('updateProjectAction closed-year correction', () => {
  it('saves a closed-year project correction as one `correction` audit entry', async () => {
    const { tx, write } = writeExecutor(projectRow({ allocatedBudgetFullLife: 950_000_000 }));
    database([[projectContext({ annualPlanStatus: 'closed' })]], tx);

    await expect(
      updateProjectAction(INITIAL, projectForm({ allocatedBudgetFullLife: '950000000' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ allocatedBudgetFullLife: 950_000_000 }),
    );
    expectOneCorrection({
      entityType: 'project',
      entityId: PROJECT_ID,
      before: expect.objectContaining({ allocatedBudgetFullLife: 900_000_000 }),
      after: expect.objectContaining({ allocatedBudgetFullLife: 950_000_000 }),
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/projects/${PROJECT_ID}`),
    );
  });

  it('still refuses a cancelled project in a closed year', async () => {
    const db = database([
      [projectContext({ annualPlanStatus: 'closed', projectStatus: 'cancelled' })],
    ]);

    const state = await updateProjectAction(INITIAL, projectForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('This project is cancelled and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still refuses a correction in an archived strategic plan', async () => {
    const db = database([
      [projectContext({ annualPlanStatus: 'closed', strategicPlanStatus: 'archived' })],
    ]);

    const state = await updateProjectAction(INITIAL, projectForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('The strategic plan is archived and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('still refuses to create a project in a closed year', async () => {
    const db = database([[programContext('closed')]]);

    const state = await createProjectAction(
      INITIAL,
      formData({
        originatingProgramId: PROGRAM_ID,
        name: 'Closed year project attempt',
        startFiscalYear: String(FISCAL_YEAR),
        endFiscalYear: String(FISCAL_YEAR),
        allocatedBudgetFullLife: '1000000',
      }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toBe('The originating fiscal year is closed and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------- ijin prinsip update

describe('saveIjinPrinsipAction closed-year correction', () => {
  it('saves a closed-year ijin prinsip correction as one `correction` audit entry', async () => {
    const { tx, write } = writeExecutor(
      ijinRow({ documentNumber: 'IJIN/2027/002', approvedAmount: 525_000_000 }),
    );
    database(
      [[projectContext({ annualPlanStatus: 'closed' })], [ijinRow()]],
      tx,
    );

    await expect(
      saveIjinPrinsipAction(INITIAL, ijinForm({ documentNumber: 'IJIN/2027/002' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: 'IJIN/2027/002', approvedAmount: 525_000_000 }),
    );
    expectOneCorrection({
      entityType: 'ijin_prinsip',
      entityId: IJIN_ID,
      before: expect.objectContaining({ approvedAmount: 500_000_000 }),
      after: expect.objectContaining({ approvedAmount: 525_000_000 }),
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('refuses a blank reason instead of saving the correction', async () => {
    const db = database([
      [projectContext({ annualPlanStatus: 'closed' })],
      [ijinRow()],
    ]);

    const state = await saveIjinPrinsipAction(INITIAL, ijinForm({ reason: '' }));

    expect(state.status).toBe('error');
    expect(state.message).toBe(CORRECTION_REASON_REFUSAL);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still refuses to create an ijin prinsip record in a closed year', async () => {
    const db = database([[projectContext({ annualPlanStatus: 'closed' })], []]);

    const state = await saveIjinPrinsipAction(INITIAL, ijinForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe(
      'The fiscal year is closed; the ijin prinsip record cannot be created after the close.',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    // The create path audits `action: 'create'`; a closed year never reaches it.
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- allocation

describe('updateAllocationAction closed-year correction', () => {
  it('saves a closed-year allocation correction without touching carry-in', async () => {
    const { tx, write } = writeExecutor(
      allocationRow({ allocationCapex: 600_000_000, notes: 'Corrected allocation' }),
    );
    database([[allocationContext('closed')], [{ siId: SI_ID }]], tx);

    await expect(
      updateAllocationAction(INITIAL, allocationForm({ allocationCapex: '600000000' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    const payload = write.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ allocationCapex: 600_000_000 });
    // An allocation's carry-in is a ledger-derived cache, not a correctable
    // field: the update never writes it.
    expect(payload).not.toHaveProperty('carryInCapex');
    expect(payload).not.toHaveProperty('carryInOpex');
    expectOneCorrection({
      entityType: 'project_year_allocation',
      entityId: ALLOCATION_ID,
      before: expect.objectContaining({ allocationCapex: 500_000_000 }),
      after: expect.objectContaining({ allocationCapex: 600_000_000 }),
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/projects/${PROJECT_ID}`),
    );
  });

  it('still refuses a voided allocation in a closed year', async () => {
    const db = database([
      [allocationContext('closed', { voidedAt: new Date() })],
      [{ siId: SI_ID }],
    ]);

    const state = await updateAllocationAction(INITIAL, allocationForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('This allocation is voided and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('still refuses to void an allocation in a closed year', async () => {
    const db = database([[allocationContext('closed')], [{ siId: SI_ID }]]);

    const state = await voidAllocationAction(INITIAL, reasonForm(ALLOCATION_ID));

    expect(state.status).toBe('error');
    expect(state.message).toBe('This fiscal year is closed; allocations cannot be voided.');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------- recurring ops

describe('updateRecurringOpsAction closed-year correction', () => {
  it('corrects the opex budget and the in-place carry-in in the same update', async () => {
    const { tx, write } = writeExecutor(
      itemRow({
        opexBudget: 250_000_000,
        carryInOpex: 75_000_000,
        notes: 'Corrected opex budget and carry-in',
      }),
    );
    database([[itemContext('closed')]], tx);

    await expect(
      updateRecurringOpsAction(
        INITIAL,
        itemForm({ opexBudget: '250000000', carryInOpex: '75000000' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    const payload = write.set.mock.calls[0]?.[0] as Record<string, unknown>;
    // A recurring ops item's carry-in is an in-place input (ADR-0006 §7), so
    // ADR-0007 §2 corrects it with the opex budget in the same update.
    expect(payload).toMatchObject({
      opexBudget: 250_000_000,
      carryInOpex: 75_000_000,
    });
    expectOneCorrection({
      entityType: 'recurring_ops_item',
      entityId: ITEM_ID,
      before: expect.objectContaining({
        opexBudget: 200_000_000,
        carryInOpex: 40_000_000,
      }),
      after: expect.objectContaining({
        opexBudget: 250_000_000,
        carryInOpex: 75_000_000,
      }),
    });
    // The correction writes the recurring item only: no program or allocation
    // carry-in cache is touched, and no row is inserted anywhere.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(recurringOpsItems);
    expect(tx.update).not.toHaveBeenCalledWith(annualPrograms);
    expect(tx.update).not.toHaveBeenCalledWith(projectYearAllocations);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('still refuses a voided item in a closed year', async () => {
    const db = database([[itemContext('closed', { voidedAt: new Date() })]]);

    const state = await updateRecurringOpsAction(INITIAL, itemForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('This item is voided and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('still refuses to void an item in a closed year', async () => {
    const db = database([[itemContext('closed')]]);

    const state = await voidRecurringOpsAction(INITIAL, reasonForm(ITEM_ID));

    expect(state.status).toBe('error');
    expect(state.message).toBe(CLOSED_REFUSAL);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- commitments

describe('updateCommitmentAction closed-year correction', () => {
  it('saves a closed-year commitment correction as one `correction` audit entry', async () => {
    const { tx, write } = writeExecutor(
      commitmentRow({ amount: 12_000_000, description: 'Corrected commitment amount' }),
    );
    database(
      [[commitmentRow()], [parentContext('closed')], [{ amount: 0 }]],
      tx,
    );

    await expect(
      updateCommitmentAction(
        INITIAL,
        commitmentForm({ amount: '12000000' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12_000_000 }),
    );
    expectOneCorrection({
      entityType: 'commitment_entry',
      entityId: COMMITMENT_ID,
      before: expect.objectContaining({ amount: 10_000_000 }),
      after: expect.objectContaining({ amount: 12_000_000 }),
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/plan/projects/${PROJECT_ID}/allocations/${ALLOCATION_ID}`),
    );
  });

  it('still refuses to reduce a commitment below its settled amount', async () => {
    const db = database([
      [commitmentRow()],
      [parentContext('closed')],
      [{ amount: 15_000_000 }],
    ]);

    const state = await updateCommitmentAction(
      INITIAL,
      commitmentForm({ amount: '12000000' }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toMatch(/already settled amount/i);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('still refuses a voided commitment in a closed year', async () => {
    const db = database([
      [commitmentRow({ voidedAt: new Date() })],
      [parentContext('closed')],
    ]);

    const state = await updateCommitmentAction(INITIAL, commitmentForm());

    expect(state.status).toBe('error');
    expect(state.message).toBe('This commitment is voided and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('still refuses to void a commitment in a closed year', async () => {
    const db = database([[commitmentRow()], [parentContext('closed')]]);

    const state = await voidCommitmentAction(INITIAL, reasonForm(COMMITMENT_ID));

    expect(state.status).toBe('error');
    expect(state.message).toBe('That fiscal year is closed and read-only.');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
