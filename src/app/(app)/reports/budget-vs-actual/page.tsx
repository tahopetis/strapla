import type { Metadata } from 'next';
import {
  CustomFieldCells,
  CustomFieldFilterForm,
  CustomFieldHeaderCells,
} from '@/components/custom-fields';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { matchesAllCustomFieldFilters, resolveCustomFieldFilters } from '@/domain/custom-fields';
import { getBudgetVsActualReport } from '@/server/plan/report-queries';
import {
  loadReportCustomFieldGroups,
  readRememberedReportColumns,
} from '@/server/plan/report-custom-fields';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Budget versus actual' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';

export default async function BudgetVsActualPage({
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
  const report = await getBudgetVsActualReport(plan.id);
  const remembered = await readRememberedReportColumns('budget-vs-actual', columns);
  const groups = await loadReportCustomFieldGroups('budget-vs-actual', columns, remembered);
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
          matchesAllCustomFieldFilters(group?.values.get(row.programId), filters),
        )
      : report.rows;
  // Post-close adjustment line for a closed year (#98): reserve-treated
  // closed-year settlements, outside the locked close snapshot and carry-over.
  const postCloseRows = report.rows.filter(
    (row) => row.postCloseReserveCapex + row.postCloseReserveOpex > 0,
  );

  return (
    <ReportShell
      title="Budget versus actual"
      description={`${plan.name} · program level, per fiscal year`}
      reportKey="budget-vs-actual"
      exportFields={groups.flatMap((candidate) => candidate.fields)}
      selectedExportFieldIds={groups.flatMap((candidate) =>
        candidate.selectedFields.map((field) => field.id),
      )}
    >
      <ReportNote>
        Available = effective budget (initial budget plus posted budget revisions) + carry-in;
        unallocated = available − allocations. Committed and spent are the
        in-app execution figures; prior-year settlements are spend paying earlier-year commitments (excluded
        from the current year, ADR-0003 §4); prior-year opening payments settle pre-app commitments. A
        post-close adjustment is a closed-year settlement kept as a reserve in its closed year, shown
        separately and never part of the locked close snapshot or carry-over figures. Capex and opex are
        shown per component.
      </ReportNote>

      {fields.length > 0 ? (
        <div className="screen-only">
          <CustomFieldFilterForm
            fields={fields}
            action="/reports/budget-vs-actual"
            filters={filters}
            columnSelection={columns === undefined ? undefined : selectedIds}
          />
        </div>
      ) : null}

      <Card title="Programs" description="Budget availability versus allocation, commitment and spend.">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr>
                <th className={th}>FY</th>
                <th className={th}>SI / program</th>
                <th className={th}>Capex available</th>
                <th className={th}>Capex carry-in (included)</th>
                <th className={th}>Capex allocated</th>
                <th className={th}>Capex unallocated</th>
                <th className={th}>Opex available</th>
                <th className={th}>Opex carry-in (included)</th>
                <th className={th}>Opex allocated</th>
                <th className={th}>Opex unallocated</th>
                <th className={th}>Committed</th>
                <th className={th}>Spent</th>
                <th className={th}>Prior-year settlements</th>
                <th className={th}>Prior-year openings</th>
                <th className={th}>Status</th>
                <CustomFieldHeaderCells fields={visibleFields} className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={`${row.fiscalYear}-${row.programCode}`}>
                  <td className="py-3 pr-4 whitespace-nowrap">{row.fiscalYear}</td>
                  <td className="py-3 pr-4">
                    <p className="font-medium">
                      {row.siCode} · {row.programCode}
                    </p>
                    <p className="text-slate-600">{row.programName}</p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.capexAvailable} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.carryInCapex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.allocatedCapex} />
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap ${row.overCapex ? 'text-red-700' : ''}`}>
                    <Money value={row.unallocatedCapex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.opexAvailable} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.carryInOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.allocatedOpex} />
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap ${row.overOpex ? 'text-red-700' : ''}`}>
                    <Money value={row.unallocatedOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.commitmentCapex + row.commitmentOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.spendCapex + row.spendOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.settlementCapex + row.settlementOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.priorOpeningCapex + row.priorOpeningOpex} />
                  </td>
                  <td className="py-3">
                    {row.overCapex || row.overOpex ? (
                      <Badge tone="danger">over-allocated</Badge>
                    ) : (
                      <Badge tone="success">within</Badge>
                    )}
                  </td>
                  <CustomFieldCells
                    fields={visibleFields}
                    values={group?.values.get(row.programId)}
                    className="py-3 pr-4"
                  />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-medium">
              <tr>
                <td className="py-3 pr-4" colSpan={2}>
                  Total
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.capexAvailable} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.carryInCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.opexAvailable} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.carryInOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.commitmentCapex + report.totals.commitmentOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.spendCapex + report.totals.spendOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.settlementCapex + report.totals.settlementOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.priorOpeningCapex + report.totals.priorOpeningOpex} />
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
      </Card>

      <Card
        title="Post-close adjustments (reserve)"
        description="Closed-year settlements kept in the closed year, per commitment fiscal year. These figures sit outside the locked close snapshot and never change the carry-over."
      >
        {postCloseRows.length === 0 ? (
          <p className="text-sm text-slate-600">No post-close reserves recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>Commitment FY</th>
                  <th className={th}>SI / program</th>
                  <th className={th}>Capex reserve</th>
                  <th className={th}>Opex reserve</th>
                  <th className={th}>Total reserve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {postCloseRows.map((row) => (
                  <tr key={`post-close-${row.fiscalYear}-${row.programCode}`}>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.fiscalYear}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {row.siCode} · {row.programCode}
                      </p>
                      <p className="text-slate-600">{row.programName}</p>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.postCloseReserveCapex} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.postCloseReserveOpex} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.postCloseReserveCapex + row.postCloseReserveOpex} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </ReportShell>
  );
}
