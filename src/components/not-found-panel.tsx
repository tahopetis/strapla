import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared 404 body. The root layout and the signed-in shell render it with a
 * different way back: sign-in for the public app, dashboard inside the shell.
 */
export function NotFoundPanel({
  message,
  href,
  label,
}: {
  message: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <p className="mt-6">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {label}
        </Link>
      </p>
    </div>
  );
}
