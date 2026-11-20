'use client';

import { useId } from 'react';
import { inputClass, labelClass } from './ui';
import {
  customFieldTypeLabel,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import { useFieldError, useFormEcho } from './form';

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
  const error = useFieldError(name);
  const echo = useFormEcho(name);
  const instanceId = useId();
  const hintId = `${instanceId}-hint`;
  const errorId = `${instanceId}-error`;
  const describedBy =
    [hintId, error ? errorId : null].filter(Boolean).join(' ') || undefined;
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
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
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
