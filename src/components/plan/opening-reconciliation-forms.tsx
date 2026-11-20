'use client';

import { useId } from 'react';
import {
  Form,
  HiddenField,
  SubmitButton,
  TextField,
  useFieldError,
  useFormEcho,
} from '@/components/form';
import { Money } from '@/components/ui';
import {
  saveOpeningReconciliationAction,
  signOffOpeningBalancesAction,
} from '@/server/plan/opening-reconciliation-actions';

export interface ReconciliationControlField {
  name: string;
  label: string;
  app: number;
}

const controlInputClass =
  'block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

/**
 * The control totals and the one-time sign-off (W5b). Both are client forms so
 * a refused save returns the spreadsheet figures the user typed and puts the
 * message under the offending control total.
 */
export function OpeningReconciliationForms({
  planId,
  fields,
  initialValues,
  priorYear,
}: {
  planId: string;
  fields: readonly ReconciliationControlField[];
  initialValues: Record<string, number> | null;
  priorYear: number;
}) {
  return (
    <div className="mt-5 space-y-5">
      <Form action={saveOpeningReconciliationAction} className="space-y-4">
        <HiddenField name="planId" value={planId} />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Control total</th>
                <th className="py-2 pr-4">Spreadsheet total (Rp)</th>
                <th className="py-2">Strapla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((field) => (
                <ControlTotalRow key={field.name} field={field} initialValue={initialValues?.[field.name]} />
              ))}
            </tbody>
          </table>
        </div>
        <TextField
          label="Reason for change"
          name="reason"
          required
          maxLength={1000}
          placeholder="Why the control totals changed"
        />
        <SubmitButton>Save control totals</SubmitButton>
      </Form>

      {initialValues ? (
        <Form
          action={signOffOpeningBalancesAction}
          className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4"
        >
          <HiddenField name="planId" value={planId} />
          <p className="text-sm font-medium text-slate-800">Sign off the opening balances</p>
          <p className="text-xs text-slate-600">
            Signing off is final; later corrections on records are audited edits. A non-zero difference is
            allowed but its reason is recorded.
          </p>
          <TextField
            label="Sign-off reason"
            name="reason"
            required
            maxLength={1000}
            placeholder={`Reconciled to the FY${priorYear} control totals`}
          />
          <SubmitButton>Sign off opening balances</SubmitButton>
        </Form>
      ) : null}
    </div>
  );
}

function ControlTotalRow({
  field,
  initialValue,
}: {
  field: ReconciliationControlField;
  initialValue?: number;
}) {
  const error = useFieldError(field.name);
  const echo = useFormEcho(field.name);
  const errorId = useId();
  const value = echo ?? (initialValue === undefined ? '' : String(initialValue));

  return (
    <tr>
      <td className="py-2 pr-4">{field.label}</td>
      <td className="py-2 pr-4">
        <input
          name={field.name}
          inputMode="numeric"
          required
          defaultValue={value}
          placeholder="0"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={controlInputClass}
        />
        {error ? (
          <span id={errorId} className="mt-1 block text-xs font-medium text-red-700">
            {error}
          </span>
        ) : null}
      </td>
      <td className="py-2 whitespace-nowrap">
        <Money value={field.app} />
      </td>
    </tr>
  );
}
