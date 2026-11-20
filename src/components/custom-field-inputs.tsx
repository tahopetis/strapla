'use client';

import { inputClass, labelClass } from './ui';
import {
  customFieldTypeLabel,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import { useFieldState } from './form';

/**
 * The registry's inputs as a client component so a refused submission can
 * place each message under the field it belongs to and echo the submitted
 * value back. The labels, types and order still come from the registry alone.
 */
export function CustomFieldInputs({
  fields,
  values,
}: {
  fields: readonly CustomFieldDefinition[];
  values?: CustomFieldValues;
}) {
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => (
        <CustomFieldInput key={field.id} field={field} value={values?.[field.id]} />
      ))}
    </>
  );
}

function CustomFieldInput({
  field,
  value,
}: {
  field: CustomFieldDefinition;
  value: string | number | undefined;
}) {
  const name = `custom.${field.id}`;
  const { error, echo, errorId, hintId, describedBy, invalid } = useFieldState(name);
  const defaultValue = value === undefined ? undefined : String(value);

  return (
    <label className={`${labelClass} block`}>
      {field.name}
      <input
        name={name}
        type={field.type === 'date' ? 'date' : 'text'}
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        defaultValue={echo ?? defaultValue}
        required={field.required}
        aria-invalid={invalid}
        aria-describedby={describedBy(true)}
        className={inputClass}
      />
      <span id={hintId} className="mt-1 block text-xs text-slate-500">
        {field.description} ({customFieldTypeLabel(field.type)})
      </span>
      {error ? (
        <span id={errorId} className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
