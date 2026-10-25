'use server';

import { and, eq, isNull } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { getDb } from '@/db/client';
import type * as schema from '@/db/schema';
import { sessions, users, type User } from '@/db/schema';
import {
  memberCreateSchema,
  memberPasswordResetSchema,
  memberReasonSchema,
  type MemberCreateInput,
  type MemberPasswordResetInput,
} from '@/domain/inputs';
import {
  FormError,
  actionUser,
  describeError,
  failWith,
  finishWith,
  parseForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { createUser } from '@/server/auth/users';
import { countActiveMembers, findMember } from './queries';

const MEMBERS_PAGE = '/admin/members';

function memberSnapshot(user: User): Record<string, unknown> {
  return {
    name: user.name,
    email: user.email,
    isActive: user.isActive,
  };
}

async function requireMember(id: string): Promise<User> {
  const member = await findMember(id);
  if (!member) throw new FormError('Account not found.');
  return member;
}

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

async function revokeSessionsInTransaction(tx: Tx, userId: string): Promise<number> {
  const revoked = await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

async function createMember(actorId: string, input: MemberCreateInput): Promise<void> {
  const email = input.email.toLowerCase();
  const existing = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) throw new FormError('An account with that email already exists.');

  await createUser({
    name: input.name,
    email,
    password: input.password,
    actorUserId: actorId,
  });
}

async function deactivateMember(actorId: string, userId: string, reason: string): Promise<void> {
  const member = await requireMember(userId);
  if (member.id === actorId) {
    throw new FormError('You cannot deactivate your own account.');
  }
  if (!member.isActive) throw new FormError('That account is already deactivated.');
  const activeCount = await countActiveMembers();
  if (activeCount <= 1) {
    throw new FormError('The last active account cannot be deactivated.');
  }

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new FormError('Account not found.');
    const revokedCount = await revokeSessionsInTransaction(tx, userId);
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'member_deactivate',
      entityType: 'user',
      entityId: userId,
      before: memberSnapshot(member),
      after: { ...memberSnapshot(updated), revokedSessions: revokedCount },
      reason,
    });
  });
}

async function activateMember(actorId: string, userId: string, reason: string): Promise<void> {
  const member = await requireMember(userId);
  if (member.isActive) throw new FormError('That account is already active.');

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new FormError('Account not found.');
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'member_activate',
      entityType: 'user',
      entityId: userId,
      before: memberSnapshot(member),
      after: memberSnapshot(updated),
      reason,
    });
  });
}

async function resetMemberPassword(
  actorId: string,
  input: MemberPasswordResetInput,
): Promise<void> {
  const member = await requireMember(input.userId);
  const policyError = validatePasswordPolicy(input.password);
  if (policyError) throw new FormError(policyError);
  const passwordHash = await hashPassword(input.password);

  await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning();
    if (!updated) throw new FormError('Account not found.');
    const revokedCount = await revokeSessionsInTransaction(tx, input.userId);
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'password_reset',
      entityType: 'user',
      entityId: input.userId,
      before: { email: member.email },
      after: { email: member.email, revokedSessions: revokedCount },
      reason: input.reason,
    });
  });
}

async function revokeMemberSessions(actorId: string, userId: string, reason: string): Promise<void> {
  const member = await requireMember(userId);

  await getDb().transaction(async (tx) => {
    const revokedCount = await revokeSessionsInTransaction(tx, userId);
    await recordAudit(tx, {
      actorUserId: actorId,
      action: 'session_revoke',
      entityType: 'user',
      entityId: userId,
      before: memberSnapshot(member),
      after: { revokedSessions: revokedCount },
      reason,
    });
  });
}

// ---------------------------------------------------------------- actions

export async function createMemberAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    await createMember(actor.id, parseForm(memberCreateSchema, formData));
  } catch (error) {
    failWith(MEMBERS_PAGE, describeError(error));
  }
  finishWith(MEMBERS_PAGE, 'Member created.');
}

export async function deactivateMemberAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(memberReasonSchema, formData);
    await deactivateMember(actor.id, input.userId, input.reason);
  } catch (error) {
    failWith(MEMBERS_PAGE, describeError(error));
  }
  finishWith(MEMBERS_PAGE, 'Member deactivated.');
}

export async function activateMemberAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(memberReasonSchema, formData);
    await activateMember(actor.id, input.userId, input.reason);
  } catch (error) {
    failWith(MEMBERS_PAGE, describeError(error));
  }
  finishWith(MEMBERS_PAGE, 'Member activated.');
}

export async function resetMemberPasswordAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(memberPasswordResetSchema, formData);
    await resetMemberPassword(actor.id, input);
  } catch (error) {
    failWith(MEMBERS_PAGE, describeError(error));
  }
  finishWith(MEMBERS_PAGE, 'Password reset.');
}

export async function revokeMemberSessionsAction(formData: FormData): Promise<void> {
  const actor = await actionUser();
  try {
    const input = parseForm(memberReasonSchema, formData);
    await revokeMemberSessions(actor.id, input.userId, input.reason);
  } catch (error) {
    failWith(MEMBERS_PAGE, describeError(error));
  }
  finishWith(MEMBERS_PAGE, 'Sessions revoked.');
}
