import type { CustomFieldFilter } from '@/domain/custom-fields';

/**
 * URL construction for the report's custom-field filter links (#74).
 *
 * A filter is carried as a repeated `cf`/`cv` pair, paired by index when the
 * page reads the query string (`resolveCustomFieldFilters`). Keeping the
 * building of those links in one pure function means the filter form, the
 * removable chips and the "clear all" link cannot disagree about the shape of a
 * shareable, reloadable report URL.
 *
 * An explicit `columns` selection is carried through unchanged, because the
 * page shows exactly the columns named in its URL: `undefined` means the URL
 * names none (so the remembered selection applies), while an empty list is the
 * explicit "no extra columns" choice and is written as `columns=`.
 */
export function customFieldFilterHref(
  action: string,
  filters: readonly CustomFieldFilter[],
  columnSelection?: readonly string[],
  /** Index of the filter to leave out, for a chip's remove link. */
  omitIndex?: number,
): string {
  const params = new URLSearchParams();

  filters.forEach((filter, index) => {
    if (index === omitIndex) return;
    params.append('cf', filter.field.id);
    params.append('cv', filter.query);
  });

  if (columnSelection !== undefined) {
    if (columnSelection.length === 0) {
      params.append('columns', '');
    } else {
      for (const id of columnSelection) params.append('columns', id);
    }
  }

  const query = params.toString();
  return query.length === 0 ? action : `${action}?${query}`;
}
