'use client';

import { useEffect } from 'react';
import { primaryButtonClass } from '@/components/ui';

/** Next forwards `digest` on server errors only; anything else is ignored. */
function errorDigest(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' ? digest : undefined;
}

/**
 * Shared error boundary UI. Next 16 passes `retry`, which re-fetches the
 * segment (preferred over `reset`, which only clears the error state). The
 * signed-in shell's navigation stays usable because this boundary renders
 * inside it; the root boundary is the one that replaces a broken layout.
 */
export default function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = errorDigest(error);

  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This screen could not be loaded. Trying again usually works; if it does not, tell the
        administrator what you were doing{digest ? ', quoting the reference below' : ''}.
      </p>

      {digest ? (
        <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
          Reference: {digest}
        </p>
      ) : null}

      <div className="mt-6">
        <button type="button" onClick={() => retry()} className={primaryButtonClass}>
          Try again
        </button>
      </div>
    </div>
  );
}
