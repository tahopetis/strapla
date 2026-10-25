import type { Metadata } from 'next';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { getAnnualPlanReport } from '@/server/plan/report-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annual plan report' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';
const m3 = <span className="text-slate-400">M3</span>;

export default async function AnnualPlanReportPage() {
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getAnnualPlanReport(plan.id);

  return (
    <ReportShell
      title="Annual plan by SI and program"
      description={`${plan.name} · fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
      reportKey="annual-plan"
    >
      <ReportNote>
        Available = budget + carry-in; unallocated = available − allocations, per component (BR-7). Commitments
        and spend arrive with M3.
      </ReportNote>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.programs.map((row) => (
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
                  <td className="py-3 pr-4">{m3}</td>
                  <td className="py-3 pr-4">{m3}</td>
                  <td className="py-3">
                    {row.overCapex || row.overOpex ? (
                      <Badge tone="danger">over-allocated</Badge>
                    ) : (
                      <Badge tone="success">within</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-medium">
              <tr>
                <td className="py-3 pr-4" colSpan={2}>
                  Total
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.capexBudget + report.totals.carryInCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedCapex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.opexBudget + report.totals.carryInOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.allocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedOpex} />
                </td>
                <td className="py-3 pr-4">{m3}</td>
                <td className="py-3 pr-4">{m3}</td>
                <td className="py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.recurringOps.map((row) => (
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
                    <td className="py-3 whitespace-nowrap">
                      <Money value={row.available} />
                    </td>
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
                  <td className="py-3 whitespace-nowrap">
                    <Money value={report.totals.recurringOpexBudget + report.totals.recurringCarryInOpex} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </ReportShell>
  );
}
