import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  HiddenField,
  MoneyField,
  ReasonField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { RecurringOpsSection } from '@/components/plan/recurring-ops-section';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Flash, Money, PageHeader, StatusBadge } from '@/components/ui';
import type { AnnualPlanDetail, ProgramRow } from '@/server/plan/annual-queries';
import { getAnnualPlanDetail } from '@/server/plan/annual-queries';
import {
  activateAnnualPlanAction,
  createProgramAction,
  updateProgramAction,
  voidProgramAction,
} from '@/server/plan/annual-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annual plan' };

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';
const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function AnnualPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const detail = await getAnnualPlanDetail(id);
  if (!detail) notFound();

  const editable = detail.annualPlan.status !== 'closed' && detail.strategicPlan.status !== 'archived';
  const canActivate =
    editable && detail.annualPlan.status === 'draft' && detail.strategicPlan.status === 'active';

  return (
    <div>
      <PageHeader
        title={`FY${detail.annualPlan.fiscalYear} annual plan`}
        description={detail.strategicPlan.name}
        actions={
          <Link href="/plan/annual" className="text-sm text-slate-600 hover:text-slate-900">
            ← All annual plans
          </Link>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card title="Annual plan" actions={<StatusBadge status={detail.annualPlan.status} />}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Fiscal year</dt>
              <dd className="mt-1 font-medium">FY{detail.annualPlan.fiscalYear}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Strategic plan</dt>
              <dd className="mt-1 font-medium">{detail.strategicPlan.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="mt-1 font-medium capitalize">{detail.annualPlan.status}</dd>
            </div>
          </dl>

          {detail.annualPlan.status === 'closed' ? (
            <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              This fiscal year is closed and read-only.
            </p>
          ) : null}

          {canActivate ? (
            <details className="mt-4 border-t border-slate-100 pt-4">
              <summary className={summaryClass}>Activate annual plan</summary>
              <form action={activateAnnualPlanAction} className="mt-4 space-y-3">
                <HiddenField name="id" value={detail.annualPlan.id} />
                <ReasonField hint="Activation is audited; programs stay editable until the yearly close." />
                <SubmitButton>Activate annual plan</SubmitButton>
              </form>
            </details>
          ) : null}
        </Card>

        <ProgramsSection detail={detail} editable={editable} />

        <RecurringOpsSection detail={detail} editable={editable} />
      </div>
    </div>
  );
}

function ProgramsSection({ detail, editable }: { detail: AnnualPlanDetail; editable: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Annual programs</h2>
        <Badge>{detail.programs.length}</Badge>
      </div>

      {detail.initiativeOptions.length === 0 ? (
        <EmptyState>
          Add strategic initiatives to the strategic plan before creating programs.{' '}
          <Link href="/plan/strategic" className={linkClass}>
            Open the strategic plan
          </Link>
        </EmptyState>
      ) : editable ? (
        <Card
          title="Add annual program"
          description="A program belongs to exactly one SI (BR-4) and carries capex and opex budgets. A continuing program links to last year's program (program thread)."
        >
          <form action={createProgramAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="annualPlanId" value={detail.annualPlan.id} />
            <TextField label="Code" name="code" defaultValue={detail.suggestedProgramCode} required maxLength={40} />
            <TextField label="Name" name="name" required maxLength={160} />
            <SelectField
              label="Strategic initiative"
              name="siId"
              required
              placeholder="Select an initiative"
              options={detail.initiativeOptions}
            />
            <SelectField
              label="Continues program"
              name="prevProgramId"
              placeholder="No continuation (new program)"
              options={detail.continuationOptions}
              hint="Optional: the prior fiscal year's program of the same SI."
            />
            <MoneyField label="Capex budget" name="capexBudget" defaultValue={0} required />
            <MoneyField label="Opex budget" name="opexBudget" defaultValue={0} required />
            <MoneyField
              label="Capex carry-in"
              name="carryInCapex"
              defaultValue={0}
              hint="Opening balance / prior-year carry-over."
            />
            <MoneyField
              label="Opex carry-in"
              name="carryInOpex"
              defaultValue={0}
              hint="Opening balance / prior-year carry-over."
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add program</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {detail.programs.length === 0 ? (
        <EmptyState>No programs in this annual plan yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {detail.programs.map((row) => (
            <ProgramCard key={row.program.id} row={row} detail={detail} editable={editable} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramCard({
  row,
  detail,
  editable,
}: {
  row: ProgramRow;
  detail: AnnualPlanDetail;
  editable: boolean;
}) {
  const { program, availability, allocatedCapex, allocatedOpex, position } = row;
  return (
    <Card
      title={`${program.code} · ${program.name}`}
      description={`${row.siCode} · ${row.siName}`}
      actions={<Badge tone="info">{row.siCode}</Badge>}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-slate-500">Capex available (budget + carry-in)</dt>
          <dd className="mt-1 font-medium">
            <Money value={availability.capexAvailable} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex allocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocatedCapex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex unallocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.capex.unallocated} />
            {position.capex.over ? <Badge tone="danger">over-allocated</Badge> : null}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex available (budget + carry-in)</dt>
          <dd className="mt-1 font-medium">
            <Money value={availability.opexAvailable} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex allocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocatedOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex unallocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.opex.unallocated} />
            {position.opex.over ? <Badge tone="danger">over-allocated</Badge> : null}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        Allocations above the program budget are flagged, never blocked (BR-7/BR-17). Project allocations are
        managed on the project page.
      </p>

      {row.continuationLabel ? (
        <p className="mt-3 text-sm text-slate-600">
          Continues program <span className="font-medium">{row.continuationLabel}</span>.
        </p>
      ) : null}

      {program.notes ? <p className="mt-3 text-sm text-slate-600">{program.notes}</p> : null}

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit program</summary>
            <form action={updateProgramAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <HiddenField name="id" value={program.id} />
              <TextField label="Code" name="code" defaultValue={program.code} required maxLength={40} />
              <TextField label="Name" name="name" defaultValue={program.name} required maxLength={160} />
              <SelectField
                label="Strategic initiative"
                name="siId"
                required
                options={detail.initiativeOptions}
                defaultValue={program.siId}
              />
              <SelectField
                label="Continues program"
                name="prevProgramId"
                placeholder="No continuation"
                options={detail.continuationOptions}
                defaultValue={program.prevProgramId ?? ''}
              />
              <MoneyField label="Capex budget" name="capexBudget" defaultValue={program.capexBudget} required />
              <MoneyField label="Opex budget" name="opexBudget" defaultValue={program.opexBudget} required />
              <MoneyField label="Capex carry-in" name="carryInCapex" defaultValue={program.carryInCapex} />
              <MoneyField label="Opex carry-in" name="carryInOpex" defaultValue={program.carryInOpex} />
              <div className="sm:col-span-2">
                <TextAreaField label="Notes" name="notes" defaultValue={program.notes} rows={2} />
              </div>
              <div className="sm:col-span-2">
                <ReasonField />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </form>
          </details>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-red-700">Void program</summary>
            <form action={voidProgramAction} className="mt-4 space-y-3">
              <HiddenField name="id" value={program.id} />
              <ReasonField hint="Voiding keeps the record and history; programs with projects or continuations cannot be voided." />
              <SubmitButton variant="danger">Void program</SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
