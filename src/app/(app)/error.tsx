'use client';

import ErrorPanel from '@/components/error-panel';

/** Screen-level boundary inside the signed-in shell (page data failures). */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
