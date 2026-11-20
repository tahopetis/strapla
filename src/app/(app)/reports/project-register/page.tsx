import type { Metadata } from 'next';
import {
  CustomFieldCells,
  CustomFieldFilterForm,
  CustomFieldHeaderCells,
} from '@/components/custom-fields';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { matchesAllCustomFieldFilters, resolveCustomFieldFilters } from '@/domain/custom-fields';
import { getProjectRegisterReport } from '@/server/plan/report-queries';
import {
  loadReportCustomFieldGroups,
  readRememberedReportColumns,
} from '@/server/plan/report-custom-fields';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Project register report' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';

export default async function ProjectRegisterReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    cf?: string | string[];
    cv?: string | string[];
    columns?: string | string[];
  }>;
}) {
  const { cf: cfParam, cv: cvParam, columns } = await searchParams;
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getProjectRegisterReport(plan.id);
  const remembered = await readRememberedReportColumns('project-register', columns);
  const groups = await loadReportCustomFieldGroups('project-register', columns, remembered);
  const [group] = groups;
  const fields = group?.fields ?? [];
  const selectedIds = groups.flatMap((candidate) =>
    candidate.selectedFields.map((field) => field.id),
  );
  const visibleFields = group?.selectedFields ?? [];
  // Repeated cf/cv pairs narrow the rows together (AND, #74); totals and the
  // export above stay whole-report because they never see these filters.
  const filters = resolveCustomFieldFilters(fields, cfParam, cvParam);
  const rows =
    filters.length > 0
      ? report.rows.filter((row) =>
          matchesAllCustomFieldFilters(group?.values.get(row.project.id), filters),
        )
      : report.rows;

  return (
    <ReportShell
      title="Project register"
      description={`${plan.name} · ${rows.length} project${rows.length === 1 ? '' : 's'}`}
      reportKey="project-register"
      exportFields={groups.flatMap((candidate) => candidate.fields)}
      selectedExportFieldIds={groups.flatMap((candidate) =>
        candidate.selectedFields.map((field) => field.id),
      )}
    >
      <ReportNote>
        Lifetime commitments = opening committed + in-app commitment entries; spent to date = opening spend +
        in-app spend entries (ADR-0003). Prior-year opening payments settle pre-app commitments and are shown
        separately. Flags are from the funding flag engine (ADR-0003 §6) and never block entry.
      </ReportNote>

      {fields.length > 0 ? (
        <div className="screen-only">
          <CustomFieldFilterForm
            fields={fields}
            action="/reports/project-register"
            filters={filters}
            columnSelection={columns === undefined ? undefined : selectedIds}
          />
        </div>
      ) : null}

      <Card title="Projects" description="Full-life figures, allocations and funding flags.">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr>
                <th className={th}>Project</th>
                <th className={th}>SI / program</th>
                <th className={th}>Years</th>
                <th className={th}>Full-life allocated</th>
                <th className={th}>Approved</th>
                <th className={th}>Final deal</th>
                <th className={th}>Allocated</th>
                <th className={th}>Lifetime commitments</th>
                <th className={th}>Spent to date</th>
                <th className={th}>Flags</th>
                <CustomFieldHeaderCells fields={visibleFields} className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.project.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{row.project.code}</p>
                    <p className="text-slate-600">{row.project.name}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <p>
                      {row.siCode} · {row.programCode}
                    </p>
                    <p className="text-slate-600">{row.siName}</p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {row.project.startFiscalYear}–{row.project.endFiscalYear}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.project.allocatedBudgetFullLife} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.approvedAmount} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.finalDealPrice} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.totalAllocated} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.lifetimeCommitments} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.spentToDate} />
                  </td>
                  <td className="py-3">
                    {row.project.status === 'cancelled' ? <Badge tone="danger">cancelled</Badge> : null}
                    {row.flags.length === 0 ? (
                      <Badge tone="success">ok</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.flags.map((flag) => (
                          <Badge
                            key={flag.code}
                            tone={
                              flag.code === 'above_submitted_price' ||
                              flag.code === 'project_allocations_over_full_life'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {flag.code}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <CustomFieldCells
                    fields={visibleFields}
                    values={group?.values.get(row.project.id)}
                    className="py-3 pr-4"
                  />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-medium">
              <tr>
                <td className="py-3 pr-4" colSpan={3}>
                  Total
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.fullLifeAllocated} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.approved} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.finalDeal} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocated} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.lifetimeCommitments} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.spentToDate} />
                </td>
                <td className="py-3" />
                {visibleFields.map((field) => (
                  <td key={field.id} className="py-3 pr-4" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {filters.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Totals cover the whole report, not only the filtered rows.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
            Open commitments: <Money value={report.totals.openCommitments} /> · prior-year opening settlements:{' '}
            <Money value={report.totals.priorOpeningSettlements} /> · in-app spend:{' '}
            <Money value={report.totals.inAppSpend} />. The CSV/XLSX export also carries the capex/opex component
            split, carry-in and submitted price per project.
          </p>
      </Card>
    </ReportShell>
  );
}
