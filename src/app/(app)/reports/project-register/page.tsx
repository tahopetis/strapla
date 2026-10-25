import type { Metadata } from 'next';
import { ReportNote, ReportShell } from '@/components/report-shell';
import { Badge, Card, Money } from '@/components/ui';
import { getProjectRegisterReport } from '@/server/plan/report-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Project register report' };

const th = 'py-2 pr-4 text-left text-xs uppercase tracking-wide text-slate-500';
const m3 = <span className="text-slate-400">M3</span>;

export default async function ProjectRegisterReportPage() {
  const plan = await getCurrentStrategicPlan();
  if (!plan) {
    return <p className="text-sm text-slate-600">Create the strategic plan to see this report.</p>;
  }
  const report = await getProjectRegisterReport(plan.id);

  return (
    <ReportShell
      title="Project register"
      description={`${plan.name} · ${report.rows.length} project${report.rows.length === 1 ? '' : 's'}`}
      reportKey="project-register"
    >
      <ReportNote>
        Lifetime commitments include the opening committed amount; in-app commitments and actual spend arrive
        with M3. Flags are from the funding flag engine (ADR-0003 §6) and never block entry.
      </ReportNote>

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
                <th className={th}>Lifetime committed</th>
                <th className={th}>Spent to date</th>
                <th className={th}>Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
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
                    <Money value={row.project.openingCommitted} />
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Money value={row.project.openingSpent} />
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
                  <Money value={report.totals.openingSpent} />
                </td>
                <td className="py-3">{m3}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The CSV/XLSX export also carries the capex/opex component split, carry-in and submitted price per
          project.
        </p>
      </Card>
    </ReportShell>
  );
}
