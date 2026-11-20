import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import { formatDate } from '@/lib/format';

/**
 * The one renderer for custom fields (issue #46): the admin-defined registry is
 * the only source of fields, and every surface uses these components so forms,
 * record panels and reports cannot disagree about a label, a type or a value.
 */

export { CustomFieldInputs } from './custom-field-inputs';
export { CustomFieldFilterForm } from './custom-field-filter-form';

/** Read-only display value; dates are shown in the app time zone like every other date. */
export function customFieldDisplayValue(
  field: Pick<CustomFieldDefinition, 'type'>,
  value: string | number | undefined | null,
): string {
  if (value === undefined || value === null) return '';
  if (field.type === 'date' && typeof value === 'string') return formatDate(value);
  return String(value);
}

export function CustomFieldsPanel({
  fields,
  values,
}: {
  fields: readonly CustomFieldDefinition[];
  values?: CustomFieldValues;
}) {
  const recorded = fields.filter((field) => values?.[field.id] !== undefined);
  if (recorded.length === 0) return null;

  return (
    <div className="mt-4 rounded border border-slate-100 bg-slate-50 px-3 py-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Additional fields</h3>
      <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {recorded.map((field) => (
          <div key={field.id}>
            <dt className="text-slate-500">{field.name}</dt>
            <dd className="mt-1 font-medium">{customFieldDisplayValue(field, values?.[field.id])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CustomFieldHeaderCells({
  fields,
  className,
}: {
  fields: readonly CustomFieldDefinition[];
  className?: string;
}) {
  return (
    <>
      {fields.map((field) => (
        <th key={field.id} className={className}>
          {field.name}
        </th>
      ))}
    </>
  );
}

export function CustomFieldCells({
  fields,
  values,
  className,
}: {
  fields: readonly CustomFieldDefinition[];
  values?: CustomFieldValues;
  className?: string;
}) {
  return (
    <>
      {fields.map((field) => (
        <td key={field.id} className={className}>
          {customFieldDisplayValue(field, values?.[field.id])}
        </td>
      ))}
    </>
  );
}
