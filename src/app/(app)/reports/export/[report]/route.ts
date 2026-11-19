import { getCurrentUser } from '@/server/auth/session';
import { toCsv, toXlsx } from '@/lib/report-export';
import { getCurrentStrategicPlan } from '@/server/plan/queries';
import { loadReportCustomFieldGroups } from '@/server/plan/report-custom-fields';
import {
  buildReportDocument,
  REPORT_TITLES,
  type ReportKey,
} from '@/server/plan/report-tables';

export const dynamic = 'force-dynamic';

const REPORT_KEYS = Object.keys(REPORT_TITLES) as ReportKey[];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorised', { status: 401 });

  const { report } = await params;
  if (!REPORT_KEYS.includes(report as ReportKey)) {
    return new Response('Unknown report', { status: 404 });
  }

  const plan = await getCurrentStrategicPlan();
  if (!plan) return new Response('No strategic plan', { status: 404 });

  const searchParams = new URL(request.url).searchParams;
  // The export form posts one `columns` value per ticked field (plus a blank one).
  // No `columns` parameter at all means "every active custom field".
  const columns = searchParams.getAll('columns');
  const groups = await loadReportCustomFieldGroups(
    report as ReportKey,
    columns.length === 0 ? undefined : columns,
  );
  const document = await buildReportDocument(report as ReportKey, plan.id, plan.name, groups);
  const format = searchParams.get('format');
  const base = `${report}-${plan.startFiscalYear}-${plan.endFiscalYear}`;

  if (format === 'xlsx') {
    const bytes = await toXlsx(document);
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="strapla-${base}.xlsx"`,
        'cache-control': 'no-store',
      },
    });
  }

  return new Response(toCsv(document), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="strapla-${base}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
