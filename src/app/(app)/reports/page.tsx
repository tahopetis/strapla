import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Reports' };

const reports = [
  {
    href: '/reports/si-five-year',
    title: 'SI five-year view',
    description:
      'Capex and opex envelopes separately, with prior consumption, effective program budgets, allocations, commitments, spend and headroom per strategic initiative across the horizon.',
  },
  {
    href: '/reports/annual-plan',
    title: 'Annual plan by SI and program',
    description:
      'Every annual program with capex/opex budget, carry-in, allocated and unallocated money, plus recurring operations with their committed, spent, prior-year opening and remaining opex.',
  },
  {
    href: '/reports/project-register',
    title: 'Project register',
    description:
      'Full-life figures, ijin prinsip approval, allocations, lifetime commitments and funding flags for every project.',
  },
  {
    href: '/reports/budget-vs-actual',
    title: 'Budget versus actual',
    description:
      'Program-level budget versus allocated, committed and spent money, with prior-year settlement and prior-year opening lines from the execution module.',
  },
];

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Budget versus actual and commitment versus contract at every level, ready for directors and finance."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.href} title={report.title} actions={<Badge tone="success">live</Badge>}>
            <p className="text-sm text-slate-700">{report.description}</p>
            <p className="mt-4 text-sm">
              <Link href={report.href} className={linkClass}>
                Open report
              </Link>
            </p>
          </Card>
        ))}
      </div>

      <Card title="Exports and print views" description="Every report carries the same table definitions on screen and in the exports.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>CSV downloads for finance consolidation and spreadsheet working.</li>
          <li>XLSX workbooks with one sheet per report table and raw Rupiah integers.</li>
          <li>Print / PDF views that hide the application chrome and keep the tables intact.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Commitments and actual spend come from the execution module; cross-year settlements and prior-year
          opening payments are reported separately. The audit trail is under Administration.
        </p>
      </Card>
    </div>
  );
}
