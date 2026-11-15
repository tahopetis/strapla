'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route-level error boundary for the signed-in app. Next 16 passes `retry`,
 * which re-fetches the segment (preferred over `reset`, which only clears the
 * error state).
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This screen could not be loaded. Trying again usually works; if it does not, send the reference
        below to the administrator so the cause can be found in the logs.
      </p>

      {digest ? (
        <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
          Reference: {digest}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center justify-center rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
