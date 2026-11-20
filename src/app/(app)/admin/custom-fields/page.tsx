import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  CheckboxField,
  Form,
  HiddenField,
  ReasonField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { Badge, Card, EmptyState, Flash, PageHeader } from '@/components/ui';
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  customFieldEntityLabel,
  customFieldTypeLabel,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
} from '@/domain/custom-fields';
import { requireUser } from '@/server/auth/session';
import {
  createCustomFieldAction,
  removeCustomFieldAction,
  updateCustomFieldAction,
} from '@/server/custom-fields/actions';
import { listCustomFieldDefinitions } from '@/server/custom-fields/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Custom fields' };

const typeOptions = CUSTOM_FIELD_TYPES.map((type) => ({
  value: type,
  label: customFieldTypeLabel(type),
}));

function AddFieldForm({ entityType }: { entityType: CustomFieldEntityType }) {
  return (
    <details className="mt-4 border-t border-slate-100 pt-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Add a field</summary>
      <Form action={createCustomFieldAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HiddenField name="entityType" value={entityType} />
        <TextField label="Field name" name="name" required maxLength={80} placeholder="Procurement method" />
        <SelectField label="Type" name="type" options={typeOptions} defaultValue="text" required />
        <CheckboxField label="Required" name="required" />
        <div className="sm:col-span-2 lg:col-span-4">
          <TextAreaField
            label="Description"
            name="description"
            required
            rows={2}
            hint="Shown under the field on forms and in the administration list."
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <SubmitButton>Add field</SubmitButton>
        </div>
      </Form>
    </details>
  );
}

function FieldRow({ field }: { field: CustomFieldDefinition }) {
  return (
    <li className="rounded border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {field.name} {field.required ? <Badge tone="warning">required</Badge> : null}
          </p>
          <p className="mt-1 text-sm text-slate-600">{field.description}</p>
        </div>
        <Badge>{customFieldTypeLabel(field.type)}</Badge>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Edit field</summary>
          <Form action={updateCustomFieldAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <HiddenField name="id" value={field.id} />
            <TextField label="Field name" name="name" defaultValue={field.name} required maxLength={80} />
            <SelectField
              label="Type"
              name="type"
              options={typeOptions}
              defaultValue={field.type}
              required
              hint="The type can only change while every recorded value stays valid."
            />
            <CheckboxField label="Required" name="required" defaultChecked={field.required} />
            <div className="sm:col-span-2">
              <TextAreaField label="Description" name="description" defaultValue={field.description} required rows={2} />
            </div>
            <div className="sm:col-span-2">
              <ReasonField hint="Required: recorded in the audit trail." />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Save field</SubmitButton>
            </div>
          </Form>
        </details>

        <div className="flex items-start">
          <ConfirmDialog
            action={removeCustomFieldAction}
            triggerLabel="Remove field"
            title={`Remove “${field.name}”?`}
            consequence="Removing the field archives it, so it leaves forms, record pages, reports and exports while the values already recorded stay in place but are no longer shown."
            confirmLabel="Remove field"
            pendingLabel="Removing…"
          >
            <HiddenField name="id" value={field.id} />
            <ReasonField hint="Recorded in the audit trail." />
          </ConfirmDialog>
        </div>
      </div>
    </li>
  );
}

function EntityCard({
  entityType,
  fields,
}: {
  entityType: CustomFieldEntityType;
  fields: CustomFieldDefinition[];
}) {
  return (
    <Card
      title={customFieldEntityLabel(entityType)}
      description="Extra typed fields on this record type. Values are metadata only."
      actions={<Badge>{fields.length}</Badge>}
    >
      {fields.length === 0 ? (
        <EmptyState>No extra fields on this record type yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {fields.map((field) => (
            <FieldRow key={field.id} field={field} />
          ))}
        </ul>
      )}
      <AddFieldForm entityType={entityType} />
    </Card>
  );
}

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  await requireUser();
  const fields = await listCustomFieldDefinitions();

  return (
    <div>
      <PageHeader
        title="Custom fields"
        description="Define extra typed fields on plan records and show them on forms, record pages, reports and exports."
        actions={
          <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            ← Administration
          </Link>
        }
      />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card title="What custom fields are" description="Metadata that never touches the money rules.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Each field has a name, a type (text, number or date), a required flag and a description.</li>
            <li>Every definition, change and removal is recorded in the audit trail.</li>
            <li>
              Custom fields never change budgets, remaining amounts, flags, allocations or any existing
              report total. They are extra information, not extra accounting.
            </li>
            <li>One deployment belongs to one organisation, so fields apply to this deployment only.</li>
          </ul>
        </Card>

        {CUSTOM_FIELD_ENTITIES.map((entity) => (
          <EntityCard
            key={entity.type}
            entityType={entity.type}
            fields={fields.filter((field) => field.entityType === entity.type)}
          />
        ))}
      </div>
    </div>
  );
}
