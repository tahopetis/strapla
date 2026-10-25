import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Plan' };

const issues = [
  { number: 5, title: 'Strategic plan and strategic initiatives' },
  { number: 6, title: 'Annual plan lifecycle' },
  { number: 7, title: 'Annual programs with budgets and continuation links' },
  { number: 8, title: 'Projects — full-life record and ijin prinsip' },
  { number: 9, title: 'Recurring ops items' },
  { number: 10, title: 'Opening balances entry and reconciliation' },
  { number: 11, title: 'Plan data screens, navigation and E2E happy path' },
];

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="mt-1 text-sm text-slate-600">
          M1 delivers the five-year plan and the annual plan: strategic plan, SIs with envelopes,
          annual programs, projects with full-life figures and their ijin prinsip, recurring ops
          items, and the opening balances for FY2027.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">M1 Plan — issues</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {issues.map((issue) => (
            <li key={issue.number}>
              <a
                className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                href={`https://github.com/tahopetis/strapla/issues/${issue.number}`}
              >
                #{issue.number} {issue.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
