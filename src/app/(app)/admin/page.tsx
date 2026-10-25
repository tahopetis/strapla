import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administration' };

export default async function AdminPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every account is an administrator in v1 (ADR-0004). Member management and the audit-trail
          view ship in M2.5.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Signed in as</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <p>
          Tracked as <a className="underline" href="https://github.com/tahopetis/strapla/issues/16">#16 administrator accounts and audit trail view</a>.
          Until then, accounts can be created from the server-side helper in{' '}
          <span className="font-mono">src/server/auth/users.ts</span>.
        </p>
      </div>
    </div>
  );
}
