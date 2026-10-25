import type { Metadata } from 'next';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { auditEntries, users } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

async function loadCounts(): Promise<{ users: number; auditEntries: number } | null> {
  try {
    const db = getDb();
    const [userCount, auditCount] = await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(users),
      db.select({ value: sql<number>`count(*)::int` }).from(auditEntries),
    ]);
    return {
      users: userCount[0]?.value ?? 0,
      auditEntries: auditCount[0]?.value ?? 0,
    };
  } catch (error) {
    console.error('dashboard: could not load counts', error);
    return null;
  }
}

const working = [
  'Local administrator accounts: first-run setup, sign in, sign out',
  'Database-backed sessions (HttpOnly cookie, SHA-256 token hashes)',
  'Append-only audit trail with a shared mutation helper',
  'PostgreSQL 18 schema and migrations; /healthz reports database health',
  'CI (typecheck, lint, tests, build) and multi-arch Docker images',
];

const next = [
  { milestone: 'M1 Plan', detail: 'Strategic plan, SIs, annual plans, programs, projects, recurring ops, opening balances' },
  { milestone: 'M2 Funding', detail: 'Allocations, ijin prinsip, pricing chain, balances and flags' },
  { milestone: 'M2.5 Insight', detail: 'Reports, CSV/XLSX exports, print views, administrator accounts' },
];

export default async function DashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          The walking skeleton is running. Authenticated pages, the database, the audit trail and
          deployments are in place; the portfolio modules are next.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Administrators</p>
          <p className="mt-1 text-2xl font-semibold">{counts ? counts.users : '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Audit entries</p>
          <p className="mt-1 text-2xl font-semibold">{counts ? counts.auditEntries : '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Database</p>
          <p className="mt-1 text-2xl font-semibold">{counts ? 'Connected' : 'Unavailable'}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">In place (M0)</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {working.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-emerald-600">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Coming next</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {next.map((item) => (
              <li key={item.milestone}>
                <p className="font-medium text-slate-800">{item.milestone}</p>
                <p className="text-slate-600">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Source of truth: <span className="font-mono">docs/CHARTER.md</span>, ADR-0001..0004 and{' '}
        <span className="font-mono">docs/data-model.md</span>.
      </p>
    </div>
  );
}
