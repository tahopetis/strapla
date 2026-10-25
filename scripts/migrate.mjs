import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required to run migrations');
  process.exit(1);
}

/**
 * Reference data seeded idempotently after migrations. Administrators can add
 * or deactivate categories later (charter §11 Q-resolved: admin-managed list).
 */
const DEFAULT_SPEND_CATEGORIES = [
  'Hardware',
  'Software & Licenses',
  'Cloud & Hosting',
  'Professional Services',
  'Maintenance & Support',
  'Connectivity',
  'Training',
  'Other',
];

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  for (const [index, name] of DEFAULT_SPEND_CATEGORIES.entries()) {
    await sql`insert into spend_categories (name, sort_order) values (${name}, ${index}) on conflict (name) do nothing`;
  }
  console.log('migrations applied; reference data seeded');
} finally {
  await sql.end({ timeout: 5 });
}
