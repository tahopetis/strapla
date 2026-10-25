import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { listAuditActors, listAuditEntries, listAuditEntityTypes } from '@/server/admin/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit trail' };

const selectClass =
  'mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const labelClass = 'block text-sm font-medium text-slate-700';

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; actor?: string }>;
}) {
  const { entityType, actor } = await searchParams;
  const [entries, entityTypes, actors] = await Promise.all([
    listAuditEntries({ entityType, actorUserId: actor, limit: 200 }),
    listAuditEntityTypes(),
    listAuditActors(),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only record of every change: actor, action, entity, before/after values and reason (ADR-0004)."
        actions={
          <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            ← Administration
          </Link>
        }
      />

      <div className="space-y-6">
        <Card title="Filter" description={`Showing the latest ${entries.length} matching entries (max 200).`}>
          <form method="get" action="/admin/audit" className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Entity type
              <select name="entityType" defaultValue={entityType ?? ''} className={selectClass}>
                <option value="">All entity types</option>
                {entityTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Actor
              <select name="actor" defaultValue={actor ?? ''} className={selectClass}>
                <option value="">All actors</option>
                {actors.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Filter
              </button>
              <Link
                href="/admin/audit"
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear
              </Link>
            </div>
          </form>
        </Card>

        <Card title="Entries" description="Newest first. Values open in place.">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-600">No audit entries match the filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Entity</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2">Values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((row) => (
                    <tr key={row.entry.id}>
                      <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                        {formatDateTime(row.entry.createdAt)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {row.actorName ?? 'system'}
                        {row.actorEmail ? (
                          <p className="text-xs text-slate-500">{row.actorEmail}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-medium">{row.entry.action}</td>
                      <td className="py-3 pr-4">
                        <p>{row.entry.entityType}</p>
                        <p className="break-all font-mono text-[11px] text-slate-500">{row.entry.entityId}</p>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{row.entry.reason ?? '—'}</td>
                      <td className="py-3">
                        <details>
                          <summary className="cursor-pointer text-xs text-slate-500">Show values</summary>
                          <div className="mt-2 grid max-w-xl gap-2">
                            <div>
                              <p className="text-xs font-medium text-slate-500">Before</p>
                              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-600">
                                {row.entry.before ? JSON.stringify(row.entry.before, null, 1) : '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500">After</p>
                              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-600">
                                {row.entry.after ? JSON.stringify(row.entry.after, null, 1) : '—'}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
