'use client';

import { useId, useState, type ReactNode } from 'react';
import { secondaryButtonClass } from '@/components/ui';

/**
 * The closed-year correction affordance (ADR-0007 §7, issue #108).
 *
 * A closed page keeps its read-only frame: the existing edit form is not in the
 * DOM at all until this button is pressed. Pressing it replaces the button with
 * the closed-year banner and the **existing** form (the caller passes the same
 * form element the open-year page uses — never a second form or a different
 * field set), plus a cancel control that hides everything again.
 *
 * Keeping the form out of the DOM is deliberate: it is what makes "this page is
 * read-only" testable, and it stops a stray Enter from submitting an edit the
 * user did not mean to open. The reason field inside the form is the ceremony
 * (ADR-0007 §7), so there is no extra typed confirmation.
 */
export function CorrectionDisclosure({
  children,
  className,
}: {
  children: ReactNode;
  /** Override the card-body wrapper spacing, e.g. inside a table cell. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <div
      id={regionId}
      className={className ?? 'mt-5 border-t border-slate-100 pt-4'}
    >
      {open ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="max-w-prose text-sm text-amber-900">
              This fiscal year is closed. Saving is recorded as a correction after close, and the close snapshot does not change.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={regionId}
          className={secondaryButtonClass}
        >
          Correct record
        </button>
      )}
    </div>
  );
}
