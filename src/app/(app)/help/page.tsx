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
        description="Quick start, concepts, workflows and troubleshooting for v0.5.0 (beta). The full guide lives in docs/USER-GUIDE.md in the repository."
        actions={<PrintButton />}
      />

      <div className="space-y-6">
        <Card
          title="First time here?"
          description="There is no default account: the first administrator is created by first-run setup."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Open <span className={codeClass}>/setup</span> directly on a fresh installation (the home
              page sends you to <span className={codeClass}>/login</span> until an account exists);
              create the first administrator there (name, email, password of at least 12 characters).
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
              continuation links where a program continues). Activation freezes the program budgets:
              from then on a budget change is a numbered budget revision.
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
            <pre className="overflow-x-auto text-[11px] leading-5 text-slate-700">{`Strategic plan (five-year horizon)
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
            <pre className="overflow-x-auto text-[11px] leading-5 text-slate-700">{`Effective program budget = initial budget + posted revisions
Available program money  = effective budget + carry-in

Remaining = allocation + carry-in
            − open commitments
            − current-year spend

Program money remaining = effective budget + carry-in
                          − open commitments − current-year spend

Unallocated program budget = effective budget + carry-in
                             − allocations`}</pre>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Carry-in is received through the append-only carry-over <strong>ledger</strong> (a year close, the opening balance, or a reasoned manual grant) — it is never typed on a program or allocation. The program page lists the receipts behind each amount.</li>
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
                A payment recorded after a year closes can settle that year&apos;s commitment; the
                treatment you choose decides whether the closed-year portion reduces the current
                year&apos;s remaining.
              </li>
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
            <strong>Post-close settlement.</strong> If the payment settles a commitment whose fiscal
            year is closed, the picker marks it <em>CLOSED YEAR</em> and a treatment control appears:
            charge the closed-year portion to the current year (it counts in current-year spend and
            remaining), or reserve it in the closed year (excluded from current-year remaining,
            reported as a prior-year settlement and as a post-close adjustment on the closed year).
            The choice defaults to charging the current year and is frozen once the spend has
            settlements.
          </p>
          <p className="mt-2 text-sm text-slate-600">
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
              (remaining), choose the target program (the continuation program when there is one, otherwise
              an explicit same-SI choice), and record the approval reference. Every partial carry — including
              0 — needs a <strong>not-carried reason</strong>.
            </li>
            <li>
              Submit: the close writes one ledger receipt per carried amount, the receiving programs and
              allocations show the carry-in, and the year closes with a permanent close snapshot. There is
              no reopen, but a wrong figure can still be corrected afterwards with a reason.
            </li>
          </ol>
          <p className="mt-3 text-sm text-slate-600">
            <strong>Close receipt.</strong> After a close, open the closed annual plan and click
            <strong> Close receipt</strong>: it shows the per-entity snapshot (available, carried, not carried
            and the reason) with a link from each carried amount to its target, and the ledger receipts
            (source, target, origin, reason). The approval reference on the page jumps to the receipts.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Open commitments are not carried. A closed year refuses new records, voids and status changes,
            while settlement lifecycle events (paying existing commitments) remain possible, and a payment
            recorded in the open year can settle a closed-year commitment. A wrong figure in the closed year
            is corrected in place with a reason and audited as a correction after close. A post-close payment&apos;s treatment decides whether its
            closed-year portion counts in the current year or is reserved in the closed year; the close
            snapshot and carry-over never change.
          </p>
        </Card>

        <Card
          title="Budget revisions (active years)"
          description="Once the annual plan is active, the program budgets are frozen."
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Open <strong>Annual plan → Budget revisions</strong>. A revision is numbered, immutable and
              applied atomically; every line names one component, and capex and opex never shift into each
              other. A switch is a balanced pair in the same component; a de-allocation line lowers a project
              year allocation and cannot go below its open commitments plus current-year spend.
            </li>
            <li>
              The decision reference is optional: post the revision now and record the committee reference
              later. The register shows <strong>awaiting decision reference</strong> until then; recording it
              only adds metadata and never changes the amounts.
            </li>
            <li>
              The register lists each document with its date, reference or awaiting badge, reason and total
              delta; every program line links to that program. The annual plan header shows the revision count
              and how many await a decision.
            </li>
            <li>
              A cut that leaves a program over-allocated or unfunded is a flag, never a block. Every screen
              and report uses the <strong>effective budget</strong> — the initial budget plus the posted
              revisions.
            </li>
          </ul>
        </Card>

        <Card title="Reports, dashboard and audit" description="Where to review and what to export.">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <Link href="/dashboard" className={linkClass}>
                Dashboard
              </Link>{' '}
              — portfolio health: capex and opex envelopes with their consumed and remaining amounts,
              effective budget, carry-in received (shown separately), allocated, open commitments, spend,
              remaining, flags, year status, program threads and recent activity.
            </li>
            <li>
              <Link href="/reports" className={linkClass}>
                Reports
              </Link>{' '}
              — SI five-year view, annual plan, project register, budget versus actual. All four use the
              effective program budget and the effective allocation; carry-in is its own column wherever it
              changes available money, and the SI envelope is per component. Every report has CSV, XLSX and
              Print/PDF.
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
            <li>
              <Link href="/admin/custom-fields" className={linkClass}>
                Custom fields
              </Link>{' '}
              — add text, number or date fields to eight record types; they appear on forms, record pages,
              reports and exports, with per-report filters and remembered columns. Removing a field archives
              it (values are kept, hidden) and it can be restored.
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
            <FaqItem question="Why can I not add or void a record in a fiscal year?">
              <p>
                The year is closed, so creates, voids and status changes are refused. An existing plan record
                can still be corrected with a reason — audited as a correction after close — and settlement
                lifecycle events can still be recorded (editing or voiding an existing spend, and paying a
                closed-year commitment from an open year).
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
            <FaqItem question="Why can I still settle a closed-year commitment?">
              <p>
                Closing stops new plan records, not the settlement lifecycle. A spend recorded in an open
                year may settle a commitment from a closed year; choose whether the closed-year portion is
                charged to the current year or reserved in the closed year. The close snapshot and the
                carry-over figures never change.
              </p>
            </FaqItem>
            <FaqItem question="Why is the program budget not editable any more?">
              <p>
                The annual plan is active, so its program budgets are frozen. Post a <strong>budget
                revision</strong> instead: it is numbered, immutable and audited, and its deltas build the
                effective budget used by every screen and report. A draft year is still edited in place; a
                closed year accepts in-place corrections only, never a revision.
              </p>
            </FaqItem>
            <FaqItem question="Where does carry-in come from, and why can I not type it?">
              <p>
                Carry-in is a receipt in the append-only carry-over ledger — written by a year close, the
                opening balance load, or a reasoned manual grant on the annual plan page. The carry-in fields
                on programs and allocations are only a cache that the ledger service keeps equal to the
                receipts. The program page lists each receipt with its origin, approval reference and source.
              </p>
            </FaqItem>
            <FaqItem question="What does “awaiting decision reference” mean?">
              <p>
                The revision was posted before its formal budget decision existed. The lines and totals are
                already frozen; <strong>Record the decision reference</strong> on the register attaches the
                reference later as audited metadata. It is not an approval step and cannot change the amounts.
              </p>
            </FaqItem>
            <FaqItem question="Can I import my spreadsheet, attach documents or send notifications?">
              <p>
                Opening balances can be imported as CSV or XLSX in Plan → Opening balances → Opening
                import (validate first, then load; nothing is written on a bad file). All other plan data
                is entered through the forms. Documents are referenced by number and link — there are no
                file uploads — and there are no email notifications. Reports export as CSV/XLSX.
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
              <span className={codeClass}>docs/OPENING-BALANCE-LOAD.md</span> — the opening-balance
              workplan.
            </li>
            <li>
              <span className={codeClass}>docs/GO-LIVE-CHECKLIST.md</span> and{' '}
              <span className={codeClass}>docs/operations.md</span> — deployment, backups and updates.
            </li>
            <li>
              <span className={codeClass}>docs/RELEASE-NOTES-0.5.0.md</span> and{' '}
              <span className={codeClass}>CHANGELOG.md</span> — what is in this release and the full
              history.
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
