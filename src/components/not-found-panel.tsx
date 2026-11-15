import Link from 'next/link';
import type { ReactNode } from 'react';
import { primaryButtonClass } from '@/components/ui';

/**
 * Shared 404 body. The root not-found and the signed-in not-found each render
 * it with a different way back: sign-in for the public app, dashboard inside
 * the shell.
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
        <Link href={href} className={primaryButtonClass}>
          {label}
        </Link>
      </p>
    </div>
  );
}
