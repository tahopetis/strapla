import type { ExportDocument } from '@/lib/report-export';
import { listAuditEntries, type AuditFilters } from './queries';

/** CSV export of the audit trail, sharing the same filters as the audit page. */
export async function buildAuditDocument(filters: AuditFilters): Promise<ExportDocument> {
  const entries = await listAuditEntries(filters, 5000);
  const filterParts = [
    filters.q ? `text "${filters.q}"` : null,
    filters.entityType ? `entity ${filters.entityType}` : null,
    filters.action ? `action ${filters.action}` : null,
    filters.actorUserId ? 'actor filter' : null,
  ].filter(Boolean);

  return {
    title: 'Audit trail',
    subtitle: 'Strapla — append-only change log (ADR-0004)',
    generatedAt: new Date(),
    note: `Filters: ${filterParts.length > 0 ? filterParts.join(' · ') : 'none'}. Showing ${entries.length} entries (latest first, max 5000).`,
    tables: [
      {
        name: 'Audit entries',
        columns: [
          { key: 'when', header: 'When (UTC)' },
          { key: 'actor', header: 'Actor' },
          { key: 'actorEmail', header: 'Actor email' },
          { key: 'action', header: 'Action' },
          { key: 'entityType', header: 'Entity type' },
          { key: 'entityId', header: 'Entity id' },
          { key: 'reason', header: 'Reason' },
          { key: 'before', header: 'Before' },
          { key: 'after', header: 'After' },
        ],
        rows: entries.map((row) => ({
          when: row.entry.createdAt.toISOString(),
          actor: row.actorName ?? 'system',
          actorEmail: row.actorEmail ?? '',
          action: row.entry.action,
          entityType: row.entry.entityType,
          entityId: row.entry.entityId,
          reason: row.entry.reason ?? '',
          before: row.entry.before ? JSON.stringify(row.entry.before) : '',
          after: row.entry.after ? JSON.stringify(row.entry.after) : '',
        })),
      },
    ],
  };
}
