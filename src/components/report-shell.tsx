import type { ReactNode } from 'react';
import { PrintButton } from '@/components/print-button';
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
  /** Checked fields; defaults to all so the export matches the screen. */
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
            <form
              method="get"
              action={`/reports/export/${reportKey}`}
              className="flex flex-wrap items-center gap-2"
            >
              {/* Present even when nothing is ticked, so "no extra columns" is expressible. */}
              <input type="hidden" name="columns" value="" />
              <details className="relative">
                <summary className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Extra columns
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded border border-slate-200 bg-white p-3 text-sm shadow-lg">
                  <p className="text-xs text-slate-500">
                    Tick the custom columns to include in the export. Untick all to leave them out.
                  </p>
                  {exportFields.map((field) => (
                    <label key={field.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="columns"
                        value={field.id}
                        defaultChecked={selectedExportFieldIds?.includes(field.id) ?? true}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {field.name}
                    </label>
                  ))}
                  <p className="text-xs text-slate-500">
                    The export always covers the whole report; a custom-field filter on screen is not applied.
                  </p>
                </div>
              </details>
              <button type="submit" name="format" value="csv" className={secondaryButtonClass}>
                CSV
              </button>
              <button type="submit" name="format" value="xlsx" className={secondaryButtonClass}>
                XLSX
              </button>
            </form>
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
