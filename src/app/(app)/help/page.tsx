import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/print-button';
import { Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Help & user guide' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';
const codeClass = 'rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700';

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="border-b border-slate-100 py-3 last:border-0">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">{question}</summary>
      <div className="mt-2 space-y-2 text-sm text-slate-700">{children}</div>
    </details>
  );
}

export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="Help & user guide"
        description="Quick start, concepts, workflows and troubleshooting. The full guide lives in docs/USER-GUIDE.md in the repository."
        actions={<PrintButton />}
      />

      <div className="space-y-6">
        <Card
          title="First time here?"
          description="There is no default account: the first administrator is created by first-run setup."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Open the app at <span className={codeClass}>/</span>. A fresh installation redirects to{' '}
              <span className={codeClass}>/setup</span>; create the first administrator there (name, email,
              password of at least 12 characters).
            </li>
            <li>
              After setup you are signed in. Further accounts are created in{' '}
              <Link href="/admin/members" className={linkClass}>
                Administration → Members
              </Link>
              .
            </li>
            <li>
              Work top-down: strategic plan → SIs → annual plan → programs → projects → annual allocations →
              commitments/spend. The checklist below follows that order.
            </li>
          </ol>
        </Card>

        <Card title="Setup checklist (first time)" description="Do these in order.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <Link href="/plan/strategic" className={linkClass}>
                Create and activate the strategic plan
              </Link>{' '}
              with its horizon, then add the strategic initiatives (envelope, prior consumption).
            </li>
            <li>
              <Link href="/plan/annual" className={linkClass}>
                Create the annual plan
              </Link>{' '}
              for the fiscal year and activate it; add the annual programs with capex/opex budgets (and
              continuation links where a program continues).
            </li>
            <li>
              <Link href="/plan/projects" className={linkClass}>
                Create the projects
              </Link>{' '}
              with full-life figures, then record each project&apos;s ijin prinsip on its page.
            </li>
            <li>
              On each project, add the <strong>annual allocation</strong> for the fiscal year (program of the
              same SI, capex/opex amounts and carry-in).
            </li>
            <li>
              Add the <strong>recurring operations</strong> items (opex only) on the annual plan page.
            </li>
            <li>
              Enter the <strong>opening balances</strong> (prior consumption, carry-in, project opening figures)
              and reconcile them on{' '}
              <Link href="/plan/opening-balances" className={linkClass}>
                Opening balances
              </Link>
              .
            </li>
          </ol>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="The portfolio hierarchy" description="One project, many annual slices.">
            <pre className="overflow-x-auto text-[11px] leading-5 text-slate-700">{`Strategic plan (2026–2030)
└── Strategic initiative (SI) — five-year envelope
    └── Annual plan (one per fiscal year)
        └── Annual program (one SI; capex + opex budget; carry-in)
            └── Project (created once for its whole life)
                └── Project year allocation (the slice in one year)
                    ├── Commitments (PO / contract milestones)
                    └── Spend entries (invoices; settle commitments)

Recurring operations (opex only, no SI, no project)
└── Commitments + spend entries`}</pre>
            <p className="mt-3 text-sm text-slate-700">
              A project is never duplicated per year. Each year gets an <strong>annual allocation</strong>{' '}
              instead — that is the project&apos;s budget for the year.
            </p>
          </Card>

          <Card title="Money rules to remember" description="Capex and opex are always separate.">
            <pre className="overflow-x-auto text-[11px] leading-5 text-slate-700">{`Remaining = allocation + carry-in
            − open commitments
            − current-year spend

Unallocated program budget = budget + carry-in
                            − allocations`}</pre>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Open commitments are <strong>not</strong> carry-over; they stay commitments until settled.</li>
              <li>
                A same-year settlement moves money from open commitments to spend without changing remaining (it
                was already committed).
              </li>
              <li>
                Cross-year settlements and prior-year opening payments do <strong>not</strong> reduce the current
                year&apos;s remaining.
              </li>
              <li>Current-year spend above the year&apos;s commitments is flagged (BR-11), never blocked.</li>
              <li>
                Amounts are whole Rupiah; dots are ignored when typing (<span className={codeClass}>1.234.567</span>{' '}
                = <span className={codeClass}>1234567</span>).
              </li>
            </ul>
          </Card>
        </div>

        <Card title="Daily work: commitments, spend and settlement" description="Open a project allocation and choose Open commitments & spend.">
          <div className="grid gap-4 text-sm text-slate-700 lg:grid-cols-3">
            <div>
              <p className="font-medium">Record a commitment</p>
              <p className="mt-1">
                Component, amount, date, reference (PO/milestone), description. It starts <em>open</em> and
                reduces the available budget; it is not carry-over.
              </p>
            </div>
            <div>
              <p className="font-medium">Record spend</p>
              <p className="mt-1">
                Component, amount, date, category, vendor, invoice/reference, description and classification:
                current-year spend or payment of a pre-Strapla commitment.
              </p>
            </div>
            <div>
              <p className="font-medium">Settle commitments</p>
              <p className="mt-1">
                Enter an amount next to each open commitment the payment settles. Partial settlement is
                allowed. Settling an earlier year&apos;s commitment becomes a cross-year settlement.
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Edits are audited and require a reason. Commitments cannot be voided while settled; spend cannot be
            reduced below the settled amount. Settlement links are fixed — to change them, void the spend and
            re-enter it.
          </p>
        </Card>

        <Card title="Year close and carry-over" description="Manual, audited and irreversible.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>The annual plan must be active, and the next fiscal year&apos;s plan must exist.</li>
            <li>Open the annual plan and click <strong>Close fiscal year</strong>.</li>
            <li>
              Enter the carry-over amounts per program (unallocated budget) and per project allocation
              (remaining), choose the target program, and record the approval reference.
            </li>
            <li>
              Submit: carry-in is written to the next year&apos;s programs/allocations, the year is closed and the
              snapshot is recorded. There is no reopen.
            </li>
          </ol>
          <p className="mt-3 text-sm text-slate-600">
            Open commitments are not carried. Closed years are read-only except audited administrator
            corrections; settlement lifecycle events (paying existing commitments) remain possible.
          </p>
        </Card>

        <Card title="Reports, dashboard and audit" description="Where to review and what to export.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <Link href="/dashboard" className={linkClass}>
                Dashboard
              </Link>{' '}
              — portfolio health: envelope, budget, allocated, open commitments, spend, remaining, flags, year
              status, program threads, recent activity.
            </li>
            <li>
              <Link href="/reports" className={linkClass}>
                Reports
              </Link>{' '}
              — SI five-year view, annual plan, project register, budget versus actual. Every report has CSV,
              XLSX and Print/PDF.
            </li>
            <li>
              <Link href="/admin/audit" className={linkClass}>
                Audit trail
              </Link>{' '}
              — search who changed what and why, with before/after values and CSV export (up to 5000 entries).
            </li>
            <li>
              <Link href="/admin/members" className={linkClass}>
                Members
              </Link>{' '}
              — create accounts, reset passwords, revoke sessions, deactivate/reactivate. Accounts are never
              deleted.
            </li>
          </ul>
        </Card>

        <Card title="Frequently asked questions">
          <div className="divide-y divide-slate-100">
            <FaqItem question="Is there a default username or password?">
              <p>
                No. A fresh database opens first-run setup, where you create the first administrator and choose
                the password. Every later account is created in Administration → Members. If you have lost the
                password and there is no other administrator, use the deployment&apos;s restore/recovery procedure.
              </p>
            </FaqItem>
            <FaqItem question="Why can I not edit anything in a fiscal year?">
              <p>
                The year is closed. Closed years are read-only; only audited administrator corrections are
                allowed, and settlement lifecycle events can still be recorded.
              </p>
            </FaqItem>
            <FaqItem question="Why can I not create an annual allocation?">
              <p>
                One allocation per project per fiscal year. The year must be within the project&apos;s start/end
                years and there must be an annual program for the same strategic initiative covering that year.
                If every eligible year already has an allocation, no form is shown.
              </p>
            </FaqItem>
            <FaqItem question="What is the difference between a commitment and spend?">
              <p>
                A commitment is money promised (PO/contract milestone). Spend is money actually recorded
                (invoice). Remaining = allocation + carry-in − open commitments − current-year spend.
              </p>
            </FaqItem>
            <FaqItem question="Why does the project need both full-life allocated budget and annual allocations?">
              <p>
                The full-life figure is the project&apos;s total over its whole life (used for the full-life and
                contract checks). Annual allocations divide it per fiscal year so each year can be funded,
                committed and spent against a program budget.
              </p>
            </FaqItem>
            <FaqItem question="Can I delete a record?">
              <p>
                No. Records are voided or cancelled with a reason and remain in the audit trail and reports.
                Some voided records can be restored by re-adding them (for example an allocation).
              </p>
            </FaqItem>
            <FaqItem question="How do I know which version of Strapla is running?">
              <p>
                The header shows <span className={codeClass}>v&lt;version&gt; · &lt;commit&gt;</span>. Deployment
                updates: <span className={codeClass}>docker compose pull app && docker compose up -d --force-recreate app</span>{' '}
                (see docs/operations.md).
              </p>
            </FaqItem>
            <FaqItem question="Can I import my spreadsheet, attach documents or send notifications?">
              <p>
                Not in this version. Data is entered through the forms, documents are referenced by number/link,
                and there are no email notifications. Reports export as CSV/XLSX.
              </p>
            </FaqItem>
          </div>
        </Card>

        <Card title="Where to read more" description="The full documentation lives in the repository docs folder.">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <span className={codeClass}>docs/USER-GUIDE.md</span> — the complete guide (all fields, error
              messages, annual-cycle checklist).
            </li>
            <li>
              <span className={codeClass}>docs/OPENING-BALANCE-LOAD.md</span> — the FY2026 opening-balance
              workplan.
            </li>
            <li>
              <span className={codeClass}>docs/GO-LIVE-CHECKLIST.md</span> and{' '}
              <span className={codeClass}>docs/operations.md</span> — deployment, backups and updates.
            </li>
            <li>
              <span className={codeClass}>docs/RELEASE-NOTES-2026-12.md</span> — what is in the release and known
              limitations.
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Found a problem? Report it with the page, the steps, what you expected and a screenshot so it can be
            triaged as a defect.
          </p>
        </Card>
      </div>
    </div>
  );
}
