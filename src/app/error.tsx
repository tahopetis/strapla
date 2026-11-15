'use client';

import ErrorPanel from '@/components/error-panel';

/**
 * Root boundary. It wraps the nested layouts, which is what catches a failure
 * in the signed-in shell's session lookup — an `(app)/error.tsx` cannot wrap
 * the layout in its own segment.
 */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
