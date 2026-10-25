import type { ReactNode } from 'react';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerButtonClass } from './ui';

export function TextField({
  label,
  name,
  defaultValue,
  required,
  type = 'text',
  placeholder,
  hint,
  autoComplete,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'url';
  placeholder?: string;
  hint?: ReactNode;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <label className={`${labelClass} block`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={inputClass}
      />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function MoneyField({
  label,
  name,
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className={`${labelClass} block`}>
      {label}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-slate-500">Rp</span>
        <input
          name={name}
          inputMode="numeric"
          defaultValue={defaultValue === null || defaultValue === undefined ? undefined : String(defaultValue)}
          required={required}
          placeholder="0"
          className={`${inputClass} mt-0`}
        />
      </div>
      <span className="mt-1 block text-xs text-slate-500">
        Whole Rupiah, digits only (dots are ignored). {hint ?? null}
      </span>
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  required,
  rows = 3,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  rows?: number;
  hint?: ReactNode;
}) {
  return (
    <label className={`${labelClass} block`}>
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? undefined}
        required={required}
        rows={rows}
        className={inputClass}
      />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  options: SelectOption[];
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}) {
  return (
    <label className={`${labelClass} block`}>
      {label}
      <select name={name} defaultValue={defaultValue ?? ''} required={required} className={inputClass}>
        {placeholder ? (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function ReasonField({ name = 'reason', hint }: { name?: string; hint?: ReactNode }) {
  return (
    <TextAreaField
      label="Reason for change"
      name={name}
      required
      rows={2}
      hint={hint ?? 'Required: recorded in the audit trail (ADR-0004).'}
    />
  );
}

export function HiddenField({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const className =
    variant === 'secondary' ? secondaryButtonClass : variant === 'danger' ? dangerButtonClass : primaryButtonClass;
  return (
    <button type="submit" className={className}>
      {children}
    </button>
  );
}
