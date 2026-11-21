import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CloseYearForm } from '@/components/plan/close-year-form';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, Flash, Money, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import { getCloseState } from '@/server/plan/close-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Close fiscal year' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';

export default async function CloseYearPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  if (!isRecordId(id)) notFound();
  const { error, message } = await searchParams;
  const state = await getCloseState(id);
  if (!state) notFound();

  const carryCapexTotal = state.carryOvers
    .filter((entry) => entry.component === 'capex')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const carryOpexTotal = state.carryOvers
    .filter((entry) => entry.component === 'opex')
    .reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div>
      <PageHeader
        title={`Close FY${state.plan.fiscalYear}`}
        description={`${state.strategicPlan.name} · close the year and carry remaining budget into FY${state.plan.fiscalYear + 1}`}
        actions={
          <Link href={`/plan/annual/${state.plan.id}`} className="text-sm text-slate-600 hover:text-slate-900">
            ← Annual plan
          </Link>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {state.plan.status === 'closed' ? (
        <div className="space-y-6">
          <Card
            title="Fiscal year closed"
            description="Closed years are read-only; carry-over is a one-time audited snapshot and there is no reopen."
            actions={<Badge tone="success">closed</Badge>}
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Approval reference</dt>
                <dd className="mt-1 font-medium">{state.plan.closeReference ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Closed at</dt>
                <dd className="mt-1 font-medium">
                  {state.plan.closedAt ? formatDate(state.plan.closedAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Carried into FY{state.plan.fiscalYear + 1}</dt>
                <dd className="mt-1 font-medium">
                  capex <Money value={carryCapexTotal} /> · opex <Money value={carryOpexTotal} />
                </dd>
              </div>
            </dl>
            {state.carryOvers.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Entity</th>
                      <th className={th}>Component</th>
                      <th className={th}>Amount</th>
                      <th className={th}>Approval reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.carryOvers.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2 pr-3">{entry.entityType}</td>
                        <td className="py-2 pr-3 uppercase">{entry.component}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <Money value={entry.amount} />
                        </td>
                        <td className="py-2 pr-3">{entry.approvalReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">No carry-over was recorded at close.</p>
            )}
          </Card>
        </div>
      ) : state.plan.status !== 'active' ? (
        <Card title="Activate the annual plan first" description="Only an active plan can be closed.">
          <p className="text-sm text-slate-700">
            This plan is {state.plan.status}. Activate it on the annual plan page before closing the year.
          </p>
        </Card>
      ) : !state.targetPlan ? (
        <Card title="Next fiscal year is missing" description="Carry-over has nowhere to land.">
          <p className="text-sm text-slate-700">
            Create the FY{state.plan.fiscalYear + 1} annual plan first, then close FY{state.plan.fiscalYear}. Open
            balances are not re-carried: only remaining budget moves.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/plan/annual" className="underline">
              Create the next annual plan
            </Link>
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card
            title="Close review"
            description="Review what remains, decide the carry-over per component, and record the approval reference. Open commitments are not carried: they remain commitments (charter §6.7)."
          >
            <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-slate-500">Target year</p>
                <p className="mt-1 font-medium">FY{state.targetPlan.fiscalYear}</p>
              </div>
              <div>
                <p className="text-slate-500">Programs with unallocated budget</p>
                <p className="mt-1 font-medium">
                  {state.programs.filter((row) => row.unallocatedCapex + row.unallocatedOpex > 0).length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Allocations with remaining</p>
                <p className="mt-1 font-medium">
                  {state.allocations.filter((row) => row.remainingCapex + row.remainingOpex > 0).length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Recurring ops carry-in</p>
                <p className="mt-1 font-medium">manual (entered on the item)</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Remaining = allocation + carry-in − open commitments − current-year spend. Unallocated program
              budget = budget + carry-in − allocations. Cross-year settlement portions and prior-year opening
              payments do not count against this year.
            </p>
          </Card>

          <CloseYearForm
            annualPlanId={state.plan.id}
            fiscalYear={state.plan.fiscalYear}
            targetFiscalYear={state.targetPlan.fiscalYear}
            programs={state.programs.map((row) => ({
              id: row.program.id,
              code: row.program.code,
              name: row.program.name,
              unallocatedCapex: row.unallocatedCapex,
              unallocatedOpex: row.unallocatedOpex,
              defaultTargetProgramId: row.defaultTargetProgramId,
              targetPrograms: row.targetPrograms,
            }))}
            allocations={state.allocations.map((row) => ({
              id: row.allocation.id,
              projectCode: row.project.code,
              projectName: row.project.name,
              remainingCapex: row.remainingCapex,
              remainingOpex: row.remainingOpex,
              hasTargetAllocation: row.targetAllocation !== null,
              note: row.note,
            }))}
          />
        </div>
      )}
    </div>
  );
}
