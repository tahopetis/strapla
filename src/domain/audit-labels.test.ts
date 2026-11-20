import { describe, expect, it } from 'vitest';
import { auditActionLabel, auditEntityTypeLabel } from './audit-labels';

describe('audit labels', () => {
  it('names the custom-field actions in readable words', () => {
    expect(auditActionLabel('custom_field_create')).toBe('Custom field created');
    expect(auditActionLabel('custom_field_update')).toBe('Custom field updated');
    expect(auditActionLabel('custom_field_remove')).toBe('Custom field removed');
    expect(auditActionLabel('custom_field_restore')).toBe('Custom field restored');
  });

  it('names the custom-field entity in readable words', () => {
    expect(auditEntityTypeLabel('custom_field')).toBe('Custom field');
  });

  it('keeps the raw token while a token has no human label yet', () => {
    expect(auditActionLabel('status_change')).toBe('status_change');
    expect(auditEntityTypeLabel('strategic_plan')).toBe('strategic_plan');
  });
});
