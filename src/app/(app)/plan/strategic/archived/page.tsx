import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanNav } from '@/components/plan-nav';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { listArchivedPlans } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Archived plans' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

/**
 * The read-only register of ended plans (#109, ADR-0008). Each name opens the
 * plan's own read-only page; the archive date and reason come from the
 * status-change audit entry that archived it.
 */
export default async function ArchivedPlansPage() {
  const rows = await listArchivedPlans();

  return (
    <div>
      <PageHeader
        title="Archived plans"
        description="Strategic plans that ended. They stay readable and read-only."
      />
      <PlanNav />

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No archived strategic plans.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Horizon</th>
                  <th className="py-2 pr-4">Archived</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.plan.id}>
                    <td className="py-3 pr-4 font-medium">
                      <Link href={`/plan/strategic/${row.plan.id}`} className={linkClass}>
                        {row.plan.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.plan.startFiscalYear}–{row.plan.endFiscalYear}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {row.archivedAt ? formatDate(row.archivedAt) : '—'}
                    </td>
                    <td className="py-3">{row.archivedReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
