'use client';

import {
  Fragment,
  createContext,
  useContext,
  useId,
  useActionState,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { initialFormState, type FormAction, type FormState } from '@/lib/form-state';
import {
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

/**
 * Shared form pattern (W5b): a client `<Form>` wires `useActionState` to a
 * server action that returns validation state, and the fields read that state
 * from context so each message lands under the input that caused it.
 *
 * Uncontrolled inputs are remounted whenever the action returns state (React
 * resets a form after its action runs); the remount re-applies the echoed
 * values, so a refused submission never loses what the user typed.
 */

export interface FormStateValue {
  state: FormState;
  pending: boolean;
}

const FormContext = createContext<FormStateValue | null>(null);

function useFormContext(): FormStateValue | null {
  return useContext(FormContext);
}

/**
 * Provides the submitted state to fields outside `<Form>` — the confirmation
 * dialog and any hand-built form that uses `useActionState` directly.
 */
export function FormStateProvider({
  value,
  children,
}: {
  value: FormStateValue;
  children: ReactNode;
}) {
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

/** The error for one input, when the surrounding `<Form>` has one. */
export function useFieldError(name: string): string | undefined {
  return useFormContext()?.state.fieldErrors?.[name];
}

/** The value last submitted for one input, when the surrounding `<Form>` has it. */
export function useFormEcho(name: string): string | undefined {
  const context = useFormContext();
  if (!context || context.state.attempt === 0) return undefined;
  return context.state.values?.[name];
}

/** The form-level message (a business rule or a recognized server failure). */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <div
      role="alert"
      className="col-span-full rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {state.message}
    </div>
  );
}

/**
 * A form whose server action returns `FormState` on refusal. On success the
 * action redirects as before, so this component only ever renders failures.
 */
export function Form({
  action,
  children,
  className,
  initial,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  initial?: FormState;
}) {
  const [state, formAction, pending] = useActionState(action, initial ?? initialFormState);

  return (
    <form action={formAction} className={className}>
      <FormContext.Provider value={{ state, pending }}>
        <FormMessage state={state} />
        <Fragment key={state.attempt}>{children}</Fragment>
      </FormContext.Provider>
    </form>
  );
}

/** Per-input aria wiring shared by the field components. */
function useFieldState(name: string): {
  error: string | undefined;
  errorId: string;
  hintId: string;
  describedBy: (hasHint: boolean) => string | undefined;
  invalid: true | undefined;
} {
  const error = useFieldError(name);
  const instanceId = useId();
  const errorId = `${instanceId}-error`;
  const hintId = `${instanceId}-hint`;
  return {
    error,
    errorId,
    hintId,
    describedBy: (hasHint: boolean) =>
      [hasHint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined,
    invalid: error ? true : undefined,
  };
}

function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="mt-1 block text-xs text-slate-500">
      {children}
    </span>
  );
}

function FieldErrorText({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <span id={id} className="mt-1 block text-xs font-medium text-red-700">
      {error}
    </span>
  );
}

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
  minLength,
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
  minLength?: number;
}) {
  const { error, errorId, hintId, describedBy, invalid } = useFieldState(name);
  // A password is never echoed back into the DOM.
  const echo = useFormEcho(name);
  const passwordType = type === 'password';
  const value = passwordType ? undefined : (echo ?? defaultValue ?? undefined);

  return (
    <label className={`${labelClass} block`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        minLength={minLength}
        aria-invalid={invalid}
        aria-describedby={describedBy(Boolean(hint))}
        className={inputClass}
      />
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <FieldErrorText id={errorId} error={error} />
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
  const { error, errorId, hintId, describedBy, invalid } = useFieldState(name);
  const echo = useFormEcho(name);
  const value =
    echo ?? (defaultValue === null || defaultValue === undefined ? undefined : String(defaultValue));

  return (
    <label className={`${labelClass} block`}>
      {label}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-slate-500">Rp</span>
        <input
          name={name}
          inputMode="numeric"
          defaultValue={value}
          required={required}
          placeholder="0"
          aria-invalid={invalid}
          aria-describedby={describedBy(true)}
          className={`${inputClass} mt-0`}
        />
      </div>
      <FieldHint id={hintId}>
        Whole Rupiah, digits only (dots are ignored). {hint ?? null}
      </FieldHint>
      <FieldErrorText id={errorId} error={error} />
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
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  rows?: number;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const { error, errorId, hintId, describedBy, invalid } = useFieldState(name);
  const echo = useFormEcho(name);
  const value = echo ?? defaultValue ?? undefined;

  return (
    <label className={`${labelClass} block`}>
      {label}
      <textarea
        name={name}
        defaultValue={value}
        required={required}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy(Boolean(hint))}
        className={inputClass}
      />
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <FieldErrorText id={errorId} error={error} />
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
  const { error, errorId, hintId, describedBy, invalid } = useFieldState(name);
  const echo = useFormEcho(name);
  const value = echo ?? defaultValue ?? '';

  return (
    <label className={`${labelClass} block`}>
      {label}
      <select
        name={name}
        defaultValue={value}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy(Boolean(hint))}
        className={inputClass}
      >
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
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <FieldErrorText id={errorId} error={error} />
    </label>
  );
}

/**
 * A checkbox that submits the same "off"/"on" pair the custom-field registry
 * expects. The hidden input guarantees a value when unchecked.
 */
export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: ReactNode;
}) {
  const { error, errorId, hintId, describedBy, invalid } = useFieldState(name);
  const echo = useFormEcho(name);
  const checked = echo === undefined ? Boolean(defaultChecked) : echo === 'on';

  return (
    <label className={`${labelClass} flex items-center gap-2 self-end pb-2`}>
      <input type="hidden" name={name} value="off" />
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={checked}
        aria-invalid={invalid}
        aria-describedby={describedBy(Boolean(hint))}
        className="h-4 w-4 rounded border-slate-300"
      />
      {label}
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <FieldErrorText id={errorId} error={error} />
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

/**
 * Submit button that disables itself and names the wait while the form is
 * pending, so a slow save never looks like a dead click and a double click
 * cannot create a duplicate record.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  variant = 'primary',
  name,
  value,
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const baseClassName =
    variant === 'secondary'
      ? secondaryButtonClass
      : variant === 'danger'
        ? dangerButtonClass
        : primaryButtonClass;

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`${className ?? baseClassName} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
