import type { Metadata } from 'next';
import {
  CustomFieldCells,
  CustomFieldFilterForm,
  CustomFieldHeaderCells,
} from '@/components/custom-fields';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { matchesAllCustomFieldFilters, resolveCustomFieldFilters } from '@/domain/custom-fields';
import { getAnnualPlanReport } from '@/server/plan/report-queries';
import {
  loadReportCustomFieldGroups,
  readRememberedReportColumns,
} from '@/server/plan/report-custom-fields';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annual plan report' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';

export default async function AnnualPlanReportPage({
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
  const report = await getAnnualPlanReport(plan.id);
  const remembered = await readRememberedReportColumns('annual-plan', columns);
  const groups = await loadReportCustomFieldGroups('annual-plan', columns, remembered);
  const [programGroup, recurringGroup] = groups;
  const fields = groups.flatMap((candidate) => candidate.fields);
  const selectedIds = groups.flatMap((candidate) =>
    candidate.selectedFields.map((field) => field.id),
  );
  const programVisibleFields = programGroup?.selectedFields ?? [];
  const recurringVisibleFields = recurringGroup?.selectedFields ?? [];
  // Repeated cf/cv pairs narrow the rows together (AND, #74). A filter belongs
  // to the table of its own entity, so a program filter never hides a
  // recurring ops row; totals and the export above stay whole-report.
  const filters = resolveCustomFieldFilters(fields, cfParam, cvParam);
  const programFilters = filters.filter((filter) => filter.field.entityType === 'annual_program');
  const recurringFilters = filters.filter(
    (filter) => filter.field.entityType === 'recurring_ops_item',
  );
  const programRows =
    programFilters.length > 0
      ? report.programs.filter((row) =>
          matchesAllCustomFieldFilters(programGroup?.values.get(row.programId), programFilters),
        )
      : report.programs;
  const recurringRows =
    recurringFilters.length > 0
      ? report.recurringOps.filter((row) =>
          matchesAllCustomFieldFilters(
            recurringGroup?.values.get(row.itemId),
            recurringFilters,
          ),
        )
      : report.recurringOps;
  const recurringCommitments = report.recurringOps.reduce((sum, row) => sum + row.commitmentOpex, 0);
  const recurringSpend = report.recurringOps.reduce((sum, row) => sum + row.spendOpex, 0);
  const recurringPriorOpening = report.recurringOps.reduce(
    (sum, row) => sum + row.priorOpeningOpex,
    0,
  );
  const recurringRemaining = report.recurringOps.reduce((sum, row) => sum + row.remainingOpex, 0);

  return (
    <ReportShell
      title="Annual plan by SI and program"
      description={`${plan.name} · fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
      reportKey="annual-plan"
      exportFields={groups.flatMap((candidate) => candidate.fields)}
      selectedExportFieldIds={groups.flatMap((candidate) =>
        candidate.selectedFields.map((field) => field.id),
      )}
    >
      <ReportNote>
        Available = effective budget (initial budget plus posted budget revisions) + carry-in; unallocated =
        available − allocations, per component (BR-7).
        Committed and spent are the in-app execution figures; recurring ops show their own committed, spent,
        prior-year opening and remaining amounts.
      </ReportNote>

      {fields.length > 0 ? (
        <div className="screen-only">
          <CustomFieldFilterForm
            fields={fields}
            action="/reports/annual-plan"
            filters={filters}
            columnSelection={columns === undefined ? undefined : selectedIds}
          />
        </div>
      ) : null}

      <Card title="Annual programs" description="One row per program, ordered by fiscal year.">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr>
                <th className={th}>FY</th>
                <th className={th}>SI / program</th>
                <th className={th}>Capex available</th>
                <th className={th}>Capex allocated</th>
                <th className={th}>Capex unallocated</th>
                <th className={th}>Opex available</th>
                <th className={th}>Opex allocated</th>
                <th className={th}>Opex unallocated</th>
                <th className={th}>Committed</th>
                <th className={th}>Spent</th>
                <th className={th}>Status</th>
                <CustomFieldHeaderCells fields={programVisibleFields} className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programRows.map((row) => (
                <tr key={`${row.fiscalYear}-${row.programCode}`}>
                  <td className="py-3 pr-4 whitespace-nowrap">{row.fiscalYear}</td>
                  <td className="py-3 pr-4">
                    <p className="font-medium">
                      {row.siCode} · {row.programCode}
                    </p>
                    <p className="text-slate-600">{row.programName}</p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.availableCapex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.allocatedCapex} />
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap ${row.overCapex ? 'text-red-700' : ''}`}>
                    <Money value={row.unallocatedCapex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.availableOpex} />
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
                  <td className="py-3">
                    {row.overCapex || row.overOpex ? (
                      <Badge tone="danger">over-allocated</Badge>
                    ) : (
                      <Badge tone="success">within</Badge>
                    )}
                  </td>
                  <CustomFieldCells
                    fields={programVisibleFields}
                    values={programGroup?.values.get(row.programId)}
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
                  <Money value={report.totals.effectiveCapexBudget + report.totals.carryInCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.effectiveOpexBudget + report.totals.carryInOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.programs.reduce((sum, row) => sum + row.commitmentCapex + row.commitmentOpex, 0)} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.programs.reduce((sum, row) => sum + row.spendCapex + row.spendOpex, 0)} />
                </td>
                <td className="py-3" />
                {programVisibleFields.map((field) => (
                  <td key={field.id} className="py-3 pr-4" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {programFilters.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Totals cover the whole report, not only the filtered rows.
          </p>
        ) : null}
      </Card>

      <Card title="Recurring operations" description="Opex-only annual budget items, not linked to an SI.">
        {report.recurringOps.length === 0 ? (
          <p className="text-sm text-slate-600">No recurring ops items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>FY</th>
                  <th className={th}>Item</th>
                  <th className={th}>Category</th>
                  <th className={th}>Opex budget</th>
                  <th className={th}>Opex carry-in</th>
                  <th className={th}>Available</th>
                  <th className={th}>Committed</th>
                  <th className={th}>Spent</th>
                  <th className={th}>Prior-year openings</th>
                  <th className={th}>Remaining</th>
                  <CustomFieldHeaderCells fields={recurringVisibleFields} className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recurringRows.map((row) => (
                  <tr key={`${row.fiscalYear}-${row.name}`}>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.fiscalYear}</td>
                    <td className="py-3 pr-4 font-medium">{row.name}</td>
                    <td className="py-3 pr-4 text-slate-600">{row.categoryName ?? '—'}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.opexBudget} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.carryInOpex} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.available} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.commitmentOpex} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.spendOpex} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.priorOpeningOpex} />
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <Money value={row.remainingOpex} />
                    </td>
                    <CustomFieldCells
                      fields={recurringVisibleFields}
                      values={recurringGroup?.values.get(row.itemId)}
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
                    <Money value={report.totals.recurringOpexBudget} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={report.totals.recurringCarryInOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={report.totals.recurringOpexBudget + report.totals.recurringCarryInOpex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={recurringCommitments} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={recurringSpend} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={recurringPriorOpening} />
                  </td>
                  <td className="py-3 whitespace-nowrap">
                    <Money value={recurringRemaining} />
                  </td>
                  {recurringVisibleFields.map((field) => (
                    <td key={field.id} className="py-3 pr-4" />
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {recurringFilters.length > 0 && report.recurringOps.length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Totals cover the whole report, not only the filtered rows.
          </p>
        ) : null}
      </Card>
    </ReportShell>
  );
}
