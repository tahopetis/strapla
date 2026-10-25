import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

export interface HistoryEntry {
  entry: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string | null;
    createdAt: Date;
  };
  actorEmail: string | null;
  actorName: string | null;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatJson(value: Record<string, unknown> | null): ReactNode {
  if (!value) return '—';
  return (
    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-600">
      {JSON.stringify(value, null, 1)}
    </pre>
  );
}

export function EntityHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Card
      title="Change history"
      description="Append-only audit entries for this record (ADR-0004); reasons are required on updates and voids."
    >
      {entries.length === 0 ? (
        <p className="text-sm text-slate-600">No changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2">Before / after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((history) => (
                <tr key={history.entry.id}>
                  <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                    {dateFormatter.format(history.entry.createdAt)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {history.actorName ?? 'system'}
                    {history.actorEmail ? (
                      <p className="text-xs text-slate-500">{history.actorEmail}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap font-medium">{history.entry.action}</td>
                  <td className="py-3 pr-4 text-slate-600">{history.entry.reason ?? '—'}</td>
                  <td className="py-3">
                    <details>
                      <summary className="cursor-pointer text-xs text-slate-500">Show values</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Before</p>
                          {formatJson(history.entry.before)}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">After</p>
                          {formatJson(history.entry.after)}
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
  );
}
