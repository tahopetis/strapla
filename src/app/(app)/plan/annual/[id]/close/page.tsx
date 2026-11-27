import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CloseYearForm } from '@/components/plan/close-year-form';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, Flash, Money, PageHeader } from '@/components/ui';
import { finalCloseReason } from '@/lib/close-form';
import { formatDate } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import { getCloseState } from '@/server/plan/close-queries';
import { listCarryRegister, type CarryRegisterRow } from '@/server/plan/carry-queries';
import { listPlanCorrections, type PlanCorrection } from '@/server/plan/correction-queries';

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
  // The end year of the strategic plan is a final close (#109, ADR-0008 §3): it has no
  // next-year target, records zero carry, and is rendered by the final form.
  const targetPlan = state.targetPlan;
  const programOptions = state.programs.map((row) => ({
    id: row.program.id,
    code: row.program.code,
    name: row.program.name,
    availableCapex: row.availableCapex,
    availableOpex: row.availableOpex,
    continuationProgramId: row.continuationProgramId,
    targetPrograms: row.targetPrograms,
  }));
  const allocationOptions = state.allocations.map((row) => ({
    id: row.allocation.id,
    projectCode: row.project.code,
    projectName: row.project.name,
    availableCapex: row.availableCapex,
    availableOpex: row.availableOpex,
    hasTargetAllocation: row.targetAllocation !== null,
    note: row.note,
  }));
  // The receipt is the ledger view of the close: labels, targets and the
  // approval reference come from the register rows, while the snapshot supplies
  // available / carried / not-carried per entity and component.
  const receipts =
    state.plan.status === 'closed' ? await listCarryRegister({ sourceAnnualPlanId: id }) : [];
  // Corrections recorded after the close (ADR-0007 §7, §8). They are listed
  // beside the frozen snapshot, never folded into it: the receipt shows what the
  // close decided, and the notice says which live records moved since.
  const corrections: PlanCorrection[] =
    state.plan.status === 'closed' ? await listPlanCorrections(id) : [];
  const receiptsBySource = new Map<string, CarryRegisterRow[]>();
  for (const row of receipts) {
    const key = `${row.entry.entityType}:${row.entry.sourceEntityId ?? ''}:${row.entry.component}`;
    const list = receiptsBySource.get(key) ?? [];
    list.push(row);
    receiptsBySource.set(key, list);
  }
  const targetLink = (row: CarryRegisterRow): string =>
    row.entry.entityType === 'program'
      ? `/plan/programs/${row.entry.targetEntityId}`
      : `/plan/annual/${row.entry.targetAnnualPlanId}`;

  return (
    <div>
      <PageHeader
        title={`Close FY${state.plan.fiscalYear}`}
        description={
          state.isFinalClose
            ? `${state.strategicPlan.name} · final fiscal year of the strategic plan — nothing is carried across the plan boundary`
            : `${state.strategicPlan.name} · close the year and carry remaining budget into FY${state.plan.fiscalYear + 1}`
        }
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
            description="The snapshot below is the historical record of the close. Corrections after the close are audited and never rewrite it; carry-over is a one-time audited snapshot and there is no reopen."
            actions={<Badge tone="success">closed</Badge>}
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Approval reference</dt>
                <dd className="mt-1 font-medium">
                  {state.plan.closeReference ? (
                    <a
                      href="#carry-receipts"
                      className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                      title="Jump to the carry-over receipts this close wrote"
                    >
                      {state.plan.closeReference}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
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
                  capex <Money value={state.totalCarryCapex} /> · opex{' '}
                  <Money value={state.totalCarryOpex} />
                </dd>
              </div>
            </dl>
          </Card>

          <div id="close-snapshot" className="scroll-mt-24">
            <Card
              title="Close snapshot"
              description="Available, carried and deliberately not carried per entity and component, as recorded at the close. Zero-carry entities are included; the targets column links each carried amount to the receipt that delivered it."
              actions={<Badge>{state.snapshots.length}</Badge>}
            >
              {state.snapshots.length === 0 ? (
                <p className="text-sm text-slate-600">No snapshot rows were recorded for this close.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Entity</th>
                        <th className={th}>Component</th>
                        <th className={th}>Available</th>
                        <th className={th}>Carried</th>
                        <th className={th}>Not carried</th>
                        <th className={th}>Reason</th>
                        <th className={th}>Targets</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.snapshots.map(({ snapshot, label }) => {
                        const targets =
                          receiptsBySource.get(
                            `${snapshot.entityType}:${snapshot.entityId}:${snapshot.component}`,
                          ) ?? [];
                        return (
                          <tr
                            key={`${snapshot.entityType}:${snapshot.entityId}:${snapshot.component}`}
                          >
                            <td className="py-2 pr-3">
                              {snapshot.entityType === 'program' ? (
                                <Link
                                  href={`/plan/programs/${snapshot.entityId}`}
                                  className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                                >
                                  {label}
                                </Link>
                              ) : (
                                label
                              )}
                              <span className="ml-2 text-xs text-slate-500">
                                {snapshot.entityType}
                              </span>
                            </td>
                            <td className="py-2 pr-3 uppercase">{snapshot.component}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <Money value={snapshot.available} />
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <Money value={snapshot.carried} />
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <Money value={snapshot.notCarried} />
                            </td>
                            <td className="py-2 pr-3">{snapshot.notCarriedReason || '—'}</td>
                            <td className="py-2 pr-3">
                              {targets.length === 0 ? (
                                <span className="text-slate-500">—</span>
                              ) : (
                                <ul className="space-y-1">
                                  {targets.map((row) => (
                                    <li key={row.entry.id}>
                                      <Link
                                        href={targetLink(row)}
                                        className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                                      >
                                        {row.targetLabel}
                                      </Link>{' '}
                                      <Money value={row.entry.amount} />
                                    </li>
                                  ))}
                                </ul>
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
          </div>

          {corrections.length > 0 ? (
            <div id="corrections-after-close" className="scroll-mt-24">
              <Card
                title="Corrections after close"
                description="The close snapshot above is frozen. These records were corrected after the close and are shown at their live figures."
                actions={<Badge tone="warning">{corrections.length}</Badge>}
              >
                <ul className="divide-y divide-slate-100">
                  {corrections.map((correction) => (
                    <li key={`${correction.entityType}:${correction.entityId}`} className="py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={correction.href}
                          className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                        >
                          {correction.label}
                        </Link>
                        <span className="text-xs text-slate-500">{correction.entityTypeLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {correction.reason ?? 'No reason recorded'} ·{' '}
                        {correction.actorName ?? correction.actorEmail ?? 'system'} ·{' '}
                        {formatDate(correction.correctedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}

          <div id="carry-receipts" className="scroll-mt-24">
            <Card
              title="Carry-over receipts"
              description={`The ledger entries this close wrote (approval reference ${state.plan.closeReference ?? '—'}), with their source entity, target and treatment reason.`}
              actions={<Badge>{receipts.length}</Badge>}
            >
              {receipts.length === 0 ? (
                <p className="text-sm text-slate-600">No carry-over entries were recorded at close.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Source entity</th>
                        <th className={th}>Component</th>
                        <th className={th}>Amount</th>
                        <th className={th}>Target</th>
                        <th className={th}>Origin</th>
                        <th className={th}>Reason</th>
                        <th className={th}>Recorded by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receipts.map((row) => (
                        <tr key={row.entry.id}>
                          <td className="py-2 pr-3">
                            {row.entry.sourceEntityId && row.entry.entityType === 'program' ? (
                              <Link
                                href={`/plan/programs/${row.entry.sourceEntityId}`}
                                className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                              >
                                {row.sourceLabel ?? row.entry.sourceEntityId}
                              </Link>
                            ) : (
                              (row.sourceLabel ?? '—')
                            )}
                            <span className="ml-2 text-xs text-slate-500">
                              {row.entry.entityType}
                            </span>
                          </td>
                          <td className="py-2 pr-3 uppercase">{row.entry.component}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <Money value={row.entry.amount} />
                          </td>
                          <td className="py-2 pr-3">
                            <Link
                              href={targetLink(row)}
                              className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                            >
                              {row.targetLabel}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{row.entry.origin}</td>
                          <td className="py-2 pr-3">{row.entry.reason || '—'}</td>
                          <td className="py-2 pr-3">{row.createdByName ?? 'system'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : state.plan.status !== 'active' ? (
        <Card title="Activate the annual plan first" description="Only an active plan can be closed.">
          <p className="text-sm text-slate-700">
            This plan is {state.plan.status}. Activate it on the annual plan page before closing the year.
          </p>
        </Card>
      ) : state.isFinalClose ? (
        <CloseYearForm
          annualPlanId={state.plan.id}
          fiscalYear={state.plan.fiscalYear}
          finalClose={{ reason: finalCloseReason(state.plan.fiscalYear) }}
          programs={programOptions}
          allocations={allocationOptions}
        />
      ) : !targetPlan ? (
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
            description="Review what remains, decide the carry-over per component, and record the approval reference. Open commitments are not carried: they remain commitments (charter §6.7). Anything not carried needs a reason — the close records it in the snapshot."
          >
            <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-slate-500">Target year</p>
                <p className="mt-1 font-medium">FY{targetPlan.fiscalYear}</p>
              </div>
              <div>
                <p className="text-slate-500">Programs with unallocated budget</p>
                <p className="mt-1 font-medium">
                  {state.programs.filter((row) => row.availableCapex + row.availableOpex > 0).length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Allocations with remaining</p>
                <p className="mt-1 font-medium">
                  {state.allocations.filter((row) => row.availableCapex + row.availableOpex > 0).length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Recurring ops carry-in</p>
                <p className="mt-1 font-medium">manual (entered on the item)</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Remaining = allocation + carry-in − open commitments − current-year spend. Unallocated program
              budget = effective budget + carry-in − allocations. Cross-year settlement portions and prior-year
              opening payments do not count against this year.
            </p>
          </Card>

          <CloseYearForm
            annualPlanId={state.plan.id}
            fiscalYear={state.plan.fiscalYear}
            targetFiscalYear={targetPlan.fiscalYear}
            programs={programOptions}
            allocations={allocationOptions}
          />
        </div>
      )}
    </div>
  );
}
