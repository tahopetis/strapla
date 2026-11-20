'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/session';
import { isReportPreferenceKey, saveReportColumnPreference } from './report-preferences';

/**
 * Persists the report's custom-column selection for the signed-in user (#75).
 *
 * Called by the report's "save selection" control. The report reads the saved
 * selection only when the request carries no explicit `columns` parameter, so a
 * shareable link still shows exactly the columns in its URL; this action takes
 * the visitor back to that parameter-less URL so the saved choice is what they
 * see. A bogus report key is refused rather than stored.
 */
export async function saveReportColumnsAction(
  reportKey: string,
  columnIds: readonly string[],
): Promise<{ reportKey: string }> {
  const user = await requireUser();
  if (!isReportPreferenceKey(reportKey)) {
    throw new Error('Unknown report.');
  }

  await saveReportColumnPreference(user.id, reportKey, columnIds);
  revalidatePath(`/reports/${reportKey}`);
  return { reportKey };
}
