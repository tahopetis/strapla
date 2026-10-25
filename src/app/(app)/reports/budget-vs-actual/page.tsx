import type { Metadata } from 'next';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { getBudgetVsActualReport } from '@/server/plan/report-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Budget versus actual' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';
const m3 = <span className="text-slate-400">M3</span>;

export default async function BudgetVsActualPage() {
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getBudgetVsActualReport(plan.id);

  return (
    <ReportShell
      title="Budget versus actual"
      description={`${plan.name} · program level, per fiscal year`}
      reportKey="budget-vs-actual"
    >
      <ReportNote>
        Available = budget + carry-in; unallocated = available − allocations. Committed, spent and prior-year
        settlement columns arrive with M3 (ADR-0003 §3/§4). Capex and opex are shown per component.
      </ReportNote>

      <Card title="Programs" description="Budget availability versus allocation, commitment and spend.">
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
                <th className={th}>Prior-year settlements</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
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
                    <Money value={row.allocatedCapex} />
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap ${row.overCapex ? 'text-red-700' : ''}`}>
                    <Money value={row.unallocatedCapex} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.opexAvailable} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.allocatedOpex} />
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap ${row.overOpex ? 'text-red-700' : ''}`}>
                    <Money value={row.unallocatedOpex} />
                  </td>
                  <td className="py-3 pr-4">{m3}</td>
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
                  <Money value={report.totals.capexAvailable} />
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
                  <Money value={report.totals.allocatedOpex} />
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <Money value={report.totals.unallocatedOpex} />
                </td>
                <td className="py-3 pr-4">{m3}</td>
                <td className="py-3 pr-4">{m3}</td>
                <td className="py-3 pr-4">{m3}</td>
                <td className="py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </ReportShell>
  );
}
