'use client';

import { useRef, useState, useTransition } from 'react';
import { secondaryButtonClass } from '@/components/ui';
import type { CustomFieldDefinition } from '@/domain/custom-fields';
import { saveReportColumnsAction } from '@/server/plan/report-preference-actions';
import type { ReportKey } from '@/server/plan/report-tables';

/**
 * The report's export controls and the "save selection" control (#75).
 *
 * The checkboxes start from the report's resolved selection, so with no
 * `columns` parameter in the URL they show the signed-in user's saved choice.
 * Exporting stays a plain GET to the read-only export route with an explicit
 * `columns` value per ticked field (plus a blank one, so unticking everything
 * stays expressible); the export route is never given a reason to write.
 *
 * Saving is a button, not a form submit, so the preference is only written when
 * the visitor asks for it: a page GET or an export GET never touches the table.
 */
export function ReportExportForm({
  reportKey,
  exportFields,
  selectedExportFieldIds,
}: {
  reportKey: ReportKey;
  /** Every active custom-field column the export can carry. */
  exportFields: readonly CustomFieldDefinition[];
  /** Ticked fields; when omitted every active field is ticked. */
  selectedExportFieldIds?: readonly string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedExportFieldIds ?? exportFields.map((field) => field.id);

  function saveSelection() {
    const form = formRef.current;
    if (!form) return;
    const columnIds = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="columns"]:checked'),
    )
      .map((input) => input.value)
      .filter((id) => id.length > 0);
    const names = exportFields
      .filter((field) => columnIds.includes(field.id))
      .map((field) => field.name);

    setNotice(null);
    setError(null);
    startTransition(async () => {
      try {
        await saveReportColumnsAction(reportKey, columnIds);
        setNotice(
          names.length === 0
            ? 'Selection saved. This report will show no extra custom columns.'
            : `Selection saved: ${names.join(', ')}.`,
        );
      } catch {
        setError('Could not save the selection. Try again.');
      }
    });
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={`/reports/export/${reportKey}`}
      className="flex flex-wrap items-center gap-2"
    >
      {/* Present even when nothing is ticked, so "no extra columns" is expressible. */}
      <input type="hidden" name="columns" value="" />
      <details className="relative">
        <summary className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Extra columns
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded border border-slate-200 bg-white p-3 text-sm shadow-lg">
          <p className="text-xs text-slate-500">
            Tick the custom columns to include in the export. Untick all to leave them out.
          </p>
          {exportFields.map((field) => (
            <label key={field.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="columns"
                value={field.id}
                defaultChecked={selected.includes(field.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {field.name}
            </label>
          ))}
          <div className="space-y-1 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={saveSelection}
              disabled={pending}
              className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {pending ? 'Saving…' : 'Save selection'}
            </button>
            {notice ? (
              <p role="status" className="text-xs text-emerald-700">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-red-700">
                {error}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Saving keeps this ticked set for you on every visit that does not name columns in
              its link.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            The export always covers the whole report; a custom-field filter on screen is not applied.
          </p>
        </div>
      </details>
      <button type="submit" name="format" value="csv" className={secondaryButtonClass}>
        CSV
      </button>
      <button type="submit" name="format" value="xlsx" className={secondaryButtonClass}>
        XLSX
      </button>
    </form>
  );
}
