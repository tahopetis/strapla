import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, Money, PageHeader, StatusBadge } from '@/components/ui';
import { getProgramThread } from '@/server/plan/program-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Program thread' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';
const linkClass = 'underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function ProgramThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await getProgramThread(id);
  if (!thread) notFound();

  const current = thread.entries.find((entry) => entry.program.id === thread.currentId) ?? thread.entries[0];
  if (!current) notFound();
  const currentIndex = thread.entries.indexOf(current);
  const previous = currentIndex > 0 ? thread.entries[currentIndex - 1] : null;
  const firstYear = thread.entries[0]?.annualPlan.fiscalYear;
  const lastYear = thread.entries[thread.entries.length - 1]?.annualPlan.fiscalYear;
  const reconcileRows = thread.entries.filter(
    (entry) => entry.carryOver.capex + entry.carryOver.opex > 0,
  );

  return (
    <div>
      <PageHeader
        title={`${current.program.code} · ${current.program.name}`}
        description={`${current.si.code} · ${current.si.name} · program thread FY${firstYear}${
          lastYear && lastYear !== firstYear ? `–FY${lastYear}` : ''
        }`}
        actions={
          <Link
            href={`/plan/annual/${current.annualPlan.id}`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← FY{current.annualPlan.fiscalYear} annual plan
          </Link>
        }
      />
      <PlanNav />

      <div className="space-y-6">
        <Card
          title="Program thread"
          description="A program continues into the next annual plan; program-level carry-over lands as carry-in on the continuation program."
          actions={<Badge>{thread.entries.length} year{thread.entries.length === 1 ? '' : 's'}</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>Fiscal year</th>
                  <th className={th}>Program</th>
                  <th className={th}>Plan status</th>
                  <th className={th}>Budget (capex / opex)</th>
                  <th className={th}>Carry-in (capex / opex)</th>
                  <th className={th}>Allocated (capex / opex)</th>
                  <th className={th}>Unallocated (capex / opex)</th>
                  <th className={th}>Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {thread.entries.map((entry) => {
                  const isCurrent = entry.program.id === thread.currentId;
                  return (
                    <tr key={entry.program.id} className={isCurrent ? 'bg-slate-50' : undefined}>
                      <td className="py-3 pr-3 whitespace-nowrap font-medium">FY{entry.annualPlan.fiscalYear}</td>
                      <td className="py-3 pr-3">
                        {isCurrent ? (
                          <div>
                            <p className="font-medium">{entry.program.code}</p>
                            <p className="text-slate-600">{entry.program.name}</p>
                          </div>
                        ) : (
                          <Link href={`/plan/programs/${entry.program.id}`} className={linkClass}>
                            <span className="font-medium">{entry.program.code}</span>
                            <br />
                            <span className="text-slate-600">{entry.program.name}</span>
                          </Link>
                        )}
                        {isCurrent ? <Badge tone="info">current</Badge> : null}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={entry.annualPlan.status} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={entry.program.capexBudget} /> / <Money value={entry.program.opexBudget} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={entry.program.carryInCapex} /> / <Money value={entry.program.carryInOpex} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={entry.allocatedCapex} /> / <Money value={entry.allocatedOpex} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={entry.position.capex.unallocated} /> /{' '}
                        <Money value={entry.position.opex.unallocated} />
                      </td>
                      <td className="py-3 pr-3">{entry.projectCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Carry-in reconciliation"
          description="Carry-over recorded at the prior year close versus the carry-in on the continuation program."
        >
          {reconcileRows.length === 0 ? (
            <p className="text-sm text-slate-600">
              No close-recorded carry-over in this thread yet. Program carry-in can also come from the opening
              balances.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr>
                    <th className={th}>Target year</th>
                    <th className={th}>From close (capex / opex)</th>
                    <th className={th}>Approval reference</th>
                    <th className={th}>Carry-in on program (capex / opex)</th>
                    <th className={th}>Reconciliation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconcileRows.map((entry) => {
                    const matches =
                      entry.carryOver.capex <= entry.program.carryInCapex &&
                      entry.carryOver.opex <= entry.program.carryInOpex;
                    return (
                      <tr key={entry.program.id}>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          FY{entry.annualPlan.fiscalYear} · {entry.program.code}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <Money value={entry.carryOver.capex} /> / <Money value={entry.carryOver.opex} />
                        </td>
                        <td className="py-3 pr-3">
                          {entry.carryOver.reference ?? '—'}
                          {entry.carryOver.sourceFiscalYear ? (
                            <span className="text-xs text-slate-500"> (from FY{entry.carryOver.sourceFiscalYear})</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <Money value={entry.program.carryInCapex} /> /{' '}
                          <Money value={entry.program.carryInOpex} />
                        </td>
                        <td className="py-3 pr-3">
                          {matches ? (
                            <Badge tone="success">carry-in includes the close</Badge>
                          ) : (
                            <Badge tone="danger">carry-in below the close snapshot</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Current program"
          description={`FY${current.annualPlan.fiscalYear} · ${current.si.code} · ${current.si.name}`}
          actions={<Badge tone="info">FY{current.annualPlan.fiscalYear}</Badge>}
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Capex available</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.capex.available} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Capex unallocated</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.capex.unallocated} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Opex available</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.opex.available} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Opex unallocated</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.opex.unallocated} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-600">
            {previous ? (
              <>
                Continues{' '}
                <Link href={`/plan/programs/${previous.program.id}`} className={linkClass}>
                  {previous.program.code} · {previous.program.name}
                </Link>{' '}
                from FY{previous.annualPlan.fiscalYear}.{' '}
              </>
            ) : (
              'This is the first program of the thread. '
            )}
            {current.projectCount > 0 ? (
              <>
                It has {current.projectCount} originating project{current.projectCount === 1 ? '' : 's'}; see the{' '}
                <Link href="/plan/projects" className={linkClass}>
                  project register
                </Link>
                .
              </>
            ) : null}
          </p>
        </Card>
      </div>
    </div>
  );
}
