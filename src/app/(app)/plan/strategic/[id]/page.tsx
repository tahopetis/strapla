import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import { listAnnualPlans } from '@/server/plan/annual-queries';
import { listProgramThreads } from '@/server/plan/program-queries';
import { listProjects } from '@/server/plan/project-queries';
import {
  getPlanArchiveInfo,
  getStrategicPlan,
  isFirstStrategicPlan,
  listInitiativeEnvelopeRows,
} from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Archived strategic plan' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

/**
 * The read-only page of an archived strategic plan (#109, ADR-0008 §5). It shows
 * the plan's initiatives with their envelope figures and its annual plans, and
 * offers no write control of any kind. A non-archived plan has no archived page,
 * so an id that is not archived takes the not-found path.
 */
export default async function ArchivedStrategicPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isRecordId(id)) notFound();
  const plan = await getStrategicPlan(id);
  if (!plan || plan.status !== 'archived') notFound();

  const [archiveInfo, rows, annualPlans, programs, projects, firstPlan] = await Promise.all([
    getPlanArchiveInfo(plan.id),
    listInitiativeEnvelopeRows(plan.id),
    listAnnualPlans(plan.id),
    listProgramThreads(plan.id),
    listProjects(plan.id),
    isFirstStrategicPlan(plan),
  ]);
  const programEntries = programs.flatMap((thread) => thread.entries);

  return (
    <div>
      <PageHeader
        title={plan.name}
        description={`Archived strategic plan, read-only. Fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}.`}
        actions={
          <Link href="/plan/strategic" className="text-sm text-slate-600 hover:text-slate-900">
            ← Strategic plan
          </Link>
        }
      />
      <PlanNav />

      <p className="mb-5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        This strategic plan is archived and read-only.
      </p>

      <div className="space-y-6">
        <Card title="Plan details">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="mt-1 font-medium">{plan.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Horizon</dt>
              <dd className="mt-1 font-medium">
                {plan.startFiscalYear}–{plan.endFiscalYear}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Archived</dt>
              <dd className="mt-1 font-medium">
                {archiveInfo?.archivedAt ? formatDate(archiveInfo.archivedAt) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Reason</dt>
              <dd className="mt-1 font-medium">{archiveInfo?.archivedReason ?? '—'}</dd>
            </div>
          </dl>

          {firstPlan ? (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm">
              <Link href={`/plan/opening-balances?plan=${plan.id}`} className={linkClass}>
                Opening balances
              </Link>{' '}
              <span className="text-slate-600">— the signed-off figures recorded for this plan.</span>
            </p>
          ) : null}
        </Card>

        <Card
          title="Strategic initiatives"
          description="Envelope versus prior program budget consumed plus in-app program budgets, per component. A flag never blocks entry."
          actions={<Badge>{rows.length}</Badge>}
        >
          {rows.length === 0 ? (
            <EmptyState>No strategic initiatives in this plan.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Initiative</th>
                    <th className="py-2 pr-4">Component</th>
                    <th className="py-2 pr-4">Envelope</th>
                    <th className="py-2 pr-4">Prior consumed</th>
                    <th className="py-2 pr-4">In-app program budgets</th>
                    <th className="py-2">Headroom</th>
                  </tr>
                </thead>
                {rows.map((row) => (
                  <tbody key={row.initiative.id} className="divide-y divide-slate-100">
                    <tr>
                      <td rowSpan={2} className="py-3 pr-4 align-top">
                        <p className="font-medium">
                          {row.initiative.code} · {row.initiative.name}
                        </p>
                        {row.initiative.owner ? (
                          <p className="text-slate-600">Owner: {row.initiative.owner}</p>
                        ) : null}
                        <p className="mt-1">
                          <Badge tone={row.check.over ? 'danger' : 'success'}>
                            {row.check.over ? 'over envelope' : 'within envelope'}
                          </Badge>
                        </p>
                      </td>
                      <td className="py-3 pr-4 font-medium">Capex</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.initiative.envelopeCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.initiative.priorProgramBudgetUsedCapex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.programCapex} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money
                          value={row.check.capex.remaining}
                          className={row.check.capex.over ? 'font-medium text-red-700' : 'font-medium'}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium">Opex</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.initiative.envelopeOpex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.initiative.priorProgramBudgetUsedOpex} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Money value={row.programOpex} />
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        <Money
                          value={row.check.opex.remaining}
                          className={row.check.opex.over ? 'font-medium text-red-700' : 'font-medium'}
                        />
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Annual plans"
          description="Each fiscal year stays readable from its read-only annual plan page."
          actions={<Badge>{annualPlans.length}</Badge>}
        >
          {annualPlans.length === 0 ? (
            <EmptyState>No annual plans under this plan.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {annualPlans.map((row) => (
                <li
                  key={row.annualPlan.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <Link href={`/plan/annual/${row.annualPlan.id}`} className={linkClass}>
                    FY{row.annualPlan.fiscalYear} annual plan
                  </Link>
                  <StatusBadge status={row.annualPlan.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Programs and projects"
          description="The records that carried the plan's delivery. Each opens its existing read-only page, and a project opens its allocations."
          actions={<Badge>{programEntries.length + projects.length}</Badge>}
        >
          {programEntries.length === 0 && projects.length === 0 ? (
            <EmptyState>No annual programs or projects under this plan.</EmptyState>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Annual programs
                </h3>
                {programEntries.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No annual programs.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {programEntries.map((entry) => (
                      <li key={entry.programId} className="py-2">
                        <Link href={`/plan/programs/${entry.programId}`} className={linkClass}>
                          {entry.code} · {entry.name}
                        </Link>
                        <span className="ml-2 text-xs text-slate-500">
                          FY{entry.fiscalYear} · {entry.siCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</h3>
                {projects.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No projects.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {projects.map((row) => (
                      <li key={row.project.id} className="py-2">
                        <Link href={`/plan/projects/${row.project.id}`} className={linkClass}>
                          {row.project.code} · {row.project.name}
                        </Link>
                        <span className="ml-2 text-xs text-slate-500">
                          FY{row.project.startFiscalYear}–FY{row.project.endFiscalYear} · {row.programCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>

        <p className="text-sm">
          <Link href="/plan/strategic" className={linkClass}>
            ← Back to the strategic plan
          </Link>
        </p>
      </div>
    </div>
  );
}
