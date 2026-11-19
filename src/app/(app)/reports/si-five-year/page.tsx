import type { Metadata } from 'next';
import {
  CustomFieldCells,
  CustomFieldFilterForm,
  CustomFieldHeaderCells,
} from '@/components/custom-fields';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { matchesCustomFieldFilter } from '@/domain/custom-fields';
import { getCurrentStrategicPlan } from '@/server/plan/queries';
import { loadReportCustomFieldGroups } from '@/server/plan/report-custom-fields';
import { getSiFiveYearReport } from '@/server/plan/report-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SI five-year view' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';

export default async function SiFiveYearPage({
  searchParams,
}: {
  searchParams: Promise<{
    cf?: string | string[];
    cv?: string | string[];
    columns?: string | string[];
  }>;
}) {
  const { cf: cfParam, cv: cvParam, columns } = await searchParams;
  const cf = Array.isArray(cfParam) ? cfParam[0] : cfParam;
  const cv = Array.isArray(cvParam) ? cvParam[0] : cvParam;
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getSiFiveYearReport(plan.id);
  const groups = await loadReportCustomFieldGroups('si-five-year', columns);
  const [group] = groups;
  const fields = group?.fields ?? [];
  const selectedIds = groups.flatMap((candidate) =>
    candidate.selectedFields.map((field) => field.id),
  );
  const visibleFields = group?.selectedFields ?? [];
  const filterField = cf ? fields.find((field) => field.id === cf) : undefined;
  const filterQuery = cv?.trim() ?? '';
  const filtering = filterField !== undefined && filterQuery.length > 0;
  const rows =
    filtering && filterField !== undefined
      ? report.rows.filter((row) =>
          matchesCustomFieldFilter(group?.values.get(row.initiative.id), filterField, filterQuery),
        )
      : report.rows;

  return (
    <ReportShell
      title="SI five-year view"
      description={`${plan.name} · fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
      reportKey="si-five-year"
      exportFields={groups.flatMap((candidate) => candidate.fields)}
      selectedExportFieldIds={groups.flatMap((candidate) =>
        candidate.selectedFields.map((field) => field.id),
      )}
    >
      <ReportNote>
        Committed and spent are the in-app execution figures: fiscal-year commitments and actual spend
        entries (including cross-year settlements of earlier-year commitments). Consumed = prior program
        budget consumed + in-app program budgets; headroom is the envelope remaining (BR-2).
      </ReportNote>

      {fields.length > 0 ? (
        <div className="screen-only">
          <CustomFieldFilterForm
            fields={fields}
            action="/reports/si-five-year"
            fieldId={filterField?.id}
            query={cv}
            columnSelection={columns === undefined ? undefined : selectedIds}
          />
        </div>
      ) : null}

      <Card title="Strategic initiatives" description="Envelope, consumption and headroom across the five-year horizon.">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead>
              <tr>
                <th className={th}>Initiative</th>
                <th className={th}>Envelope</th>
                <th className={th}>Prior consumed</th>
                <th className={th}>Program budgets</th>
                <th className={th}>Allocations</th>
                <th className={th}>Committed</th>
                <th className={th}>Spent</th>
                <th className={th}>Consumed</th>
                <th className={th}>Headroom</th>
                <th className={th}>Status</th>
                <CustomFieldHeaderCells fields={visibleFields} className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.initiative.id}>
                  <td className="py-3 pr-3">
                    <p className="font-medium">{row.initiative.code}</p>
                    <p className="text-slate-600">{row.initiative.name}</p>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.initiative.envelopeAmount} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.initiative.priorProgramBudgetUsed} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.programCapex + row.programOpex} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.allocationCapex + row.allocationOpex} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.commitmentCapex + row.commitmentOpex} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.spendCapex + row.spendOpex} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Money value={row.consumed} />
                  </td>
                  <td className={`py-3 pr-3 whitespace-nowrap ${row.over ? 'text-red-700' : ''}`}>
                    <Money value={row.headroom} />
                  </td>
                  <td className="py-3">
                    {row.over ? (
                      <Badge tone="danger">over envelope</Badge>
                    ) : (
                      <Badge tone="success">within</Badge>
                    )}
                  </td>
                  <CustomFieldCells
                    fields={visibleFields}
                    values={group?.values.get(row.initiative.id)}
                    className="py-3 pr-3"
                  />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-medium">
              <tr>
                <td className="py-3 pr-4">Portfolio total</td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.envelope} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.priorConsumed} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.programCapex + report.totals.programOpex} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.allocationCapex + report.totals.allocationOpex} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.commitmentCapex + report.totals.commitmentOpex} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.spendCapex + report.totals.spendOpex} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.consumed} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Money value={report.totals.headroom} />
                </td>
                <td className="py-3">
                  {report.totals.over ? (
                    <Badge tone="danger">over envelope</Badge>
                  ) : (
                    <Badge tone="success">within</Badge>
                  )}
                </td>
                {visibleFields.map((field) => (
                  <td key={field.id} className="py-3 pr-3" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {filtering ? (
          <p className="mt-3 text-xs text-slate-500">
            Totals cover the whole report, not only the filtered rows.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          Capex and opex are combined here; the annual plan and budget-versus-actual reports show the
          component split.
        </p>
      </Card>
    </ReportShell>
  );
}
