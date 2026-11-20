import type { Metadata } from 'next';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CustomFieldInputs, CustomFieldsPanel } from '@/components/custom-fields';
import {
  Form,
  HiddenField,
  MoneyField,
  ReasonField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Flash, Money, PageHeader, StatusBadge } from '@/components/ui';
import type { StrategicPlan } from '@/db/schema';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import type { InitiativeEnvelopeRow } from '@/server/plan/queries';
import { getCurrentStrategicPlan, listInitiativeEnvelopeRows } from '@/server/plan/queries';
import { listCustomFieldDefinitions, readCustomFieldValuesMap } from '@/server/custom-fields/data';
import {
  activatePlanAction,
  archivePlanAction,
  createInitiativeAction,
  createPlanAction,
  updateInitiativeAction,
  updatePlanAction,
  voidInitiativeAction,
} from '@/server/plan/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Strategic plan' };

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

export default async function StrategicPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const plan = await getCurrentStrategicPlan();
  const rows = plan ? await listInitiativeEnvelopeRows(plan.id) : [];
  const editable = plan !== null && plan.status !== 'archived';
  const [initiativeFields, initiativeValues] = await Promise.all([
    listCustomFieldDefinitions('strategic_initiative'),
    readCustomFieldValuesMap(
      'strategic_initiative',
      rows.map((row) => row.initiative.id),
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Strategic plan & initiatives"
        description="The five-year horizon and the initiatives that carry the budget envelopes."
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {plan === null ? (
        <CreatePlanCard />
      ) : (
        <div className="space-y-6">
          <PlanDetailsCard plan={plan} editable={editable} />
          <InitiativesSection
            plan={plan}
            rows={rows}
            editable={editable}
            customFields={initiativeFields}
            customValues={initiativeValues}
          />
        </div>
      )}
    </div>
  );
}

function CreatePlanCard() {
  const currentYear = new Date().getFullYear();
  const horizonEnd = currentYear + 4;
  return (
    <Card
      title="Create the strategic plan"
      description={`One plan at a time in v1: the five-year horizon, for example ${currentYear} to ${horizonEnd}.`}
    >
      <Form action={createPlanAction} className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Plan name"
          name="name"
          required
          placeholder={`IT Strategic Plan ${currentYear}–${horizonEnd}`}
          maxLength={160}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start fiscal year"
            name="startFiscalYear"
            required
            defaultValue={String(currentYear)}
            maxLength={4}
          />
          <TextField
            label="End fiscal year"
            name="endFiscalYear"
            required
            defaultValue={String(horizonEnd)}
            maxLength={4}
          />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Create plan</SubmitButton>
        </div>
      </Form>
    </Card>
  );
}

function PlanDetailsCard({ plan, editable }: { plan: StrategicPlan; editable: boolean }) {
  return (
    <Card title="Plan details" actions={<StatusBadge status={plan.status} />}>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
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
          <dt className="text-slate-500">Status</dt>
          <dd className="mt-1 font-medium capitalize">{plan.status}</dd>
        </div>
      </dl>

      {editable ? (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <details>
            <summary className={summaryClass}>Edit plan</summary>
            <Form action={updatePlanAction} className="mt-4 grid gap-4 sm:grid-cols-2">
              <HiddenField name="id" value={plan.id} />
              <TextField label="Plan name" name="name" defaultValue={plan.name} required maxLength={160} />
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Start fiscal year"
                  name="startFiscalYear"
                  defaultValue={String(plan.startFiscalYear)}
                  required
                  maxLength={4}
                />
                <TextField
                  label="End fiscal year"
                  name="endFiscalYear"
                  defaultValue={String(plan.endFiscalYear)}
                  required
                  maxLength={4}
                />
              </div>
              <div className="sm:col-span-2">
                <ReasonField />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </Form>
          </details>

          {plan.status === 'draft' ? (
            <details>
              <summary className={summaryClass}>Activate plan</summary>
              <Form action={activatePlanAction} className="mt-4 space-y-3">
                <HiddenField name="id" value={plan.id} />
                <ReasonField />
                <SubmitButton>Activate plan</SubmitButton>
              </Form>
            </details>
          ) : null}

          {plan.status === 'active' ? (
            <ConfirmDialog
              action={archivePlanAction}
              triggerLabel="Archive plan"
              title="Archive the strategic plan?"
              consequence="Archiving is final: the plan and everything under it become read-only."
              confirmLabel="Archive plan"
            >
              <HiddenField name="id" value={plan.id} />
              <ReasonField hint="Recorded in the audit trail." />
            </ConfirmDialog>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This plan is archived and read-only.
        </p>
      )}
    </Card>
  );
}

function InitiativesSection({
  plan,
  rows,
  editable,
  customFields,
  customValues,
}: {
  plan: StrategicPlan;
  rows: InitiativeEnvelopeRow[];
  editable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues: Map<string, CustomFieldValues>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Strategic initiatives</h2>
        <Badge>{rows.length}</Badge>
      </div>

      {editable ? (
        <Card title="Add initiative" description="An initiative has one five-year envelope; the initiative code is per plan.">
          <Form action={createInitiativeAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="planId" value={plan.id} />
            <TextField label="Code" name="code" required placeholder="SI-01" maxLength={20} />
            <TextField label="Name" name="name" required maxLength={160} />
            <TextField label="Owner" name="owner" maxLength={160} />
            <MoneyField label="Five-year envelope" name="envelopeAmount" required />
            <MoneyField
              label="Prior program budget consumed"
              name="priorProgramBudgetUsed"
              hint="Opening balance before the first in-app fiscal year."
            />
            <TextField label="Notes" name="notes" />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Objective" name="objective" rows={2} />
            </div>
            <CustomFieldInputs fields={customFields} />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add initiative</SubmitButton>
            </div>
          </Form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No initiatives yet. Add the first initiative with its envelope above.</EmptyState>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <InitiativeCard
              key={row.initiative.id}
              row={row}
              editable={editable}
              customFields={customFields}
              customValues={customValues.get(row.initiative.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InitiativeCard({
  row,
  editable,
  customFields,
  customValues,
}: {
  row: InitiativeEnvelopeRow;
  editable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues?: CustomFieldValues;
}) {
  const { initiative, programBudget, check } = row;
  return (
    <Card
      title={`${initiative.code} · ${initiative.name}`}
      description={initiative.owner ? `Owner: ${initiative.owner}` : undefined}
      actions={
        check.over ? <Badge tone="danger">Over envelope</Badge> : <Badge tone="success">Within envelope</Badge>
      }
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Envelope</dt>
          <dd className="mt-1 font-medium">
            <Money value={initiative.envelopeAmount} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Prior consumed</dt>
          <dd className="mt-1 font-medium">
            <Money value={initiative.priorProgramBudgetUsed} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">In-app program budgets</dt>
          <dd className="mt-1 font-medium">
            <Money value={programBudget} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Headroom</dt>
          <dd className={`mt-1 font-medium ${check.over ? 'text-red-700' : ''}`}>
            <Money value={check.remaining} />
          </dd>
        </div>
      </dl>

      {initiative.objective ? <p className="mt-3 text-sm text-slate-600">{initiative.objective}</p> : null}

      <CustomFieldsPanel fields={customFields} values={customValues} />

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit initiative</summary>
            <Form action={updateInitiativeAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <HiddenField name="id" value={initiative.id} />
              <TextField label="Code" name="code" defaultValue={initiative.code} required maxLength={20} />
              <TextField label="Name" name="name" defaultValue={initiative.name} required maxLength={160} />
              <TextField label="Owner" name="owner" defaultValue={initiative.owner} maxLength={160} />
              <MoneyField label="Five-year envelope" name="envelopeAmount" defaultValue={initiative.envelopeAmount} required />
              <MoneyField
                label="Prior program budget consumed"
                name="priorProgramBudgetUsed"
                defaultValue={initiative.priorProgramBudgetUsed}
              />
              <TextField label="Notes" name="notes" defaultValue={initiative.notes} />
              <div className="sm:col-span-2">
                <TextAreaField label="Objective" name="objective" defaultValue={initiative.objective} rows={2} />
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
              action={voidInitiativeAction}
              triggerLabel="Void initiative"
              title="Void this initiative?"
              consequence="Voiding keeps the record and its history but removes it from the active plan."
              confirmLabel="Void initiative"
            >
              <HiddenField name="id" value={initiative.id} />
              <ReasonField hint="Recorded in the audit trail." />
            </ConfirmDialog>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
