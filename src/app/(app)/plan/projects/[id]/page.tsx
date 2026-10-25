import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  HiddenField,
  MoneyField,
  ReasonField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { EntityHistory } from '@/components/entity-history';
import { PlanNav } from '@/components/plan-nav';
import { ProjectAllocationsSection } from '@/components/plan/project-allocations';
import { Badge, Card, Flash, Money, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { ProjectDetail } from '@/server/plan/project-queries';
import { getProjectDetail } from '@/server/plan/project-queries';
import { listAllocationProgramOptions, listProjectAllocations } from '@/server/plan/allocation-queries';
import { listEntityHistory } from '@/server/admin/queries';
import {
  cancelProjectAction,
  saveIjinPrinsipAction,
  updateProjectAction,
} from '@/server/plan/project-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Project' };

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const detail = await getProjectDetail(id);
  if (!detail) notFound();

  const editable =
    detail.project.status !== 'cancelled' &&
    detail.strategicPlan.status !== 'archived' &&
    detail.annualPlan.status !== 'closed';

  const [allocations, allocationOptions, history] = await Promise.all([
    listProjectAllocations(detail.project.id),
    listAllocationProgramOptions(detail.project.id),
    listEntityHistory('project', detail.project.id, 10),
  ]);

  return (
    <div>
      <PageHeader
        title={`${detail.project.code} · ${detail.project.name}`}
        description={`${detail.program.code} · ${detail.siCode} · ${detail.siName}`}
        actions={
          <Link href="/plan/projects" className="text-sm text-slate-600 hover:text-slate-900">
            ← All projects
          </Link>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card title="Project" actions={detail.project.status === 'cancelled' ? <Badge tone="danger">cancelled</Badge> : <Badge tone="success">active</Badge>}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Originating program</dt>
              <dd className="mt-1 font-medium">
                {detail.program.code} (FY{detail.annualPlan.fiscalYear})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Strategic initiative</dt>
              <dd className="mt-1 font-medium">{detail.siCode} · {detail.siName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fiscal years</dt>
              <dd className="mt-1 font-medium">
                {detail.project.startFiscalYear}–{detail.project.endFiscalYear}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Owner</dt>
              <dd className="mt-1 font-medium">{detail.project.owner ?? '—'}</dd>
            </div>
            {detail.project.externalReference ? (
              <div>
                <dt className="text-slate-500">External reference</dt>
                <dd className="mt-1 font-medium">{detail.project.externalReference}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="mt-1 font-medium capitalize">{detail.project.status}</dd>
            </div>
          </dl>
          {detail.project.description ? (
            <p className="mt-4 text-sm text-slate-600">{detail.project.description}</p>
          ) : null}
          {detail.project.cancelledReason ? (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Cancelled: {detail.project.cancelledReason}
            </p>
          ) : null}
        </Card>

        <PricingCard detail={detail} editable={editable} />
        <IjinPrinsipCard detail={detail} editable={editable} />

        <ProjectAllocationsSection
          projectId={detail.project.id}
          rows={allocations}
          options={allocationOptions}
          editable={editable}
        />

        <EntityHistory entries={history} />

        {editable ? (
          <Card title="Cancel project" description="Cancellation keeps the record and its history; nothing is deleted (BR-14).">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-red-700">Cancel this project</summary>
              <form action={cancelProjectAction} className="mt-4 space-y-3">
                <HiddenField name="id" value={detail.project.id} />
                <ReasonField hint="Recorded in the audit trail together with the cancellation." />
                <SubmitButton variant="danger">Cancel project</SubmitButton>
              </form>
            </details>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function PricingCard({ detail, editable }: { detail: ProjectDetail; editable: boolean }) {
  const { project } = detail;
  const approved = detail.ijin?.approvedAmount ?? null;
  return (
    <Card
      title="Full-life figures and pricing chain"
      description="Allocated budget, approved budget (ijin prinsip), submitted price and final deal price — the contract value."
      actions={
        <div className="flex flex-wrap gap-1">
          {detail.fundingFlags.map((flag) => (
            <Badge key={flag.code} tone={flagTone(flag.code)}>
              {flagLabel(flag.code)}
            </Badge>
          ))}
        </div>
      }
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Allocated (full life)</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.allocatedBudgetFullLife} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Approved (ijin prinsip)</dt>
          <dd className="mt-1 font-medium">
            <Money value={approved} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Submitted price</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.submittedPrice} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Final deal price (contract value)</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.finalDealPrice} />
          </dd>
        </div>
      </dl>

      <dl className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Opening allocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.openingAllocated} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opening open commitments</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.openingCommitted} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opening actual spend</dt>
          <dd className="mt-1 font-medium">
            <Money value={project.openingSpent} />
          </dd>
        </div>
      </dl>

      <dl className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Lifetime commitments (opening + in-app)</dt>
          <dd className="mt-1 font-medium">
            <Money value={detail.lifetimeCommitments} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Total annual allocations</dt>
          <dd className="mt-1 font-medium">
            <Money value={detail.totalAllocated} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Full-life allocated budget</dt>
          <dd className="mt-1 font-medium">
            <Money value={detail.project.allocatedBudgetFullLife} />
          </dd>
        </div>
      </dl>

      {editable ? (
        <details className="mt-5 border-t border-slate-100 pt-4">
          <summary className={summaryClass}>Edit project</summary>
          <form action={updateProjectAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="id" value={project.id} />
            <TextField label="Code" name="code" defaultValue={project.code} required maxLength={40} />
            <TextField label="Name" name="name" defaultValue={project.name} required maxLength={160} />
            <TextField label="Owner" name="owner" defaultValue={project.owner} maxLength={160} />
            <TextField
              label="External reference"
              name="externalReference"
              defaultValue={project.externalReference}
              maxLength={120}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Start fiscal year"
                name="startFiscalYear"
                defaultValue={String(project.startFiscalYear)}
                required
                maxLength={4}
              />
              <TextField
                label="End fiscal year"
                name="endFiscalYear"
                defaultValue={String(project.endFiscalYear)}
                required
                maxLength={4}
              />
            </div>
            <MoneyField
              label="Full-life allocated budget"
              name="allocatedBudgetFullLife"
              defaultValue={project.allocatedBudgetFullLife}
              required
            />
            <MoneyField label="Submitted price" name="submittedPrice" defaultValue={project.submittedPrice} />
            <MoneyField label="Final deal price" name="finalDealPrice" defaultValue={project.finalDealPrice} />
            <MoneyField label="Opening allocated" name="openingAllocated" defaultValue={project.openingAllocated} />
            <MoneyField
              label="Opening open commitments"
              name="openingCommitted"
              defaultValue={project.openingCommitted}
            />
            <MoneyField label="Opening actual spend" name="openingSpent" defaultValue={project.openingSpent} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Description" name="description" defaultValue={project.description} rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <ReasonField />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Save changes</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </Card>
  );
}

function IjinPrinsipCard({ detail, editable }: { detail: ProjectDetail; editable: boolean }) {
  const ijin = detail.ijin;
  return (
    <Card
      title="Ijin prinsip"
      description="The directors' in-principle approval: one record per project, full-life approved amount, with a link to the document."
      actions={ijin ? <Badge tone="success">recorded</Badge> : <Badge tone="warning">not recorded</Badge>}
    >
      {ijin ? (
        <dl className="mb-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Document number</dt>
            <dd className="mt-1 font-medium">{ijin.documentNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Document date</dt>
            <dd className="mt-1 font-medium">
              {ijin.documentDate ? formatDate(ijin.documentDate) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Approved amount</dt>
            <dd className="mt-1 font-medium">
              <Money value={ijin.approvedAmount} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Approver</dt>
            <dd className="mt-1 font-medium">{ijin.approver ?? '—'}</dd>
          </div>
          {ijin.documentUrl ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-slate-500">Document link</dt>
              <dd className="mt-1 truncate font-medium">
                <a className="underline decoration-slate-300 underline-offset-2" href={ijin.documentUrl}>
                  {ijin.documentUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {editable ? (
        <details open={!ijin}>
          <summary className={summaryClass}>{ijin ? 'Update ijin prinsip' : 'Record ijin prinsip'}</summary>
          <form action={saveIjinPrinsipAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="projectId" value={detail.project.id} />
            <TextField
              label="Document number"
              name="documentNumber"
              defaultValue={ijin?.documentNumber}
              maxLength={120}
            />
            <TextField label="Document date" name="documentDate" type="date" defaultValue={ijin?.documentDate} />
            <MoneyField label="Approved amount" name="approvedAmount" defaultValue={ijin?.approvedAmount ?? 0} required />
            <TextField label="Approver" name="approver" defaultValue={ijin?.approver} maxLength={160} />
            <div className="sm:col-span-2">
              <TextField
                label="Document link"
                name="documentUrl"
                type="url"
                defaultValue={ijin?.documentUrl}
                placeholder="https://…"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Notes" name="notes" defaultValue={ijin?.notes} rows={2} />
            </div>
            {ijin ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <ReasonField />
              </div>
            ) : null}
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>{ijin ? 'Update ijin prinsip' : 'Record ijin prinsip'}</SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </Card>
  );
}

const FLAG_LABELS: Record<string, string> = {
  over_approved_budget: 'over approved budget (BR-9)',
  above_submitted_price: 'above submitted price (BR-18)',
  commitments_over_contract: 'commitments over contract (BR-8)',
  project_allocations_over_full_life: 'allocations over full-life allocated',
};

function flagLabel(code: string): string {
  return FLAG_LABELS[code] ?? code;
}

function flagTone(code: string): 'danger' | 'warning' {
  return code === 'above_submitted_price' || code === 'project_allocations_over_full_life'
    ? 'warning'
    : 'danger';
}
