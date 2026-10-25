import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let client: postgres.Sql | undefined;
let database: Db | undefined;

/**
 * Lazy database handle. Keeping the connection lazy means `next build` and
 * unit tests never require a live database.
 */
export function getDb(): Db {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  client = postgres(url, { max: 10 });
  database = drizzle(client, { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}
