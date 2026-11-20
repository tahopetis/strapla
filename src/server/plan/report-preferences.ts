import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reportPreferences } from '@/db/schema';
import type { ReportKey } from './report-tables';

/**
 * Remembered custom-column selection per user and report (issue #75).
 *
 * The preference is a list of custom-field ids, not a copy of the registry:
 * reading resolves it against the live active fields, so a field archived since
 * the choice was saved drops out instead of resurrecting. A saved empty list
 * means "no extra columns"; no row means "never chosen" and the report shows
 * every active field. An explicit `?columns=` parameter always wins for that
 * request and is never stored by a plain report read.
 */

/** Every report the preference table accepts, for validation at the action boundary. */
export const REPORT_PREFERENCE_KEYS: readonly ReportKey[] = [
  'si-five-year',
  'annual-plan',
  'project-register',
  'budget-vs-actual',
];

export function isReportPreferenceKey(value: string): value is ReportKey {
  return (REPORT_PREFERENCE_KEYS as readonly string[]).includes(value);
}

/** The saved selection, or null when this user has never chosen columns for the report. */
export async function readReportColumnPreference(
  userId: string,
  report: ReportKey,
): Promise<string[] | null> {
  const rows = await getDb()
    .select({ columnIds: reportPreferences.columnIds })
    .from(reportPreferences)
    .where(
      and(eq(reportPreferences.userId, userId), eq(reportPreferences.reportKey, report)),
    )
    .limit(1);
  return rows[0]?.columnIds ?? null;
}

/**
 * Upserts one report's remembered selection. Ids are de-duplicated in the order
 * the form submitted; unknown and archived ids are harmless because every read
 * intersects them with the active registry.
 */
export async function saveReportColumnPreference(
  userId: string,
  report: ReportKey,
  columnIds: readonly string[],
): Promise<void> {
  const next = [...new Set(columnIds)];
  await getDb()
    .insert(reportPreferences)
    .values({ userId, reportKey: report, columnIds: next })
    .onConflictDoUpdate({
      target: [reportPreferences.userId, reportPreferences.reportKey],
      set: { columnIds: next, updatedAt: new Date() },
    });
}
