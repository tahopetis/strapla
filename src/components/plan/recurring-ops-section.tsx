import Link from 'next/link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CustomFieldInputs, CustomFieldsPanel } from '@/components/custom-fields';
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
import { Badge, Card, EmptyState, Money } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import type { AnnualPlanDetail, RecurringOpsRow } from '@/server/plan/annual-queries';
import {
  createRecurringOpsAction,
  updateRecurringOpsAction,
  voidRecurringOpsAction,
} from '@/server/plan/recurring-actions';

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

export function RecurringOpsSection({
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
        <h2 className="text-lg font-semibold tracking-tight">Recurring operations</h2>
        <Badge>{detail.recurringOps.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Opex-only annual budget items such as leased lines, existing maintenance and subscriptions. They
        are not linked to an SI and have no projects (BR-12); commitments and spend are managed on the item page.
      </p>

      {editable ? (
        <Card
          title="Add recurring ops item"
          description="The annual opex budget is the ceiling; carry-in comes from an opening balance or a prior-year carry-over."
        >
          <Form action={createRecurringOpsAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="annualPlanId" value={detail.annualPlan.id} />
            <TextField label="Name" name="name" required maxLength={160} />
            <SelectField
              label="Category"
              name="categoryId"
              placeholder="No category"
              options={detail.categoryOptions}
            />
            <TextField label="Owner" name="owner" maxLength={160} />
            <MoneyField label="Opex budget" name="opexBudget" defaultValue={0} required />
            <MoneyField label="Opex carry-in" name="carryInOpex" defaultValue={0} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Notes" name="notes" rows={2} />
            </div>
            <CustomFieldInputs fields={customFields} />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add recurring ops item</SubmitButton>
            </div>
          </Form>
        </Card>
      ) : null}

      {detail.recurringOps.length === 0 ? (
        <EmptyState>No recurring ops items in this annual plan yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {detail.recurringOps.map((row) => (
            <RecurringOpsCard
              key={row.item.id}
              row={row}
              detail={detail}
              editable={editable}
              customFields={customFields}
              customValues={customValues.get(row.item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringOpsCard({
  row,
  detail,
  editable,
  customFields,
  customValues,
}: {
  row: RecurringOpsRow;
  detail: AnnualPlanDetail;
  editable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues?: CustomFieldValues;
}) {
  const { item } = row;
  return (
    <Card
      title={item.name}
      description={row.categoryName ? `Category: ${row.categoryName}` : undefined}
      actions={<Badge tone="info">Opex only</Badge>}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Opex budget</dt>
          <dd className="mt-1 font-medium">
            <Money value={item.opexBudget} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex carry-in</dt>
          <dd className="mt-1 font-medium">
            <Money value={item.carryInOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Available</dt>
          <dd className="mt-1 font-medium">
            <Money value={row.available} />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm">
        <Link
          href={`/plan/annual/${detail.annualPlan.id}/recurring-ops/${item.id}`}
          className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
        >
          Open commitments &amp; spend
        </Link>
      </p>

      {item.owner ? <p className="mt-3 text-sm text-slate-600">Owner: {item.owner}</p> : null}
      {item.notes ? <p className="mt-1 text-sm text-slate-600">{item.notes}</p> : null}

      <CustomFieldsPanel fields={customFields} values={customValues} />

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit item</summary>
            <Form action={updateRecurringOpsAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <HiddenField name="id" value={item.id} />
              <TextField label="Name" name="name" defaultValue={item.name} required maxLength={160} />
              <SelectField
                label="Category"
                name="categoryId"
                placeholder="No category"
                options={detail.categoryOptions}
                defaultValue={item.categoryId ?? ''}
              />
              <TextField label="Owner" name="owner" defaultValue={item.owner} maxLength={160} />
              <MoneyField label="Opex budget" name="opexBudget" defaultValue={item.opexBudget} required />
              <MoneyField label="Opex carry-in" name="carryInOpex" defaultValue={item.carryInOpex} />
              <div className="sm:col-span-2">
                <TextAreaField label="Notes" name="notes" defaultValue={item.notes} rows={2} />
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
              action={voidRecurringOpsAction}
              triggerLabel="Void item"
              title="Void this recurring ops item?"
              consequence="Voiding keeps the record and its history; the item leaves the active annual plan."
              confirmLabel="Void item"
            >
              <HiddenField name="id" value={item.id} />
              <ReasonField hint="Recorded in the audit trail." />
            </ConfirmDialog>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
