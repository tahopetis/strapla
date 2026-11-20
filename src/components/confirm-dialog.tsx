'use client';

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useActionState,
  type ReactNode,
  type RefObject,
} from 'react';
import { initialFormState, type FormAction } from '@/lib/form-state';
import { FormMessage, FormStateProvider, SubmitButton } from './form';
import { dangerButtonClass, secondaryButtonClass } from './ui';

/**
 * Native `<dialog>` confirmation for destructive actions (W5b). The trigger
 * opens a modal that states the consequence in one sentence and carries the
 * reason field, so a void, archive, deactivate or remove cannot happen by a
 * stray click. Validation state is returned by the action and reopens the
 * dialog with every value intact.
 *
 * The form is remounted every time the dialog closes, so a cancelled
 * confirmation cannot leave the previous error message and reason behind.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [session, setSession] = useState(0);

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
        onClose={() => setSession((value) => value + 1)}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <ConfirmDialogForm
          key={session}
          action={action}
          title={title}
          titleId={titleId}
          consequence={consequence}
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          dialogRef={dialogRef}
        >
          {children}
        </ConfirmDialogForm>
      </dialog>
    </>
  );
}

function ConfirmDialogForm({
  action,
  title,
  titleId,
  consequence,
  confirmLabel,
  children,
  pendingLabel,
  dialogRef,
}: {
  action: FormAction;
  title: string;
  titleId: string;
  consequence: string;
  confirmLabel: string;
  children?: ReactNode;
  pendingLabel: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  // A refused submission comes back as state: reopen the dialog so the error
  // and the values the user typed are visible where they were entered.
  useEffect(() => {
    if (state.attempt > 0) {
      const dialog = dialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
    }
  }, [state.attempt, dialogRef]);

  return (
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
  );
}
