import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomFieldInputs, CustomFieldsPanel } from '@/components/custom-fields';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PlanHeaderActions } from '@/components/plan/plan-header-actions';
import {
  Form,
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
import { Badge, Card, EmptyState, Flash, Money, PageHeader } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import type { AnnualPlanDetail, ProgramRow } from '@/server/plan/annual-queries';
import { getAnnualPlanDetail } from '@/server/plan/annual-queries';
import { listCustomFieldDefinitions, readCustomFieldValuesMap } from '@/server/custom-fields/data';
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

  const [programFields, programValues, recurringFields, recurringValues] = await Promise.all([
    listCustomFieldDefinitions('annual_program'),
    readCustomFieldValuesMap(
      'annual_program',
      detail.programs.map((row) => row.program.id),
    ),
    listCustomFieldDefinitions('recurring_ops_item'),
    readCustomFieldValuesMap(
      'recurring_ops_item',
      detail.recurringOps.map((row) => row.item.id),
    ),
  ]);

  return (
    <div>
      <PageHeader
        title={`FY${detail.annualPlan.fiscalYear} annual plan`}
        description={detail.strategicPlan.name}
        actions={
          <PlanHeaderActions
            status={detail.annualPlan.status}
            activation={
              canActivate
                ? {
                    action: activateAnnualPlanAction,
                    id: detail.annualPlan.id,
                    label: 'Activate annual plan',
                    hint: 'Activation is audited; programs stay editable until the Year Close.',
                  }
                : undefined
            }
          >
            {detail.annualPlan.status === 'active' ? (
              <Link
                href={`/plan/annual/${detail.annualPlan.id}/close`}
                className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                Close fiscal year
              </Link>
            ) : null}
            <Link href="/plan/annual" className="text-sm text-slate-600 hover:text-slate-900">
              ← All annual plans
            </Link>
          </PlanHeaderActions>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card title="Annual plan">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Fiscal year</dt>
              <dd className="mt-1 font-medium">FY{detail.annualPlan.fiscalYear}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Strategic plan</dt>
              <dd className="mt-1 font-medium">{detail.strategicPlan.name}</dd>
            </div>
          </dl>

          {detail.annualPlan.status === 'closed' ? (
            <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              This fiscal year is closed and read-only.
            </p>
          ) : null}
        </Card>

        <ProgramsSection
          detail={detail}
          editable={editable}
          customFields={programFields}
          customValues={programValues}
        />

        <RecurringOpsSection
          detail={detail}
          editable={editable}
          customFields={recurringFields}
          customValues={recurringValues}
        />
      </div>
    </div>
  );
}

function ProgramsSection({
  detail,
  editable,
  customFields,
  customValues,
}: {
  detail: AnnualPlanDetail;
  editable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues: Map<string, CustomFieldValues>;
}) {
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
          <Form action={createProgramAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <CustomFieldInputs fields={customFields} />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add program</SubmitButton>
            </div>
          </Form>
        </Card>
      ) : null}

      {detail.programs.length === 0 ? (
        <EmptyState>No programs in this annual plan yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {detail.programs.map((row) => (
            <ProgramCard
              key={row.program.id}
              row={row}
              detail={detail}
              editable={editable}
              customFields={customFields}
              customValues={customValues.get(row.program.id)}
            />
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
  customFields,
  customValues,
}: {
  row: ProgramRow;
  detail: AnnualPlanDetail;
  editable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues?: CustomFieldValues;
}) {
  const { program, availability, allocatedCapex, allocatedOpex, position } = row;
  return (
    <Card
      title={`${program.code} · ${program.name}`}
      description={`${row.siCode} · ${row.siName}`}
      actions={
        <div className="flex items-center gap-3">
          <Badge tone="info">{row.siCode}</Badge>
          <Link
            href={`/plan/programs/${program.id}`}
            className="text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            Thread
          </Link>
        </div>
      }
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

      <CustomFieldsPanel fields={customFields} values={customValues} />

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit program</summary>
            <Form action={updateProgramAction} className="mt-4 grid gap-3 sm:grid-cols-2">
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
              <CustomFieldInputs fields={customFields} values={customValues} />
              <div className="sm:col-span-2">
                <ReasonField />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </Form>
          </details>

          <div className="flex items-start">
            <ConfirmDialog
              action={voidProgramAction}
              triggerLabel="Void program"
              title="Void this program?"
              consequence="Voiding keeps the program and its history but removes it from active lists."
              confirmLabel="Void program"
            >
              <HiddenField name="id" value={program.id} />
              <ReasonField hint="Recorded in the audit trail." />
            </ConfirmDialog>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
