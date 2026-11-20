'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/auth/session';
import { isReportPreferenceKey, saveReportColumnPreference } from './report-preferences';
import type { ReportKey } from './report-tables';

/**
 * The custom-column selection payload of a report's "save selection" control.
 * Field ids are registry UUIDs; an empty list is valid and means "no extra
 * columns". The cap keeps a malformed client from writing an unbounded list
 * into the preference row.
 */
const saveReportColumnsSchema = z.object({
  reportKey: z.custom<ReportKey>(
    (value) => typeof value === 'string' && isReportPreferenceKey(value),
    { message: 'Unknown report.' },
  ),
  columnIds: z.array(z.string().uuid()).max(100),
});

/**
 * Persists the report's custom-column selection for the signed-in user (#75).
 *
 * Called by the report's "save selection" control. The report reads the saved
 * selection only when the request carries no explicit `columns` parameter, so a
 * shareable link still shows exactly the columns in its URL; this action takes
 * the visitor back to that parameter-less URL so the saved choice is what they
 * see. The input is validated here at the server boundary — the client is not
 * trusted for the report key or the field ids.
 */
export async function saveReportColumnsAction(
  reportKey: string,
  columnIds: readonly string[],
): Promise<{ reportKey: ReportKey }> {
  const user = await requireUser();
  const parsed = saveReportColumnsSchema.safeParse({ reportKey, columnIds });
  if (!parsed.success) {
    throw new Error('Invalid report column selection.');
  }

  await saveReportColumnPreference(user.id, parsed.data.reportKey, parsed.data.columnIds);
  revalidatePath(`/reports/${parsed.data.reportKey}`);
  return { reportKey: parsed.data.reportKey };
}
