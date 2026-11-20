import { inputClass, labelClass, secondaryButtonClass } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import { formatDate } from '@/lib/format';

/**
 * The one renderer for custom fields (issue #46): the admin-defined registry is
 * the only source of fields, and every surface uses these components so forms,
 * record panels and reports cannot disagree about a label, a type or a value.
 */

export { CustomFieldInputs } from './custom-field-inputs';

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

/**
 * A GET filter: pick one custom field and a value. Text matches a substring,
 * number and date use their typed parser. The page applies it to the rows it
 * already loaded; exports deliberately always carry the whole report.
 */
export function CustomFieldFilterForm({
  fields,
  action,
  fieldId,
  query,
  columnSelection,
}: {
  fields: readonly CustomFieldDefinition[];
  action: string;
  fieldId?: string;
  query?: string;
  /**
   * The export-column selection to carry through the GET form, so applying or
   * clearing a filter cannot silently reset it. Omitted when the visitor has no
   * explicit selection (the page then shows every active field).
   */
  columnSelection?: readonly string[];
}) {
  if (fields.length === 0) return null;

  const clearHref =
    columnSelection === undefined
      ? action
      : `${action}?${
          columnSelection.length === 0
            ? 'columns='
            : columnSelection.map((id) => `columns=${encodeURIComponent(id)}`).join('&')
        }`;

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      {columnSelection !== undefined ? (
        <>
          <input type="hidden" name="columns" value="" />
          {columnSelection.map((id) => (
            <input key={id} type="hidden" name="columns" value={id} />
          ))}
        </>
      ) : null}
      <label className={`${labelClass} block`}>
        Custom field
        <select name="cf" defaultValue={fieldId ?? ''} className={inputClass}>
          <option value="">No custom-field filter</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} block`}>
        Value
        <input
          name="cv"
          defaultValue={query ?? ''}
          placeholder="Part of the text or an exact number/date"
          className={inputClass}
        />
      </label>
      <button type="submit" className={secondaryButtonClass}>
        Apply filter
      </button>
      {fieldId ? (
        <a href={clearHref} className="text-sm text-slate-600 underline decoration-slate-300">
          Clear
        </a>
      ) : null}
    </form>
  );
}
