'use client';

import type { ReactNode } from 'react';
import { Form, HiddenField, ReasonField, SubmitButton } from '@/components/form';
import { StatusBadge } from '@/components/ui';
import type { FormAction } from '@/lib/form-state';

const ACTIVATION_PENDING_LABEL = 'Activating…';

/** The plan lifecycle states the header can show. */
type PlanStatus = 'draft' | 'active' | 'archived' | 'closed';

/**
 * W1a: the page header carries the plan status and, when the caller allows it,
 * the activation form. It is visible instead of hidden inside a closed
 * disclosure, and it reuses the same server action and reason field as before
 * (the W5b form pattern), so the audit entry is unchanged and a refused
 * submission keeps the typed reason under an inline error.
 *
 * The caller decides when activation is allowed (a draft plan, and for an
 * annual plan an active strategic plan); this component only renders the
 * form it is given.
 */
export function PlanHeaderActions({
  status,
  activation,
  children,
}: {
  status: PlanStatus;
  activation?: {
    action: FormAction;
    /** Submitted as `id`, the key both activation actions expect. */
    id: string;
    label: string;
    hint?: string;
  };
  /** Extra header actions, such as the close-year or back links. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-4">
        <StatusBadge status={status} />
        {children}
      </div>
      {activation ? (
        <Form
          action={activation.action}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
        >
          <HiddenField name="id" value={activation.id} />
          <div className="w-64">
            <ReasonField hint={activation.hint} />
          </div>
          <SubmitButton pendingLabel={ACTIVATION_PENDING_LABEL}>{activation.label}</SubmitButton>
        </Form>
      ) : null}
    </div>
  );
}
