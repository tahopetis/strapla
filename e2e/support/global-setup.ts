import { mkdirSync } from 'node:fs';
import postgres from 'postgres';

/**
 * The suite owns a fresh database: it creates the first administrator through
 * /setup, which the app refuses once any user exists. Fail here, with a message
 * that says what to do, instead of letting every spec fail on stale state.
 *
 * Also creates e2e/.auth so the foundation can save the signed-in state.
 */
function maskUrl(raw: string): string {
  return raw.replace(/:\/\/([^:/@]+):([^@/]+)@/, '://$1:***@');
}

export default async function globalSetup(): Promise<void> {
  mkdirSync('e2e/.auth', { recursive: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create an empty database, run `pnpm db:migrate`, and export DATABASE_URL before running `pnpm e2e`.',
    );
  }

  const sql = postgres(url, { max: 1 });
  try {
    let users: number;
    try {
      const rows = await sql<{ count: string }[]>`select count(*)::text as count from users`;
      users = Number(rows[0]?.count ?? '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The e2e database at ${maskUrl(url)} is not migrated (${message}). Run \`pnpm db:migrate\` against it first.`,
      );
    }
    if (users > 0) {
      throw new Error(
        `The e2e suite needs a database with no users: found ${users}. It starts from /setup, which the app refuses once an account exists. Create a fresh database (for example strapla_e2e), run \`pnpm db:migrate\`, and point DATABASE_URL at it.`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
