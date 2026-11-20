'use client';

import { Fragment, useEffect, useId, useRef, useActionState, type ReactNode } from 'react';
import { initialFormState, type FormAction } from '@/lib/form-state';
import { FormMessage, FormStateProvider, SubmitButton } from './form';
import { dangerButtonClass, secondaryButtonClass } from './ui';

/**
 * Native `<dialog>` confirmation for destructive actions (W5b). The trigger
 * opens a modal that states the consequence in one sentence and carries the
 * reason field, so a void, archive, deactivate or remove cannot happen by a
 * stray click. Validation state is returned by the action and reopens the
 * dialog with every value intact.
 */
export function ConfirmDialog({
  action,
  triggerLabel,
  title,
  consequence,
  confirmLabel,
  children,
  triggerClassName,
  pendingLabel = 'Saving…',
}: {
  action: FormAction;
  triggerLabel: string;
  title: string;
  /** The consequence in one sentence, shown above the reason field. */
  consequence: string;
  confirmLabel: string;
  children?: ReactNode;
  triggerClassName?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // A refused submission comes back as state: reopen the dialog so the error
  // and the values the user typed are visible where they were entered.
  useEffect(() => {
    if (state.attempt > 0) {
      const dialog = dialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
    }
  }, [state.attempt]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const dialog = dialogRef.current;
          if (dialog && !dialog.open) dialog.showModal();
        }}
        className={triggerClassName ?? dangerButtonClass}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <form action={formAction} className="space-y-4 p-5">
          <FormStateProvider value={{ state, pending }}>
            <div className="space-y-1">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <p className="text-sm text-slate-600">{consequence}</p>
            </div>

            <FormMessage state={state} />
            <Fragment key={state.attempt}>{children}</Fragment>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className={secondaryButtonClass}
                disabled={pending}
              >
                Cancel
              </button>
              <SubmitButton variant="danger" pendingLabel={pendingLabel}>
                {confirmLabel}
              </SubmitButton>
            </div>
          </FormStateProvider>
        </form>
      </dialog>
    </>
  );
}
