import type { Db } from '@/db/client';
import { auditEntries } from '@/db/schema';

/**
 * Append-only audit trail (ADR-0004). Every mutation must call recordAudit
 * with the same executor (transaction) as the mutation itself, so a mutation
 * cannot exist without its audit entry.
 */
export type AuditExecutor = Pick<Db, 'insert'>;

export type AuditAction =
  | 'create'
  | 'update'
  | 'void'
  | 'restore'
  | 'status_change'
  | 'close'
  | 'carry_over'
  | 'settle'
  | 'member_create'
  | 'member_deactivate'
  | 'member_activate'
  | 'password_reset'
  | 'session_revoke'
  | 'custom_field_create'
  | 'custom_field_update'
  | 'custom_field_remove'
  | 'custom_field_restore'
  | 'custom_field_reorder'
  | 'report_preference_save'
  | 'revision_post'
  | 'revision_decision'
  /**
   * An in-place update of an existing plan record in a closed fiscal year
   * (ADR-0007). Distinct from `update` so the record badge, the closed plan's
   * correction banner, the report markers and the close receipt notice can all
   * read it straight from the trail.
   */
  | 'correction';

export interface AuditInput {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

export async function recordAudit(executor: AuditExecutor, input: AuditInput): Promise<void> {
  await executor.insert(auditEntries).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
  });
}
