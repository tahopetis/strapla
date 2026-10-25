import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { auditEntries, users, type AuditEntry, type User } from '@/db/schema';

/** Read queries for administrator accounts and the audit trail (M2.5 #16). */

export interface MemberRow {
  user: User;
  activeSessions: number;
}

export async function listMembers(): Promise<MemberRow[]> {
  const rows = await getDb()
    .select({
      user: users,
      activeSessions: sql<string>`(
        select count(*) from sessions
        where sessions.user_id = users.id
          and sessions.revoked_at is null
          and sessions.expires_at > now()
      )::text`,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return rows.map((row) => ({ user: row.user, activeSessions: Number(row.activeSessions ?? '0') }));
}

export async function countActiveMembers(): Promise<number> {
  const rows = await getDb()
    .select({ value: sql<string>`count(*)::text` })
    .from(users)
    .where(eq(users.isActive, true));
  return Number(rows[0]?.value ?? '0');
}

export async function findMember(id: string): Promise<User | null> {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface AuditRow {
  entry: AuditEntry;
  actorEmail: string | null;
  actorName: string | null;
}

export interface AuditFilters {
  entityType?: string;
  actorUserId?: string;
  action?: string;
  /** Free text across actor, entity, action and reason. */
  q?: string;
  limit?: number;
}

export async function listAuditEntries(
  filters: AuditFilters = {},
  maxLimit = 200,
): Promise<AuditRow[]> {
  const conditions = [];
  if (filters.entityType) conditions.push(eq(auditEntries.entityType, filters.entityType));
  if (filters.actorUserId) conditions.push(eq(auditEntries.actorUserId, filters.actorUserId));
  if (filters.action) conditions.push(eq(auditEntries.action, filters.action));
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim()}%`;
    const search = or(
      ilike(auditEntries.entityType, pattern),
      ilike(auditEntries.entityId, pattern),
      ilike(auditEntries.action, pattern),
      ilike(auditEntries.reason, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern),
    );
    if (search) conditions.push(search);
  }

  const rows = await getDb()
    .select({
      entry: auditEntries,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditEntries)
    .leftJoin(users, eq(auditEntries.actorUserId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditEntries.createdAt))
    .limit(Math.min(filters.limit ?? 100, maxLimit));

  return rows.map((row) => ({ entry: row.entry, actorEmail: row.actorEmail, actorName: row.actorName }));
}

export async function listEntityHistory(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditRow[]> {
  const rows = await getDb()
    .select({
      entry: auditEntries,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditEntries)
    .leftJoin(users, eq(auditEntries.actorUserId, users.id))
    .where(and(eq(auditEntries.entityType, entityType), eq(auditEntries.entityId, entityId)))
    .orderBy(desc(auditEntries.createdAt))
    .limit(limit);

  return rows.map((row) => ({ entry: row.entry, actorEmail: row.actorEmail, actorName: row.actorName }));
}

export async function listAuditEntityTypes(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ entityType: auditEntries.entityType })
    .from(auditEntries)
    .orderBy(asc(auditEntries.entityType));
  return rows.map((row) => row.entityType);
}

export async function listAuditActions(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ action: auditEntries.action })
    .from(auditEntries)
    .orderBy(asc(auditEntries.action));
  return rows.map((row) => row.action);
}

export async function listAuditActors(): Promise<Array<{ value: string; label: string }>> {
  const rows = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name));
  return rows.map((row) => ({ value: row.id, label: `${row.name} (${row.email})` }));
}

export async function countAuditEntries(): Promise<number> {
  const rows = await getDb()
    .select({ value: sql<string>`count(*)::text` })
    .from(auditEntries);
  return Number(rows[0]?.value ?? '0');
}
