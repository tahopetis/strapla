import { describe, expect, it } from 'vitest';
import {
  budgetRevisionCreateSchema,
  budgetRevisionDecisionSchema,
  carryOverAmountSchema,
  closeFiscalYearSchema,
  customFieldCreateSchema,
  customFieldRestoreSchema,
  customFieldUpdateSchema,
  initiativeCreateSchema,
  initiativeUpdateSchema,
  openingReconciliationSaveSchema,
  parseSignedRupiah,
} from './inputs';

const base = {
  annualPlanId: '00000000-0000-4000-8000-000000000000',
  reference: 'Board memo 12/2027',
};

const recordId = '00000000-0000-4000-8000-000000000000';

const initiative = {
  planId: recordId,
  code: 'SI-01',
  name: 'Core network',
  envelopeCapex: '2.000.000.000',
  envelopeOpex: '1.000.000.000',
  priorCapex: '250.000.000',
  priorOpex: '0',
};

describe('strategic initiative envelope and prior consumed per component', () => {
  it('parses the capex and opex figures independently', () => {
    expect(initiativeCreateSchema.parse(initiative)).toMatchObject({
      envelopeCapex: 2_000_000_000,
      envelopeOpex: 1_000_000_000,
      priorCapex: 250_000_000,
      priorOpex: 0,
    });
  });

  it('requires all four figures, so the old single figures cannot be saved as-is', () => {
    for (const field of ['envelopeCapex', 'envelopeOpex', 'priorCapex', 'priorOpex'] as const) {
      const without: Record<string, unknown> = { ...initiative };
      delete without[field];
      expect(initiativeCreateSchema.safeParse(without).success, field).toBe(false);
    }

    expect(
      initiativeCreateSchema.safeParse({
        planId: recordId,
        code: 'SI-01',
        name: 'Core network',
        envelopeAmount: '2.000.000.000',
        priorProgramBudgetUsed: '0',
      }).success,
    ).toBe(false);
  });

  it('rejects a negative or non-numeric component figure', () => {
    expect(initiativeCreateSchema.safeParse({ ...initiative, envelopeOpex: '-1' }).success).toBe(
      false,
    );
    expect(initiativeCreateSchema.safeParse({ ...initiative, priorCapex: 'lots' }).success).toBe(
      false,
    );
  });

  it('requires a reason when the initiative changes', () => {
    const update = { ...initiative, id: recordId, reason: 'Split the envelope per component.' };
    expect(initiativeUpdateSchema.parse(update)).toMatchObject({
      envelopeCapex: 2_000_000_000,
      envelopeOpex: 1_000_000_000,
      priorCapex: 250_000_000,
      priorOpex: 0,
    });
    expect(initiativeUpdateSchema.safeParse({ ...update, reason: ' ' }).success).toBe(false);
  });
});

describe('carryOverAmountSchema', () => {
  it('accepts an explicit zero and whole Rupiah amounts', () => {
    expect(carryOverAmountSchema('PRG-01 capex').parse('0')).toBe(0);
    expect(carryOverAmountSchema('PRG-01 capex').parse('1.234.567')).toBe(1_234_567);
  });

  it('rejects a blank field so a zero carry-over is explicit', () => {
    for (const raw of ['', '   ']) {
      const result = carryOverAmountSchema('PRG-01 capex').safeParse(raw);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toMatch(/use 0 for none/);
    }
  });

  it('rejects values that are not whole, non-negative Rupiah', () => {
    for (const raw of ['abc', '-5']) {
      expect(carryOverAmountSchema('PRG-01 capex').safeParse(raw).success).toBe(false);
    }
  });
});

describe('closeFiscalYearSchema', () => {
  it('requires a non-blank typed confirmation field', () => {
    expect(closeFiscalYearSchema.safeParse({ ...base, confirmation: '' }).success).toBe(false);
    expect(closeFiscalYearSchema.safeParse({ ...base, confirmation: 'CLOSE FY2027' }).success).toBe(
      true,
    );
  });

  it('requires the approval reference', () => {
    expect(
      closeFiscalYearSchema.safeParse({ ...base, reference: '  ', confirmation: 'CLOSE FY2027' })
        .success,
    ).toBe(false);
  });
});

describe('custom field administration schemas', () => {
  const definition = {
    entityType: 'project',
    name: '  Procurement method  ',
    type: 'text',
    required: 'off',
    description: 'How the project is procured.',
  };

  it('trims the name and turns the checkbox pair into a boolean', () => {
    expect(customFieldCreateSchema.parse(definition)).toMatchObject({
      name: 'Procurement method',
      required: false,
    });
    expect(customFieldCreateSchema.parse({ ...definition, required: 'on' })).toMatchObject({
      required: true,
    });
  });

  it('rejects an unknown entity type or field type', () => {
    expect(
      customFieldCreateSchema.safeParse({ ...definition, entityType: 'annual_plan' }).success,
    ).toBe(false);
    expect(customFieldCreateSchema.safeParse({ ...definition, type: 'money' }).success).toBe(false);
  });

  it('carries an optional example value, trimmed, with a blank meaning none', () => {
    expect(
      customFieldCreateSchema.parse({ ...definition, example: '  Open tender  ' }),
    ).toMatchObject({ example: 'Open tender' });
    expect(customFieldCreateSchema.parse({ ...definition, example: '   ' })).toMatchObject({
      example: null,
    });
    expect(customFieldCreateSchema.parse(definition)).toMatchObject({ example: null });
  });

  it('accepts an example only when the field type parser accepts it', () => {
    expect(
      customFieldCreateSchema.safeParse({ ...definition, type: 'number', example: '-42' }).success,
    ).toBe(true);
    expect(
      customFieldCreateSchema.safeParse({ ...definition, type: 'number', example: 'Open tender' })
        .success,
    ).toBe(false);
    expect(
      customFieldCreateSchema.safeParse({ ...definition, type: 'date', example: '2027-01-01' })
        .success,
    ).toBe(true);
    expect(
      customFieldCreateSchema.safeParse({ ...definition, type: 'date', example: '01/01/2027' })
        .success,
    ).toBe(false);
  });

  it('applies the example rule when an existing field changes', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(
      customFieldUpdateSchema.safeParse({
        ...definition,
        type: 'number',
        example: 'Open tender',
        id,
        reason: 'Change the field type.',
      }).success,
    ).toBe(false);
    expect(
      customFieldUpdateSchema.safeParse({
        ...definition,
        type: 'number',
        example: '42',
        id,
        reason: 'Change the field type.',
      }).success,
    ).toBe(true);
  });

  it('requires a reason when an existing field changes', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(customFieldUpdateSchema.safeParse({ ...definition, id, reason: '' }).success).toBe(false);
    expect(
      customFieldUpdateSchema.safeParse({ ...definition, id, reason: 'Tidy the registry' }).success,
    ).toBe(true);
  });

  it('requires a reason and a valid id when an archived field is restored', () => {
    const id = '00000000-0000-4000-8000-000000000000';

    expect(customFieldRestoreSchema.safeParse({ id, reason: '' }).success).toBe(false);
    expect(customFieldRestoreSchema.safeParse({ id, reason: '   ' }).success).toBe(false);
    expect(
      customFieldRestoreSchema.safeParse({ id: 'archived-field', reason: 'Needed again.' }).success,
    ).toBe(false);
    expect(customFieldRestoreSchema.safeParse({ id, reason: 'Needed again.' }).success).toBe(true);
  });
});

const openingControls = {
  planId: recordId,
  reason: 'Split the control totals per component.',
  controlEnvelopeCapex: '9.000.000.000',
  controlEnvelopeOpex: '4.500.000.000',
  controlPriorProgramBudgetUsedCapex: '1.200.000.000',
  controlPriorProgramBudgetUsedOpex: '300.000.000',
  controlProgramBudgets: '500.000.000',
  controlProgramCarryIn: '0',
  controlProjectOpeningAllocated: '0',
  controlProjectOpeningCommitted: '0',
  controlProjectOpeningSpent: '0',
  controlProjectFullLifeAllocated: '0',
};

describe('opening-balance control totals per component', () => {
  it('parses the split envelope and prior control figures', () => {
    expect(openingReconciliationSaveSchema.parse(openingControls)).toMatchObject({
      controlEnvelopeCapex: 9_000_000_000,
      controlEnvelopeOpex: 4_500_000_000,
      controlPriorProgramBudgetUsedCapex: 1_200_000_000,
      controlPriorProgramBudgetUsedOpex: 300_000_000,
      controlProgramBudgets: 500_000_000,
    });
  });

  it('no longer accepts the old single control figures', () => {
    expect(
      openingReconciliationSaveSchema.safeParse({
        planId: recordId,
        reason: 'Old layout.',
        controlEnvelope: '9.000.000.000',
        controlPriorProgramBudgetUsed: '1.200.000.000',
        controlProgramBudgets: '0',
        controlProgramCarryIn: '0',
        controlProjectOpeningAllocated: '0',
        controlProjectOpeningCommitted: '0',
        controlProjectOpeningSpent: '0',
        controlProjectFullLifeAllocated: '0',
      }).success,
    ).toBe(false);

    for (const field of [
      'controlEnvelopeCapex',
      'controlEnvelopeOpex',
      'controlPriorProgramBudgetUsedCapex',
      'controlPriorProgramBudgetUsedOpex',
    ] as const) {
      const without: Record<string, unknown> = { ...openingControls };
      delete without[field];
      expect(openingReconciliationSaveSchema.safeParse(without).success, field).toBe(false);
    }
  });

  it('rejects a negative control figure and still requires a reason', () => {
    expect(
      openingReconciliationSaveSchema.safeParse({ ...openingControls, controlEnvelopeOpex: '-1' })
        .success,
    ).toBe(false);
    expect(
      openingReconciliationSaveSchema.safeParse({ ...openingControls, reason: '' }).success,
    ).toBe(false);
  });
});

describe('signed Rupiah parsing for budget revision deltas', () => {
  it('keeps the sign of a whole Rupiah amount', () => {
    expect(parseSignedRupiah('1.234.567')).toBe(1_234_567);
    expect(parseSignedRupiah('-1.234.567')).toBe(-1_234_567);
    expect(parseSignedRupiah('Rp 250.000')).toBe(250_000);
    expect(parseSignedRupiah('-Rp 250.000')).toBe(-250_000);
  });

  it('rejects text and malformed amounts', () => {
    for (const raw of ['abc', '1x', '-', '']) {
      expect(() => parseSignedRupiah(raw), raw).toThrow();
    }
  });
});

const revisionLine = {
  entityType: 'program',
  entityId: recordId,
  component: 'capex',
  delta: '-1.000.000',
};

const revision = {
  annualPlanId: recordId,
  revisionDate: '2027-03-15',
  reason: 'Steering committee reallocation.',
  lines: [
    revisionLine,
    {
      entityType: 'allocation',
      entityId: '00000000-0000-4000-8000-000000000001',
      component: 'opex',
      delta: '1.000.000',
    },
  ],
};

describe('budget revision input', () => {
  it('parses a header with signed line deltas', () => {
    const parsed = budgetRevisionCreateSchema.parse(revision);
    expect(parsed).toMatchObject({
      revisionDate: '2027-03-15',
      decisionReference: null,
      reason: 'Steering committee reallocation.',
    });
    expect(parsed.lines.map((line) => line.delta)).toEqual([-1_000_000, 1_000_000]);
    expect(parsed.lines.map((line) => line.entityType)).toEqual(['program', 'allocation']);
  });

  it('carries an optional decision reference, a blank meaning awaiting the decision', () => {
    expect(
      budgetRevisionCreateSchema.parse({ ...revision, decisionReference: '  ITSC-2027-08  ' }),
    ).toMatchObject({ decisionReference: 'ITSC-2027-08' });
    expect(
      budgetRevisionCreateSchema.parse({ ...revision, decisionReference: '   ' }),
    ).toMatchObject({ decisionReference: null });
  });

  it('rejects a zero, decimal or malformed delta', () => {
    for (const delta of ['0', '-0', '1,5', 'one million', '']) {
      expect(
        budgetRevisionCreateSchema.safeParse({
          ...revision,
          lines: [{ ...revisionLine, delta }],
        }).success,
        delta,
      ).toBe(false);
    }
  });

  it('requires at least one line, a valid entity type, entity id and component', () => {
    expect(budgetRevisionCreateSchema.safeParse({ ...revision, lines: [] }).success).toBe(false);
    expect(
      budgetRevisionCreateSchema.safeParse({
        ...revision,
        lines: [{ ...revisionLine, entityType: 'annual_program' }],
      }).success,
    ).toBe(false);
    expect(
      budgetRevisionCreateSchema.safeParse({
        ...revision,
        lines: [{ ...revisionLine, entityId: 'program-1' }],
      }).success,
    ).toBe(false);
    expect(
      budgetRevisionCreateSchema.safeParse({
        ...revision,
        lines: [{ ...revisionLine, component: 'total' }],
      }).success,
    ).toBe(false);
  });

  it('requires the plan, the revision date and a reason', () => {
    for (const field of ['annualPlanId', 'revisionDate', 'reason'] as const) {
      const without: Record<string, unknown> = { ...revision };
      delete without[field];
      expect(budgetRevisionCreateSchema.safeParse(without).success, field).toBe(false);
    }
    expect(
      budgetRevisionCreateSchema.safeParse({ ...revision, revisionDate: '15/03/2027' }).success,
    ).toBe(false);
  });
});

describe('budget revision decision input', () => {
  it('requires a decision reference and a reason to record an awaiting decision', () => {
    const reason = 'Steering committee decision received';
    expect(
      budgetRevisionDecisionSchema.parse({
        id: recordId,
        decisionReference: '  ITSC-2027-08 ',
        reason,
      }),
    ).toMatchObject({ id: recordId, decisionReference: 'ITSC-2027-08', reason });
    expect(
      budgetRevisionDecisionSchema.safeParse({
        id: recordId,
        decisionReference: '  ',
        reason,
      }).success,
    ).toBe(false);
    expect(budgetRevisionDecisionSchema.safeParse({ id: recordId, reason }).success).toBe(false);
    expect(
      budgetRevisionDecisionSchema.safeParse({
        id: recordId,
        decisionReference: 'ITSC-2027-08',
        reason: '  ',
      }).success,
    ).toBe(false);
  });
});
