import { NextRequest } from 'next/server';
import { toCsv } from '@/lib/report-export';
import { buildAuditDocument } from '@/server/admin/audit-export';
import { getCurrentUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const document = await buildAuditDocument({
    q: params.get('q') ?? undefined,
    entityType: params.get('entityType') ?? undefined,
    action: params.get('action') ?? undefined,
    actorUserId: params.get('actor') ?? undefined,
    limit: 5000,
  });
  const csv = toCsv(document);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="strapla-audit-${stamp}.csv"`,
    },
  });
}
