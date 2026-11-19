import { isOpeningDataSetId } from '@/lib/opening-import/field-list';
import { buildCsvTemplate, buildXlsxTemplate, templateFileName } from '@/lib/opening-import/template';
import { requireUser } from '@/server/auth/session';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';

/** Template download for the opening import wizard (W3b). */
export async function GET(request: Request): Promise<Response> {
  await requireUser();

  const url = new URL(request.url);
  const dataSet = url.searchParams.get('dataSet') ?? '';
  if (!isOpeningDataSetId(dataSet)) {
    return new Response('Unknown opening data set.', { status: 404 });
  }
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';

  const plan = await getCurrentStrategicPlan();
  if (!plan) return new Response('No strategic plan yet.', { status: 404 });

  const fileName = templateFileName(dataSet, format);
  const disposition = `attachment; filename="${fileName}"`;
  const options = { dataSet, closingFiscalYear: plan.startFiscalYear };

  if (format === 'csv') {
    return new Response(buildCsvTemplate(options), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': disposition,
      },
    });
  }

  const bytes = await buildXlsxTemplate(options);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(new Blob([body], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
    headers: { 'Content-Disposition': disposition },
  });
}
