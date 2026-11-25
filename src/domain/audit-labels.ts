/**
 * Human labels for audit-trail tokens (issue #76).
 *
 * The database stores stable machine tokens (`custom_field_create`,
 * `custom_field`), and the audit view shows the readable label while the token
 * stays the filter value. Tokens with no label yet fall back to themselves: a
 * newly added action must never be hidden behind a guessed label, and the audit
 * trail stays searchable by the exact token the code writes.
 *
 * Labels are added here for the tokens this change makes readable (the audit
 * view and the dashboard's recent activity); labelling every token is a
 * separate polish pass.
 */

const ACTION_LABELS: Readonly<Record<string, string>> = {
  custom_field_create: 'Custom field created',
  custom_field_update: 'Custom field updated',
  custom_field_remove: 'Custom field removed',
  custom_field_restore: 'Custom field restored',
  custom_field_reorder: 'Custom field reordered',
  report_preference_save: 'Report column selection saved',
  revision_post: 'Budget revision posted',
  revision_decision: 'Budget revision decision recorded',
};

const ENTITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  custom_field: 'Custom field',
  report_preference: 'Report preference',
  budget_revision: 'Budget revision',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function auditEntityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}
