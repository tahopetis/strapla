import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, Flash, Money, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { getCloseState } from '@/server/plan/close-queries';
import { closeFiscalYearAction } from '@/server/plan/close-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Close fiscal year' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';
const moneyInput =
  'block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const selectClass =
  'block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

export default async function CloseYearPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
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

          <form action={closeFiscalYearAction} className="space-y-6">
            <input type="hidden" name="annualPlanId" value={state.plan.id} />

            <Card title="Program carry-over" description="Unallocated program budget moves to the continuation program in the target year.">
              {state.programs.length === 0 ? (
                <p className="text-sm text-slate-600">No programs in this fiscal year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Program</th>
                        <th className={th}>Capex unallocated</th>
                        <th className={th}>Carry capex</th>
                        <th className={th}>Opex unallocated</th>
                        <th className={th}>Carry opex</th>
                        <th className={th}>Target program (FY{state.targetPlan.fiscalYear})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.programs.map((row) => (
                        <tr key={row.program.id}>
                          <td className="py-3 pr-3">
                            <p className="font-medium">{row.program.code}</p>
                            <p className="text-slate-600">{row.program.name}</p>
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <Money value={row.unallocatedCapex} />
                          </td>
                          <td className="py-3 pr-3">
                            <input
                              name={`carry_program_${row.program.id}_capex`}
                              inputMode="numeric"
                              placeholder="0"
                              className={moneyInput}
                            />
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <Money value={row.unallocatedOpex} />
                          </td>
                          <td className="py-3 pr-3">
                            <input
                              name={`carry_program_${row.program.id}_opex`}
                              inputMode="numeric"
                              placeholder="0"
                              className={moneyInput}
                            />
                          </td>
                          <td className="py-3 pr-3">
                            <select
                              name={`target_program_${row.program.id}`}
                              defaultValue={row.defaultTargetProgramId ?? ''}
                              className={selectClass}
                            >
                              <option value="">Select a target program</option>
                              {row.targetPrograms.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Project allocation carry-over" description="The remaining slice of each project moves into its target-year allocation.">
              {state.allocations.length === 0 ? (
                <p className="text-sm text-slate-600">No allocations in this fiscal year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Project</th>
                        <th className={th}>Remaining capex</th>
                        <th className={th}>Carry capex</th>
                        <th className={th}>Remaining opex</th>
                        <th className={th}>Carry opex</th>
                        <th className={th}>Target</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.allocations.map((row) => (
                        <tr key={row.allocation.id}>
                          <td className="py-3 pr-3">
                            <p className="font-medium">{row.project.code}</p>
                            <p className="text-slate-600">{row.project.name}</p>
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <Money value={row.remainingCapex} />
                          </td>
                          <td className="py-3 pr-3">
                            <input
                              name={`carry_allocation_${row.allocation.id}_capex`}
                              inputMode="numeric"
                              placeholder="0"
                              className={moneyInput}
                            />
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <Money value={row.remainingOpex} />
                          </td>
                          <td className="py-3 pr-3">
                            <input
                              name={`carry_allocation_${row.allocation.id}_opex`}
                              inputMode="numeric"
                              placeholder="0"
                              className={moneyInput}
                            />
                          </td>
                          <td className="py-3 pr-3 text-xs text-slate-600">
                            {row.targetAllocation
                              ? 'Existing target allocation (carry-in is added)'
                              : (row.note ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Approval and close" description="Closing is irreversible: there is no reopen in v1 (charter §6.7).">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Approval reference
                  <input
                    name="reference"
                    required
                    maxLength={160}
                    placeholder="Board approval or memo reference"
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Close FY{state.plan.fiscalYear} and carry over
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Zero carry-over is allowed. After the close, settlement lifecycle events (paying existing
                commitments) can still be recorded and are audited; all other edits on the closed year are
                blocked except audited administrator corrections.
              </p>
            </Card>
          </form>
        </div>
      )}
    </div>
  );
}
