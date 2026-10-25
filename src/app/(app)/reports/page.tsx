import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          The December release ships the SI five-year view, the annual plan by SI and program, and the
          project register — each with capex/opex separation, over-budget flags, CSV/XLSX exports and
          print-friendly views for directors and finance.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <p>
          Tracked as <a className="underline" href="https://github.com/tahopetis/strapla/issues/15">#15 reports and exports</a>{' '}
          and delivered in M2.5. Budget-versus-actual and commitment-versus-contract fill in as M3
          data arrives.
        </p>
      </div>
    </div>
  );
}
