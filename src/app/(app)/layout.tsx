import Link from 'next/link';
import type { ReactNode } from 'react';
import { SubmitButton } from '@/components/form';
import { logoutAction } from '@/server/auth/actions';
import { requireUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const navigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan' },
  { href: '/funding', label: 'Funding' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Administration' },
  { href: '/help', label: 'Help' },
];

const buildVersion = process.env.STRAPLA_VERSION ?? 'dev';
const buildCommit = process.env.STRAPLA_COMMIT ?? null;
const versionLabel = buildCommit ? `${buildVersion} · ${buildCommit.slice(0, 7)}` : buildVersion;

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
            <span
              className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 sm:inline"
              title="Running build (version · commit)"
            >
              v{versionLabel}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.name}</span>
            <form action={logoutAction}>
              <SubmitButton
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                pendingLabel="Signing out…"
              >
                Sign out
              </SubmitButton>
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
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
