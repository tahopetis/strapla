import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Funding' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default function FundingPage() {
  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Funding"
          description="Top-down funding: program budgets become project year allocations; every figure is audited and flagged, never blocked."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Project year allocations"
          description="The annual slice of each multi-year project."
          actions={<Badge tone="success">live</Badge>}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>One allocation per project per active fiscal year, attached to that year&apos;s program for the same SI (BR-6)</li>
            <li>Allocation and carry-in per component, with remaining computed as allocation + carry-in − open commitments − spend (ADR-0003)</li>
            <li>Program cards show available, allocated and unallocated budget per component</li>
          </ul>
          <p className="mt-4 text-sm">
            <Link href="/plan/projects" className={linkClass}>
              Open the project register to manage allocations
            </Link>
          </p>
        </Card>

        <Card
          title="Balances and flags"
          description="The guardrails from ADR-0003 §6, implemented once in the pure domain layer."
          actions={<Badge tone="success">live</Badge>}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Allocation above the program budget (BR-7)</li>
            <li>SI envelope overrun: prior consumed + program budgets vs envelope (BR-2)</li>
            <li>Final deal price above the ijin prinsip approved budget (BR-9)</li>
            <li>Final deal price above the highest submitted price (BR-18)</li>
            <li>Lifetime commitments above the contract value (BR-8)</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">Flags are visible in-place; they never block data entry (BR-17).</p>
        </Card>

        <Card
          title="Reports and exports"
          description="SI five-year view, annual plan view, project register, budget versus actual — CSV/XLSX exports and print views."
          actions={<Badge tone="success">live</Badge>}
        >
          <p className="text-sm text-slate-700">
            Every report downloads as CSV or XLSX and prints through the browser for director and finance
            packs.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/reports" className={linkClass}>
              Open the reports
            </Link>
          </p>
        </Card>

        <Card
          title="Commitments, spend and settlement"
          description="The execution half of the funding model."
          actions={<Badge>M3</Badge>}
        >
          <p className="text-sm text-slate-700">
            Commitment entries with the open → settled lifecycle, spend entries and cross-year settlement
            (ADR-0003) arrive with the execution milestone in January.
          </p>
        </Card>
      </div>
    </div>
  );
}
