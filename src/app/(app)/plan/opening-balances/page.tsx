import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { getOpeningBalancesOverview } from '@/server/plan/opening-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Opening balances' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function OpeningBalancesPage() {
  const plan = await getCurrentStrategicPlan();

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Opening balances"
          description="The signed-off bridge from the spreadsheets into Strapla."
        />
        <PlanNav />
        <EmptyState>
          No strategic plan yet. Opening balances are recorded against the plan, its initiatives, annual
          programs and projects.
        </EmptyState>
        <p className="mt-4">
          <Link href="/plan/strategic" className={linkClass}>
            Go to the strategic plan
          </Link>
        </p>
      </div>
    );
  }

  const overview = await getOpeningBalancesOverview(plan.id);
  const { totals } = overview;

  return (
    <div>
      <PageHeader
        title="Opening balances"
        description={`The signed-off bridge from the FY2026 spreadsheets into the app. FY2027 is the first in-app fiscal year; FY2026 is closed manually outside Strapla (charter §6.9).`}
        actions={
          <Link href="/plan/strategic" className="text-sm text-slate-600 hover:text-slate-900">
            Manage strategic plan
          </Link>
        }
      />
      <PlanNav />

      <div className="space-y-6">
        <Card title="Where opening figures are entered" description="One-time data, audited like any other financial change.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <strong>Per strategic initiative</strong>: prior program budget consumed — edit the initiative on{' '}
              <Link href="/plan/strategic" className={linkClass}>
                the strategic plan page
              </Link>
              .
            </li>
            <li>
              <strong>Per annual program</strong>: capex and opex carry-in from the manual FY2026 close — edit the
              program on{' '}
              <Link href="/plan/annual" className={linkClass}>
                the annual plan page
              </Link>
              .
            </li>
            <li>
              <strong>Per project</strong>: opening allocated budget, opening open commitments and opening actual
              spend — edit the project on{' '}
              <Link href="/plan/projects" className={linkClass}>
                the project page
              </Link>
              .
            </li>
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            Project year allocation carry-in is entered when the annual allocations are created in M2 (#12).
            Reconciliation below shows the totals you can compare with the spreadsheets before go-live.
          </p>
        </Card>

        <Card
          title="Initiatives — envelope reconciliation"
          description="Envelope versus prior program budget consumed plus in-app program budgets (BR-2)."
        >
          {overview.initiatives.length === 0 ? (
            <EmptyState>No strategic initiatives yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Initiative</th>
                    <th className="py-2 pr-4">Envelope</th>
                    <th className="py-2 pr-4">Prior consumed</th>
                    <th className="py-2 pr-4">In-app programs</th>
                    <th className="py-2 pr-4">Headroom</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.initiatives.map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.code}</p>
                        <p className="text-slate-600">{row.name}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.envelopeAmount} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.priorProgramBudgetUsed} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.programBudget} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.check.remaining} />
                      </td>
                      <td className="py-3">
                        {row.check.over ? (
                          <Badge tone="danger">over envelope</Badge>
                        ) : (
                          <Badge tone="success">within</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Annual programs — carry-in"
          description="Budget plus carry-in per component. Project allocations against these budgets land in M2."
        >
          {overview.programs.length === 0 ? (
            <EmptyState>No annual programs yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Program</th>
                    <th className="py-2 pr-4">SI</th>
                    <th className="py-2 pr-4">Capex budget</th>
                    <th className="py-2 pr-4">Capex carry-in</th>
                    <th className="py-2 pr-4">Capex available</th>
                    <th className="py-2 pr-4">Opex budget</th>
                    <th className="py-2 pr-4">Opex carry-in</th>
                    <th className="py-2">Opex available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.programs.map((row) => (
                    <tr key={row.program.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.program.code}</p>
                        <p className="text-slate-600">
                          {row.program.name} · FY{row.fiscalYear}
                        </p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">{row.siCode}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.capexBudget} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.carryInCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.capexAvailable} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.opexBudget} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.program.carryInOpex} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money value={row.opexAvailable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Projects — opening position"
          description="Opening allocated / open commitments / actual spend before the app, plus the full-life allocated budget."
        >
          {overview.projects.length === 0 ? (
            <EmptyState>No projects yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4">Program / SI</th>
                    <th className="py-2 pr-4">Opening allocated</th>
                    <th className="py-2 pr-4">Opening committed</th>
                    <th className="py-2 pr-4">Opening spent</th>
                    <th className="py-2">Full-life allocated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.projects.map((row) => (
                    <tr key={row.project.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.project.code}</p>
                        <p className="text-slate-600">{row.project.name}</p>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {row.programCode} · {row.siCode}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingAllocated} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingCommitted} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.project.openingSpent} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money value={row.project.allocatedBudgetFullLife} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Reconciliation totals"
          description="Compare these totals with the FY2026 spreadsheets and the manual year-close figures; sign off once they match."
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-slate-500">Total envelope</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.envelope} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Prior program budget consumed</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.priorProgramBudgetUsed} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">In-app program budgets</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.inAppProgramBudgets} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Program carry-in (capex / opex)</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.programCarryInCapex} /> / <Money value={totals.programCarryInOpex} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Project opening allocated / committed / spent</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.projectOpeningAllocated} /> / <Money value={totals.projectOpeningCommitted} /> /{' '}
                <Money value={totals.projectOpeningSpent} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Project full-life allocated</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={totals.projectFullLifeAllocated} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Opening figures are audited edits. The reconciliation is a sign-off aid, not an automated check: the
            spreadsheets remain the source for FY2026 and earlier.
          </p>
        </Card>
      </div>
    </div>
  );
}
