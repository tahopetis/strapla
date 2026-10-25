import Link from 'next/link';
import type { ReactNode } from 'react';
import { logoutAction } from '@/server/auth/actions';
import { requireUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const navigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan' },
  { href: '/funding', label: 'Funding' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Administration' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="app-header border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
              Strapla
            </Link>
            <span className="hidden text-xs text-slate-500 sm:inline">IT portfolio management</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.name}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="app-shell mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav aria-label="Main" className="app-nav w-52 shrink-0">
          <ul className="space-y-1 text-sm">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded px-3 py-2 text-slate-700 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 px-3 text-xs text-slate-500">
            M2 funding: allocations, budgets and flags are live, with reports and exports. Administrator accounts and the audit view land next.
          </p>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
