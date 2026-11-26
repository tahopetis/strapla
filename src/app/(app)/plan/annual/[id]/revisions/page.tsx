import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Form, HiddenField, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { PlanNav } from '@/components/plan-nav';
import { RevisionForm } from '@/components/plan/revision-form';
import { listRevisionLines } from '@/components/plan/revision-lines';
import { Badge, Card, EmptyState, Flash, Money, PageHeader } from '@/components/ui';
import { isRecordId } from '@/lib/record-id';
import { formatDate, toDateInputValue } from '@/lib/format';
import { recordRevisionDecisionAction } from '@/server/plan/revision-actions';
import { getRevisionPageData } from '@/server/plan/revision-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Budget revisions' };

const linkClass =
  'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';
const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';

function todayIso(): string {
  return toDateInputValue(new Date());
}

/**
 * The annual plan's budget revision register (#112, ADR-0006 §4): the numbered,
 * immutable revisions plus the create form. A revision posted before its formal
 * decision shows as *awaiting decision reference* and the reference can be
 * recorded here afterwards, as metadata only.
 */
export default async function BudgetRevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  if (!isRecordId(id)) notFound();
  const { error, message } = await searchParams;
  const data = await getRevisionPageData(id);
  if (!data) notFound();

  const archived = data.strategicPlan.status === 'archived';
  const canPost = data.annualPlan.status === 'active' && !archived;
  const canRecordDecision = !archived;
  // Each revision's lines, labelled for display: a program line links to its
  // program page so the register is a navigable document, not just a total.
  const linesByRevision = await listRevisionLines(
    data.revisions.map((row) => row.revision.id),
  );

  return (
    <div>
      <PageHeader
        title={`FY${data.annualPlan.fiscalYear} budget revisions`}
        description={`${data.strategicPlan.name} · numbered, immutable revisions of the program budgets`}
        actions={
          <Link href={`/plan/annual/${data.annualPlan.id}`} className="text-sm text-slate-600 hover:text-slate-900">
            ← FY{data.annualPlan.fiscalYear} annual plan
          </Link>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card
          title="Revision register"
          description="A revision is never edited or deleted: a correction is a new revision."
          actions={
            <div className="flex flex-wrap gap-2">
              <Badge>{data.revisions.length}</Badge>
              {data.revisions.some((row) => row.awaitingDecision) ? (
                <Badge tone="warning">
                  {data.revisions.filter((row) => row.awaitingDecision).length} awaiting decision
                </Badge>
              ) : null}
            </div>
          }
        >
          {data.revisions.length === 0 ? (
            <EmptyState>No budget revisions posted for FY{data.annualPlan.fiscalYear} yet.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {data.revisions.map((row) => {
                const lines = linesByRevision.get(row.revision.id) ?? [];
                return (
                <li key={row.revision.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        {row.number}
                        <span className="text-sm font-normal text-slate-500">
                          {formatDate(row.revision.revisionDate)}
                        </span>
                        {row.awaitingDecision ? (
                          <Badge tone="warning">awaiting decision reference</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{row.revision.reason}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Net budget change
                      </p>
                      <p className="font-medium tabular-nums">
                        <Money value={row.totalDelta.capex} /> capex ·{' '}
                        <Money value={row.totalDelta.opex} /> opex
                      </p>
                      <p className="text-slate-500">
                        {row.lineCount} line{row.lineCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    Decision reference:{' '}
                    {row.awaitingDecision ? (
                      <span className="font-medium text-amber-700">awaiting</span>
                    ) : (
                      <span className="font-medium">{row.revision.decisionReference}</span>
                    )}
                  </p>

                  {lines.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead>
                          <tr>
                            <th className={th}>Line</th>
                            <th className={th}>Component</th>
                            <th className={th}>Delta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lines.map((line) => (
                            <tr key={line.id}>
                              <td className="py-2 pr-3">
                                {line.entityType === 'program' ? (
                                  <Link
                                    href={`/plan/programs/${line.entityId}`}
                                    className={linkClass}
                                  >
                                    {line.entityCode}
                                    {line.entityName ? ` · ${line.entityName}` : ''}
                                  </Link>
                                ) : (
                                  <span>
                                    {line.entityCode}
                                    {line.entityName ? ` · ${line.entityName}` : ''}
                                    <span className="ml-2 text-slate-500">
                                      project allocation (de-allocation)
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3 uppercase">{line.component}</td>
                              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                                {line.delta > 0 ? '+' : ''}
                                <Money value={line.delta} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {row.awaitingDecision && canRecordDecision ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">
                        Record the decision reference
                      </summary>
                      <Form
                        action={recordRevisionDecisionAction}
                        className="mt-3 grid gap-3 sm:grid-cols-2"
                      >
                        <HiddenField name="id" value={row.revision.id} />
                        <TextField
                          label="Decision reference"
                          name="decisionReference"
                          required
                          maxLength={160}
                          hint="Metadata only: the lines and deltas above are already frozen."
                        />
                        <TextAreaField
                          label="Reason for change"
                          name="reason"
                          required
                          rows={2}
                        />
                        <div className="sm:col-span-2">
                          <SubmitButton>Record decision</SubmitButton>
                        </div>
                      </Form>
                    </details>
                  ) : null}
                </li>
                );
              })}
            </ul>
          )}
        </Card>

        {canPost ? (
          <Card
            title="Post a budget revision"
            description="Program budgets are frozen while the plan is active. A revision is applied atomically: every line lands, or none does."
          >
            <RevisionForm
              annualPlanId={data.annualPlan.id}
              today={todayIso()}
              programs={data.programs}
              allocations={data.allocations}
            />
          </Card>
        ) : (
          <Card title="Post a budget revision">
            <p className="text-sm text-slate-600">
              {data.annualPlan.status === 'active'
                ? 'The strategic plan is archived, so no new revision can be posted.'
                : data.annualPlan.status === 'draft'
                  ? 'Revisions begin once the plan is active. While it is a draft, edit the program budgets directly on the annual plan page.'
                  : 'This fiscal year is closed and read-only.'}
            </p>
            {data.annualPlan.status === 'draft' ? (
              <p className="mt-2 text-sm">
                <Link href={`/plan/annual/${data.annualPlan.id}`} className={linkClass}>
                  Open the annual plan to edit the draft budgets
                </Link>
              </p>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  );
}
