import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Funding' };

const issues = [
  { number: 12, title: 'Project year allocations' },
  { number: 13, title: 'Balances and flag engine' },
  { number: 14, title: 'Pricing chain and contract value' },
  { number: 15, title: 'Reports and exports' },
];

export default function FundingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funding</h1>
        <p className="mt-1 text-sm text-slate-600">
          M2 delivers top-down funding: project year allocations with carry-in, ijin prinsip and the
          pricing chain, contract value, remaining and unallocated balances, and the seven over-budget
          flags from ADR-0003.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">M2 Funding — issues</h2>
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
