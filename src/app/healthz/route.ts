import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json(
      { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('health check failed', error);
    return Response.json(
      { status: 'error', database: 'unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
