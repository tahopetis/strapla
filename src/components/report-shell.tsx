import type { ReactNode } from 'react';
import { PrintButton } from '@/components/print-button';
import { secondaryButtonClass } from '@/components/ui';
import type { ReportKey } from '@/server/plan/report-tables';

export function ReportShell({
  title,
  description,
  reportKey,
  children,
}: {
  title: string;
  description: ReactNode;
  reportKey: ReportKey;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-1 text-sm text-slate-600">{description}</div>
        </div>
        <div className="screen-only flex flex-wrap items-center gap-2">
          <a className={secondaryButtonClass} href={`/reports/export/${reportKey}?format=csv`}>
            CSV
          </a>
          <a className={secondaryButtonClass} href={`/reports/export/${reportKey}?format=xlsx`}>
            XLSX
          </a>
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
