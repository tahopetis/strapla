import { describe, expect, it } from 'vitest';
import {
  carryOverAmountSchema,
  closeFiscalYearSchema,
  customFieldCreateSchema,
  customFieldRestoreSchema,
  customFieldUpdateSchema,
} from './inputs';

const base = {
  annualPlanId: '00000000-0000-4000-8000-000000000000',
  reference: 'Board memo 12/2027',
};

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
      customFieldCreateSchema.safeParse({ ...definition, entityType: 'commitment_entry' }).success,
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
