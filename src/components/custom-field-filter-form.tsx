'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { inputClass, labelClass, secondaryButtonClass } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldFilter } from '@/domain/custom-fields';
import { customFieldFilterHref } from './report-filter-links';

/**
 * The report's custom-field filter bar (#74).
 *
 * Active filters are rendered as removable chips, and the form appends one more
 * instead of replacing what is already there: submitting a pair while filters
 * are active merges it with them, so several custom fields narrow the rows
 * together (AND). Every link carries the explicit `columns` selection when the
 * URL has one, and the URL it navigates to stays shareable and reloadable.
 *
 * The carried filters are deliberately kept in props rather than in hidden
 * `cf`/`cv` inputs: the page must keep exactly one `select[name="cf"]` and one
 * `input[name="cv"]` for the shared selectors. Without JavaScript the form
 * still submits natively (a GET that replaces the filter list), which keeps the
 * basic case working.
 */
export function CustomFieldFilterForm({
  fields,
  action,
  filters,
  columnSelection,
}: {
  fields: readonly CustomFieldDefinition[];
  action: string;
  /** The filters already active, in URL order. */
  filters: readonly CustomFieldFilter[];
  /**
   * The explicit export-column selection to carry through every link. Omitted
   * when the URL names no selection, so a saved choice keeps applying.
   */
  columnSelection?: readonly string[];
}) {
  const router = useRouter();
  if (fields.length === 0) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fieldId = String(data.get('cf') ?? '').trim();
    const query = String(data.get('cv') ?? '').trim();
    const field = fields.find((candidate) => candidate.id === fieldId);
    const alreadyActive =
      field !== undefined &&
      filters.some((filter) => filter.field.id === field.id && filter.query === query);
    const nextFilters =
      field !== undefined && query.length > 0 && !alreadyActive
        ? [...filters, { field, query }]
        : filters;

    // The pair now lives in the chips; clear the inputs so the next filter starts fresh.
    form.reset();
    router.push(customFieldFilterHref(action, nextFilters, columnSelection));
  }

  const clearHref = customFieldFilterHref(action, [], columnSelection);

  return (
    <div className="space-y-3">
      {filters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Filters</span>
          {filters.map((filter, index) => (
            <span
              key={`${filter.field.id}-${index}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 py-1 pl-3 pr-1 text-xs text-slate-700"
            >
              <span>
                {filter.field.name}: “{filter.query}”
              </span>
              <a
                href={customFieldFilterHref(action, filters, columnSelection, index)}
                aria-label={`Remove filter ${filter.field.name} “${filter.query}”`}
                className="rounded-full px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              >
                ×
              </a>
            </span>
          ))}
          <a
            href={clearHref}
            className="text-xs text-slate-600 underline decoration-slate-300 hover:text-slate-900"
          >
            Clear all
          </a>
        </div>
      ) : null}

      <form method="get" action={action} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        {columnSelection !== undefined ? (
          <>
            {/* Present even when nothing is ticked, so "no extra columns" stays expressible. */}
            <input type="hidden" name="columns" value="" />
            {columnSelection.map((id) => (
              <input key={id} type="hidden" name="columns" value={id} />
            ))}
          </>
        ) : null}
        <label className={`${labelClass} block`}>
          Custom field
          <select name="cf" defaultValue="" className={inputClass}>
            <option value="">No custom-field filter</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} block`}>
          Value
          <input
            name="cv"
            defaultValue=""
            placeholder="Part of the text or an exact number/date"
            className={inputClass}
          />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Apply filter
        </button>
      </form>
    </div>
  );
}
