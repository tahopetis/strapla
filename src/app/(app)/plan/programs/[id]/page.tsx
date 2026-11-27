import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanNav } from '@/components/plan-nav';
import { programMoneyLine } from '@/domain/program-money-line';
import { listRevisionLines } from '@/server/plan/revision-lines';
import { AnnualPlanBadge, Badge, Card, Money, PageHeader, StatusBadge } from '@/components/ui';
import { NO_DELTAS } from '@/domain/revisions';
import { isRecordId } from '@/lib/record-id';
import { getCarryInForPlan, listCarryRegister } from '@/server/plan/carry-queries';
import { loadExecutionAggregates } from '@/server/plan/execution-aggregates';
import { getProgramThread } from '@/server/plan/program-queries';
import { listRevisions } from '@/server/plan/revision-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Program thread' };

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';
const linkClass = 'underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function ProgramThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRecordId(id)) notFound();
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

  // The money line (ADR-0006 §6): carry-in comes from the ledger, commitments
  // and spend from the execution aggregates of the current year, and the
  // revision numbers from the posted documents. The guarded `carry_in_*` cache
  // is deliberately not the display source.
  const [execution, carryIn, carryRegister, revisions] = await Promise.all([
    loadExecutionAggregates(current.annualPlan.planId),
    getCarryInForPlan(current.annualPlan.id),
    listCarryRegister({ targetAnnualPlanId: current.annualPlan.id }),
    listRevisions(current.annualPlan.id),
  ]);
  const revisionLines = await listRevisionLines(revisions.map((row) => row.revision.id));
  const ledgerCarry = carryIn.programs.get(current.program.id) ?? NO_DELTAS;
  const executionTotals = execution.byProgram.get(current.program.id);
  const moneyLine = programMoneyLine({
    initial: { capex: current.program.capexBudget, opex: current.program.opexBudget },
    revisions: { capex: current.revisionCapex, opex: current.revisionOpex },
    carryIn: ledgerCarry,
    allocated: { capex: current.allocatedCapex, opex: current.allocatedOpex },
    openCommitments: {
      capex: executionTotals?.openCommitmentCapex ?? 0,
      opex: executionTotals?.openCommitmentOpex ?? 0,
    },
    currentYearSpend: {
      capex: executionTotals?.currentSpendCapex ?? 0,
      opex: executionTotals?.currentSpendOpex ?? 0,
    },
  });
  const revisionNumbers = revisions.flatMap((row) =>
    (revisionLines.get(row.revision.id) ?? [])
      .filter(
        (line) => line.entityType === 'program' && line.entityId === current.program.id,
      )
      .map((line) => ({
        number: row.number,
        component: line.component,
        delta: line.delta,
      })),
  );
  const carryReceipts = carryRegister.filter(
    (row) =>
      row.entry.entityType === 'program' && row.entry.targetEntityId === current.program.id,
  );
  const flags = [moneyLine.capex, moneyLine.opex].some(
    (component) => component.overAllocated || component.unfunded,
  );
  const moneyLineRows = [
    {
      label: 'Capex',
      line: moneyLine.capex,
      revisions: revisionNumbers.filter((row) => row.component === 'capex'),
    },
    {
      label: 'Opex',
      line: moneyLine.opex,
      revisions: revisionNumbers.filter((row) => row.component === 'opex'),
    },
  ];

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
                  <th className={th}>Effective budget (capex / opex)</th>
                  <th className={th}>Revisions (capex / opex)</th>
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
                        <Money value={entry.program.capexBudget + entry.revisionCapex} /> /{' '}
                        <Money value={entry.program.opexBudget + entry.revisionOpex} />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={entry.revisionCapex} /> / <Money value={entry.revisionOpex} />
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
          actions={
            <AnnualPlanBadge annualPlanId={current.annualPlan.id} tone="info">
              FY{current.annualPlan.fiscalYear}
            </AnnualPlanBadge>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>Component</th>
                  <th className={th}>Initial budget</th>
                  <th className={th}>Carry-in received</th>
                  <th className={th}>Revisions</th>
                  <th className={th}>Effective budget</th>
                  <th className={th}>Allocated</th>
                  <th className={th}>Open commitments</th>
                  <th className={th}>Current-year spend</th>
                  <th className={th}>Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moneyLineRows.map(({ label, line, revisions: componentRevisions }) => (
                  <tr key={label}>
                    <td className="py-3 pr-3 font-medium">{label}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.initial} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.carryIn} />
                      <p className="text-xs text-slate-500">
                        from the ledger
                        {carryReceipts.length > 0 ? (
                          <>
                            {' · '}
                            <Link
                              href={`/plan/annual/${current.annualPlan.id}#carry-in-receipts`}
                              className={linkClass}
                            >
                              {carryReceipts.length} receipt
                              {carryReceipts.length === 1 ? '' : 's'}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {componentRevisions.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          <p>
                            {line.revision > 0 ? '+' : ''}
                            <Money value={line.revision} />
                          </p>
                          {componentRevisions.map((revision) => (
                            <p key={revision.number} className="text-xs text-slate-500">
                              {revision.number} {revision.delta > 0 ? '+' : ''}
                              <Money value={revision.delta} />
                            </p>
                          ))}
                        </>
                      )}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.effective} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.allocated} />
                      {line.overAllocated ? <Badge tone="danger">over-allocated</Badge> : null}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.openCommitments} />
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <Money value={line.currentYearSpend} />
                    </td>
                    <td
                      className={`py-3 pr-3 whitespace-nowrap ${line.unfunded ? 'font-medium text-red-700' : ''}`}
                    >
                      <Money value={line.remaining} />
                      {line.unfunded ? <Badge tone="danger">unfunded</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Effective budget = initial budget + posted revisions; available = effective budget +
            carry-in (capex <Money value={moneyLine.capex.available} /> · opex{' '}
            <Money value={moneyLine.opex.available} />); remaining = available − open commitments −
            current-year spend. Carry-in is received through the ledger, never typed on the program.
            Capex and opex never offset each other.
          </p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Capex unallocated (available − allocated)</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.capex.unallocated} />
                {current.position.capex.over ? <Badge tone="danger">over-allocated</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Capex remaining (after commitments and spend)</dt>
              <dd className="mt-1 font-medium">
                <Money value={moneyLine.capex.remaining} />
                {moneyLine.capex.unfunded ? <Badge tone="danger">unfunded</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Opex unallocated (available − allocated)</dt>
              <dd className="mt-1 font-medium">
                <Money value={current.position.opex.unallocated} />
                {current.position.opex.over ? <Badge tone="danger">over-allocated</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Opex remaining (after commitments and spend)</dt>
              <dd className="mt-1 font-medium">
                <Money value={moneyLine.opex.remaining} />
                {moneyLine.opex.unfunded ? <Badge tone="danger">unfunded</Badge> : null}
              </dd>
            </div>
          </dl>
          {flags ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Allocations above available money (over-allocated) and a negative remaining after a
              budget cut (unfunded) are warning flags and never block entry. Correct them with a later
              revision or a project de-allocation.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              <Badge tone="success">within budget</Badge> No over-allocation or unfunded flag for
              this program.
            </p>
          )}
          {carryReceipts.length > 0 ? (
            <div className="mt-4 text-xs text-slate-600">
              <p className="font-medium text-slate-700">Carry-in receipts (ledger)</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {carryReceipts.map(({ entry, sourceLabel }) => (
                  <li key={entry.id}>
                    {entry.origin === 'close'
                      ? 'Year close'
                      : entry.origin === 'opening'
                        ? 'Opening balance'
                        : 'Manual grant'}{' '}
                    · {entry.component.toUpperCase()} <Money value={entry.amount} />
                    {entry.approvalReference ? ` · ${entry.approvalReference}` : ''}
                    {sourceLabel ? (
                      <>
                        {' · from '}
                        {entry.sourceEntityId && entry.entityType === 'program' ? (
                          <Link href={`/plan/programs/${entry.sourceEntityId}`} className={linkClass}>
                            {sourceLabel}
                          </Link>
                        ) : (
                          sourceLabel
                        )}
                      </>
                    ) : null}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              No carry-in receipts for this program: it is funded by its initial budget and posted
              revisions only.
            </p>
          )}
          {current.annualPlan.status === 'active' ? (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This annual plan is active, so the program budget is frozen. A budget change is a{' '}
              <Link href={`/plan/annual/${current.annualPlan.id}/revisions`} className="underline">
                posted budget revision
              </Link>
              ; name, notes and the strategic initiative stay editable on the annual plan page.
            </p>
          ) : null}
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
