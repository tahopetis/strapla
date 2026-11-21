import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

/**
 * Direct database access for test setup that is not the behaviour under test:
 * creating a member before a sign-in check, minting a session for a boundary
 * case, or asserting that a "validate only" path wrote nothing.
 *
 * One short-lived connection per helper call keeps a stray pool from holding the
 * worker process open after the run.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set for the e2e suite.');
  return url;
}

export async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash?: string;
  isActive?: boolean;
}

/** Creates (or reactivates) a member and returns its id. */
export async function createUser(input: CreateUserInput): Promise<string> {
  return withSql(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      insert into users (email, name, password_hash, is_active)
      values (
        ${input.email},
        ${input.name},
        ${input.passwordHash ?? 'e2e-no-login'},
        ${input.isActive ?? true}
      )
      on conflict (email) do update
        set name = excluded.name, is_active = excluded.is_active
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not create the test member ${input.email}.`);
    return id;
  });
}

/** Inserts a database session and returns the token the cookie should carry. */
export async function mintSessionToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await withSql(async (sql) => {
    await sql`
      insert into sessions (user_id, token_hash, expires_at)
      values (${userId}, ${tokenHash}, now() + interval '1 day')
    `;
  });
  return token;
}

export async function countRows(table: 'users' | 'audit_entries'): Promise<number> {
  return withSql(async (sql) => {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from ${sql(table)}
    `;
    return Number(rows[0]?.count ?? '0');
  });
}
