import type { ReactNode } from 'react';
import { PrintButton } from '@/components/print-button';
import { ReportExportForm } from '@/components/report-export-form';
import { secondaryButtonClass } from '@/components/ui';
import type { CustomFieldDefinition } from '@/domain/custom-fields';
import type { ReportKey } from '@/server/plan/report-tables';

export function ReportShell({
  title,
  description,
  reportKey,
  exportFields = [],
  selectedExportFieldIds,
  children,
}: {
  title: string;
  description: ReactNode;
  reportKey: ReportKey;
  /** Custom-field columns that can be included in an export (issue #46). */
  exportFields?: readonly CustomFieldDefinition[];
  /**
   * Ticked fields: the request's explicit selection, else the user's saved one,
   * else every active field (#75). The exports stay whole-report GETs.
   */
  selectedExportFieldIds?: readonly string[];
  children: ReactNode;
}) {
  const hasExtraColumns = exportFields.length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-1 text-sm text-slate-600">{description}</div>
        </div>
        <div className="screen-only flex flex-wrap items-center gap-2">
          {hasExtraColumns ? (
            <ReportExportForm
              reportKey={reportKey}
              exportFields={exportFields}
              selectedExportFieldIds={selectedExportFieldIds}
            />
          ) : (
            <>
              <a className={secondaryButtonClass} href={`/reports/export/${reportKey}?format=csv`}>
                CSV
              </a>
              <a className={secondaryButtonClass} href={`/reports/export/${reportKey}?format=xlsx`}>
                XLSX
              </a>
            </>
          )}
          <PrintButton />
        </div>
      </div>
      <div className="report-body space-y-6">{children}</div>
    </div>
  );
}

export function ReportNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {children}
    </p>
  );
}
