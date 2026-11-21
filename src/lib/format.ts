/**
 * Display formatting shared by the UI and reports.
 * Storage is UTC; display is Asia/Jakarta (charter §6.2).
 */

export const TIME_ZONE = 'Asia/Jakarta';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(value: Date | string): string {
  return dateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

const datePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ISO date input value (YYYY-MM-DD) for a Date, in the app time zone. */
export function toDateInputValue(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = datePartsFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Header build label for `STRAPLA_VERSION`, which carries a release tag
 * (`v0.5.0`) or a branch name (`main`). Version-like values are normalised to a
 * single `v` prefix so a tag build never renders `vv0.5.0`; branch names are
 * shown as they are.
 */
export function formatBuildVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return 'dev';
  const withoutPrefix = trimmed.replace(/^v+/, '');
  return /^\d+(\.\d+)*$/.test(withoutPrefix) ? `v${withoutPrefix}` : trimmed;
}
