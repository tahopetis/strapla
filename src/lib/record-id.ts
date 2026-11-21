/**
 * Dynamic record ids are UUID primary keys. A segment that is not one must take
 * the framework's not-found path before it reaches a query, or Postgres rejects
 * the cast and the route error boundary renders a 500 instead of the app's 404
 * (#103). Framework-free so the route boundary and its unit test share one
 * definition.
 */

/** Canonical hyphenated UUID form, matching every record id the app links to. */
const RECORD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the value has the shape of a record id. No database lookup is
 * involved: a well-formed id may still point at a missing record.
 */
export function isRecordId(value: string | null | undefined): value is string {
  return typeof value === 'string' && RECORD_ID_PATTERN.test(value);
}
