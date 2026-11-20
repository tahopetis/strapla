import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-action tests for the close guard (W4a/W5b). The database, session and
 * redirect are mocked at the module boundary, so these tests observe what the
 * action does with a submitted form: reject a wrong typed phrase, a blank
 * confirmation or a blank carry-over before any transaction starts, and let
 * explicit zeros through. A refusal comes back as form state — the message the
 * form renders beside the values the user entered — not as a redirect.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  getCloseState: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('./close-queries', () => ({ getCloseState: mocks.getCloseState }));

import type { FormState } from '@/lib/form-state';
import type { CloseState } from './close-queries';
import { closeFiscalYearAction } from './close-actions';

const INITIAL: FormState = { status: 'idle', attempt: 0 };
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const PROGRAM_ID = '33333333-3333-4333-8333-333333333333';

function closeState(overrides: Partial<CloseState> = {}): CloseState {
  return {
    plan: { id: PLAN_ID, fiscalYear: 2027, status: 'active' },
    strategicPlan: { status: 'active' },
    targetPlan: { id: TARGET_PLAN_ID, fiscalYear: 2028, status: 'active' },
    programs: [],
    allocations: [],
    carryOvers: [],
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

async function runAction(form: FormData): Promise<FormState> {
  return closeFiscalYearAction(INITIAL, form);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireUser.mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.test',
    name: 'Owner',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('closeFiscalYearAction guards', () => {
  it('rejects a wrong typed confirmation before any database work', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(
      closeForm({
        annualPlanId: PLAN_ID,
        reference: 'Board memo 12/2027',
        confirmation: 'CLOSE FY2026',
      }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toContain('Type "CLOSE FY2027" exactly to confirm the close.');
    // The refused submission keeps what the user entered.
    expect(state.values?.reference).toBe('Board memo 12/2027');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('returns a field error when the typed confirmation is blank', async () => {
    mocks.getCloseState.mockResolvedValue(closeState());

    const state = await runAction(
      closeForm({
        annualPlanId: PLAN_ID,
        reference: 'Board memo 12/2027',
        confirmation: '',
      }),
    );

    expect(state.status).toBe('invalid');
    expect(state.fieldErrors?.confirmation).toContain('Type the close confirmation phrase');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects a blank carry-over field even when the phrase is right', async () => {
    mocks.getCloseState.mockResolvedValue(
      closeState({
        programs: [
          {
            program: { id: PROGRAM_ID, code: 'PRG-01', name: 'Platform' },
            unallocatedCapex: 1_000,
            unallocatedOpex: 500,
            targetPrograms: [],
            defaultTargetProgramId: null,
          },
        ],
      } as unknown as Partial<CloseState>),
    );

    const state = await runAction(
      closeForm({
        annualPlanId: PLAN_ID,
        reference: 'Board memo 12/2027',
        confirmation: 'CLOSE FY2027',
      }),
    );

    expect(state.status).toBe('error');
    expect(state.message).toContain('PRG-01 capex carry-over is required (use 0 for none).');
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('lets explicit zeros pass the guards into the close transaction', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('stop after the guards'));
    mocks.getDb.mockReturnValue({ transaction });
    mocks.getCloseState.mockResolvedValue(
      closeState({
        programs: [
          {
            program: { id: PROGRAM_ID, code: 'PRG-01', name: 'Platform' },
            unallocatedCapex: 1_000,
            unallocatedOpex: 500,
            targetPrograms: [],
            defaultTargetProgramId: null,
          },
        ],
      } as unknown as Partial<CloseState>),
    );

    // An unexpected failure is rethrown so the error boundary renders; the
    // point here is that the guards let the submission reach the transaction.
    await expect(
      runAction(
        closeForm({
          annualPlanId: PLAN_ID,
          reference: 'Board memo 12/2027',
          confirmation: 'CLOSE FY2027',
          [`carry_program_${PROGRAM_ID}_capex`]: '0',
          [`carry_program_${PROGRAM_ID}_opex`]: '0',
        }),
      ),
    ).rejects.toThrow('stop after the guards');

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
