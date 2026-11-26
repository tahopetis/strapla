import { describe, expect, it } from 'vitest';
import { carryOverFieldName, readCarryOverField } from './close-form';

describe('carryOverFieldName', () => {
  it('names the field by entity, id and component', () => {
    expect(carryOverFieldName('program', 'p-1', 'capex')).toBe('carry_program_p-1_capex');
    expect(carryOverFieldName('allocation', 'a-1', 'opex')).toBe('carry_allocation_a-1_opex');
  });
});

describe('readCarryOverField', () => {
  it('accepts an explicit zero and whole Rupiah amounts', () => {
    expect(readCarryOverField('0', 'PRG-01 capex')).toEqual({ ok: true, value: 0 });
    expect(readCarryOverField('1.234.567', 'PRG-01 capex')).toEqual({
      ok: true,
      value: 1_234_567,
    });
  });

  it('rejects blank fields so a zero carry-over is explicit', () => {
    for (const raw of ['', '   ', null, undefined, { size: 0 }]) {
      const result = readCarryOverField(raw, 'PRG-01 capex');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('is required (use 0 for none)');
    }
  });

  it('rejects values that are not whole, non-negative Rupiah', () => {
    for (const raw of ['abc', '-5']) {
      const result = readCarryOverField(raw, 'PRG-01 capex');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('whole Rupiah');
    }
  });
});

// ---------------------------------------------------------------- close plan (#113)

import { buildClosePlan, notCarriedReasonFieldName, targetProgramFieldName } from './close-form';

function closeForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

const PROGRAM = 'program-1';
const ALLOCATION = 'allocation-1';

const PLAN_INPUT = {
  defaultEntryReason: 'Carried into FY2028 at the FY2027 close (CLOSE-FY2027)',
  programs: [
    {
      id: PROGRAM,
      code: 'PRG-2027-01',
      name: 'Network renewal',
      availableCapex: 700,
      availableOpex: 300,
      continuationProgramId: 'program-2',
      targetProgramIds: ['program-2'],
    },
  ],
  allocations: [
    {
      id: ALLOCATION,
      projectCode: 'PRJ-2027-001',
      programId: PROGRAM,
      availableCapex: 200,
      availableOpex: 0,
      targetAllocationId: 'allocation-2',
      canCreateTarget: false,
      note: null,
    },
  ],
} as const;

const FULL_CARRY = {
  [`carry_program_${PROGRAM}_capex`]: '700',
  [`carry_program_${PROGRAM}_opex`]: '300',
  [`carry_allocation_${ALLOCATION}_capex`]: '200',
  [`carry_allocation_${ALLOCATION}_opex`]: '0',
};

describe('buildClosePlan', () => {
  it('writes one snapshot row per entity and component, including zero carry', () => {
    const plan = buildClosePlan(PLAN_INPUT, closeForm(FULL_CARRY));

    expect(plan.snapshots).toEqual([
      {
        entityType: 'program',
        entityId: PROGRAM,
        component: 'capex',
        available: 700,
        carried: 700,
        notCarried: 0,
        notCarriedReason: '',
      },
      {
        entityType: 'program',
        entityId: PROGRAM,
        component: 'opex',
        available: 300,
        carried: 300,
        notCarried: 0,
        notCarriedReason: '',
      },
      {
        entityType: 'allocation',
        entityId: ALLOCATION,
        component: 'capex',
        available: 200,
        carried: 200,
        notCarried: 0,
        notCarriedReason: '',
      },
      {
        entityType: 'allocation',
        entityId: ALLOCATION,
        component: 'opex',
        available: 0,
        carried: 0,
        notCarried: 0,
        notCarriedReason: '',
      },
    ]);

    expect(plan.entries).toEqual([
      {
        entityType: 'program',
        sourceEntityId: PROGRAM,
        targetEntityId: 'program-2',
        component: 'capex',
        amount: 700,
        reason: 'Carried into FY2028 at the FY2027 close (CLOSE-FY2027)',
      },
      {
        entityType: 'program',
        sourceEntityId: PROGRAM,
        targetEntityId: 'program-2',
        component: 'opex',
        amount: 300,
        reason: 'Carried into FY2028 at the FY2027 close (CLOSE-FY2027)',
      },
      {
        entityType: 'allocation',
        sourceEntityId: ALLOCATION,
        targetEntityId: 'allocation-2',
        component: 'capex',
        amount: 200,
        reason: 'Carried into FY2028 at the FY2027 close (CLOSE-FY2027)',
      },
    ]);
    expect(plan.totals).toEqual({
      program: { capex: 700, opex: 300 },
      allocation: { capex: 200, opex: 0 },
    });
  });

  it('keeps a zero-carry entity in the snapshot and needs no target for it', () => {
    const plan = buildClosePlan(
      PLAN_INPUT,
      closeForm({
        ...FULL_CARRY,
        [`carry_program_${PROGRAM}_capex`]: '0',
        [`carry_program_${PROGRAM}_opex`]: '0',
        [notCarriedReasonFieldName('program', PROGRAM)]: 'No approved use in the target year',
      }),
    );

    const programCapex = plan.snapshots.find(
      (row) => row.entityType === 'program' && row.component === 'capex',
    );
    expect(programCapex).toMatchObject({ available: 700, carried: 0, notCarried: 700 });
    expect(plan.entries.some((entry) => entry.entityType === 'program')).toBe(false);
  });

  it('requires a reason for the part that is not carried', () => {
    expect(() =>
      buildClosePlan(
        PLAN_INPUT,
        closeForm({ ...FULL_CARRY, [`carry_program_${PROGRAM}_capex`]: '400' }),
      ),
    ).toThrow(/PRG-2027-01.*reason/i);
  });

  it('records the reason on the not-carried part', () => {
    const plan = buildClosePlan(
      PLAN_INPUT,
      closeForm({
        ...FULL_CARRY,
        [`carry_program_${PROGRAM}_capex`]: '400',
        [notCarriedReasonFieldName('program', PROGRAM)]: 'Deferred to the FY2028 review',
      }),
    );

    expect(
      plan.snapshots.find((row) => row.entityType === 'program' && row.component === 'capex'),
    ).toMatchObject({ available: 700, carried: 400, notCarried: 300, notCarriedReason: 'Deferred to the FY2028 review' });
  });

  it('refuses a blank carry field and an amount above what is available', () => {
    expect(() =>
      buildClosePlan(PLAN_INPUT, closeForm({ ...FULL_CARRY, [`carry_program_${PROGRAM}_capex`]: '' })),
    ).toThrow(/required \(use 0 for none\)/i);

    expect(() =>
      buildClosePlan(PLAN_INPUT, closeForm({ ...FULL_CARRY, [`carry_program_${PROGRAM}_capex`]: '701' })),
    ).toThrow(/cannot exceed the available 700/i);
  });

  it('uses only the continuation program when one exists', () => {
    const plan = buildClosePlan(
      { ...PLAN_INPUT, programs: [{ ...PLAN_INPUT.programs[0], targetProgramIds: ['program-2', 'program-3'] }] },
      closeForm({ ...FULL_CARRY, [targetProgramFieldName(PROGRAM)]: 'program-3' }),
    );

    // The form cannot redirect a continued program elsewhere, even if it posts one.
    const programEntry = plan.entries.find(
      (entry) => entry.entityType === 'program' && entry.component === 'capex',
    );
    expect(programEntry?.targetEntityId).toBe('program-2');
  });

  it('requires an explicit same-initiative target when the program is discontinued', () => {
    const discontinued = {
      ...PLAN_INPUT,
      programs: [{ ...PLAN_INPUT.programs[0], continuationProgramId: null, targetProgramIds: ['program-3'] }],
    };

    expect(() => buildClosePlan(discontinued, closeForm(FULL_CARRY))).toThrow(/target program/i);

    expect(() =>
      buildClosePlan(discontinued, closeForm({ ...FULL_CARRY, [targetProgramFieldName(PROGRAM)]: 'program-9' })),
    ).toThrow(/target program/i);

    const plan = buildClosePlan(
      discontinued,
      closeForm({ ...FULL_CARRY, [targetProgramFieldName(PROGRAM)]: 'program-3' }),
    );
    expect(
      plan.entries.find((entry) => entry.entityType === 'program')?.targetEntityId,
    ).toBe('program-3');
  });

  it('refuses carrying an allocation that has nowhere to land', () => {
    const undeliverable = {
      ...PLAN_INPUT,
      allocations: [{ ...PLAN_INPUT.allocations[0], targetAllocationId: null, canCreateTarget: false, note: 'No target program.' }],
    };

    expect(() => buildClosePlan(undeliverable, closeForm(FULL_CARRY))).toThrow(/No target program/i);
  });

  it('marks a new target allocation with a creation placeholder', () => {
    const fresh = {
      ...PLAN_INPUT,
      allocations: [{ ...PLAN_INPUT.allocations[0], targetAllocationId: null, canCreateTarget: true }],
    };

    const plan = buildClosePlan(fresh, closeForm(FULL_CARRY));
    expect(
      plan.entries.find((entry) => entry.entityType === 'allocation')?.targetEntityId,
    ).toBe(`new-allocation:${ALLOCATION}`);
  });
});

describe('buildClosePlan target for a new allocation', () => {
  it('needs a program target when only its allocation carries', () => {
    const discontinued = {
      ...PLAN_INPUT,
      programs: [{ ...PLAN_INPUT.programs[0], continuationProgramId: null, targetProgramIds: ['program-3'] }],
      allocations: [{ ...PLAN_INPUT.allocations[0], targetAllocationId: null, canCreateTarget: true }],
    };

    // The program itself carries nothing, but its allocation does: the new
    // target allocation is created under the program's target.
    expect(() =>
      buildClosePlan(
        discontinued,
        closeForm({
          ...FULL_CARRY,
          [`carry_program_${PROGRAM}_capex`]: '0',
          [`carry_program_${PROGRAM}_opex`]: '0',
          [notCarriedReasonFieldName('program', PROGRAM)]: 'No approved use in the target year',
        }),
      ),
    ).toThrow(/target program/i);

    const plan = buildClosePlan(
      discontinued,
      closeForm({
        ...FULL_CARRY,
        [`carry_program_${PROGRAM}_capex`]: '0',
        [`carry_program_${PROGRAM}_opex`]: '0',
        [notCarriedReasonFieldName('program', PROGRAM)]: 'No approved use in the target year',
        [targetProgramFieldName(PROGRAM)]: 'program-3',
      }),
    );
    expect(plan.programTargets.get(PROGRAM)).toBe('program-3');
  });
});
