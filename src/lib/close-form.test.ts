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
