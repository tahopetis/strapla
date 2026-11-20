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
import type { FormState } from '@/lib/form-state';
import {
  FormError,
  actionUser,
  failureState,
  finishWith,
  validateForm,
} from '@/server/actions/common';
import { recordAudit } from '@/server/audit';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { createUser } from '@/server/auth/users';
import { countActiveMembers, findMember } from './queries';

const MEMBERS_PAGE = '/admin/members';

/** A submitted password is never echoed back into form state. */
function withoutPassword(values: Record<string, string>): Record<string, string> {
  const echoed: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'password') echoed[name] = value;
  }
  return echoed;
}

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

async function createMember(actorId: string, input: MemberCreateInput): Promise<User> {
  const email = input.email.toLowerCase();
  const existing = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) throw new FormError('An account with that email already exists.');

  return createUser({
    name: input.name,
    email,
    password: input.password,
    actorUserId: actorId,
  });
}

async function deactivateMember(actorId: string, userId: string, reason: string): Promise<User> {
  const member = await requireMember(userId);
  if (member.id === actorId) {
    throw new FormError('You cannot deactivate your own account.');
  }
  if (!member.isActive) throw new FormError('That account is already deactivated.');
  const activeCount = await countActiveMembers();
  if (activeCount <= 1) {
    throw new FormError('The last active account cannot be deactivated.');
  }

  let updated: User | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Account not found.');
  return updated;
}

async function activateMember(actorId: string, userId: string, reason: string): Promise<User> {
  const member = await requireMember(userId);
  if (member.isActive) throw new FormError('That account is already active.');

  let updated: User | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Account not found.');
  return updated;
}

async function resetMemberPassword(
  actorId: string,
  input: MemberPasswordResetInput,
): Promise<User> {
  const member = await requireMember(input.userId);
  const policyError = validatePasswordPolicy(input.password);
  if (policyError) throw new FormError(policyError);
  const passwordHash = await hashPassword(input.password);

  let updated: User | undefined;
  await getDb().transaction(async (tx) => {
    [updated] = await tx
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
  if (!updated) throw new FormError('Account not found.');
  return updated;
}

async function revokeMemberSessions(actorId: string, userId: string, reason: string): Promise<User> {
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
  return member;
}

// ---------------------------------------------------------------- actions

export async function createMemberAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, memberCreateSchema, formData);
  if (!parsed.ok) return { ...parsed.state, values: withoutPassword(parsed.state.values ?? {}) };
  const values = withoutPassword(parsed.values);

  let created: User;
  try {
    created = await createMember(actor.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, values);
  }
  finishWith(MEMBERS_PAGE, `Member ${created.name} created.`);
}

export async function deactivateMemberAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, memberReasonSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: User;
  try {
    updated = await deactivateMember(actor.id, parsed.data.userId, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(MEMBERS_PAGE, `Member ${updated.name} deactivated.`);
}

export async function activateMemberAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, memberReasonSchema, formData);
  if (!parsed.ok) return parsed.state;

  let updated: User;
  try {
    updated = await activateMember(actor.id, parsed.data.userId, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(MEMBERS_PAGE, `Member ${updated.name} activated.`);
}

export async function resetMemberPasswordAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, memberPasswordResetSchema, formData);
  if (!parsed.ok) return { ...parsed.state, values: withoutPassword(parsed.state.values ?? {}) };
  const values = withoutPassword(parsed.values);

  let updated: User;
  try {
    updated = await resetMemberPassword(actor.id, parsed.data);
  } catch (error) {
    return failureState(previous, error, values);
  }
  finishWith(MEMBERS_PAGE, `Password reset for ${updated.email}.`);
}

export async function revokeMemberSessionsAction(previous: FormState, formData: FormData): Promise<FormState> {
  const actor = await actionUser();
  const parsed = validateForm(previous, memberReasonSchema, formData);
  if (!parsed.ok) return parsed.state;

  let member: User;
  try {
    member = await revokeMemberSessions(actor.id, parsed.data.userId, parsed.data.reason);
  } catch (error) {
    return failureState(previous, error, parsed.values);
  }
  finishWith(MEMBERS_PAGE, `Sessions revoked for ${member.email}.`);
}
