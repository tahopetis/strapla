import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users, type User } from '@/db/schema';
import { recordAudit } from '@/server/audit';
import { hashPassword } from './password';

export async function countUsers(): Promise<number> {
  const rows = await getDb().select({ value: sql<number>`count(*)::int` }).from(users);
  return rows[0]?.value ?? 0;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await getDb().select().from(users).where(eq(users.email, normalized)).limit(1);
  return rows[0] ?? null;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  actorUserId: string | null;
}

/** Creates a user and its audit entry in one transaction. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);

  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash,
        createdBy: input.actorUserId,
      })
      .returning();

    const created = inserted[0];
    if (!created) throw new Error('failed to create user');

    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      action: 'member_create',
      entityType: 'user',
      entityId: created.id,
      after: { name: created.name, email: created.email },
    });

    return created;
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const { sessions } = await import('@/db/schema');
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId));
}
