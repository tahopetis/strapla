import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Badge, Card, Money, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  projectYearAllocations,
  strategicInitiatives,
} from '@/db/schema';
import { formatDateTime } from '@/lib/format';
import { listAnnualPlans } from '@/server/plan/annual-queries';
import { loadExecutionAggregates } from '@/server/plan/execution-aggregates';
import { listProgramThreads } from '@/server/plan/program-queries';
import { getAnnualPlanReport, getProjectRegisterReport } from '@/server/plan/report-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';
import { listAuditEntries } from '@/server/admin/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

function num(value: string | null | undefined): number {
  return Number(value ?? 0);
}

async function loadPortfolio(planId: string) {
  const db = getDb();
  const notVoidedInf = and(
    eq(strategicInitiatives.planId, planId),
    isNull(strategicInitiatives.voidedAt),
  );
  const [envelopeRow] = await db
    .select({ value: sql<string>`coalesce(sum(${strategicInitiatives.envelopeAmount}), 0)::text` })
    .from(strategicInitiatives)
    .where(notVoidedInf);
  const [programRow] = await db
    .select({
      capex: sql<string>`coalesce(sum(${annualPrograms.capexBudget}), 0)::text`,
      opex: sql<string>`coalesce(sum(${annualPrograms.opexBudget}), 0)::text`,
      carryCapex: sql<string>`coalesce(sum(${annualPrograms.carryInCapex}), 0)::text`,
      carryOpex: sql<string>`coalesce(sum(${annualPrograms.carryInOpex}), 0)::text`,
    })
    .from(annualPrograms)
    .innerJoin(annualPlans, eq(annualPrograms.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(annualPrograms.voidedAt)));
  const [allocationRow] = await db
    .select({
      capex: sql<string>`coalesce(sum(${projectYearAllocations.allocationCapex}), 0)::text`,
      opex: sql<string>`coalesce(sum(${projectYearAllocations.allocationOpex}), 0)::text`,
      carryCapex: sql<string>`coalesce(sum(${projectYearAllocations.carryInCapex}), 0)::text`,
      carryOpex: sql<string>`coalesce(sum(${projectYearAllocations.carryInOpex}), 0)::text`,
    })
    .from(projectYearAllocations)
    .innerJoin(annualPlans, eq(projectYearAllocations.annualPlanId, annualPlans.id))
    .where(and(eq(annualPlans.planId, planId), isNull(projectYearAllocations.voidedAt)));

  const [execution, plans, threads, recentAudit, annualReport, projectReport] = await Promise.all([
    loadExecutionAggregates(planId),
    listAnnualPlans(planId),
    listProgramThreads(planId),
    listAuditEntries({ limit: 5 }),
    getAnnualPlanReport(planId),
    getProjectRegisterReport(planId),
  ]);

  const envelope = num(envelopeRow?.value);
  const programCapex = num(programRow?.capex);
  const programOpex = num(programRow?.opex);
  const programCarryCapex = num(programRow?.carryCapex);
  const programCarryOpex = num(programRow?.carryOpex);
  const allocationCapex = num(allocationRow?.capex);
  const allocationOpex = num(allocationRow?.opex);
  const allocationCarryCapex = num(allocationRow?.carryCapex);
  const allocationCarryOpex = num(allocationRow?.carryOpex);

  const availableCapex = programCapex + programCarryCapex;
  const availableOpex = programOpex + programCarryOpex;
  const allocatedCapex = allocationCapex + allocationCarryCapex;
  const allocatedOpex = allocationOpex + allocationCarryOpex;

  const executionTotal = execution.total;
  const remainingCapex =
    allocatedCapex - executionTotal.openCommitmentCapex - executionTotal.currentSpendCapex;
  const remainingOpex =
    allocatedOpex - executionTotal.openCommitmentOpex - executionTotal.currentSpendOpex;

  const overAllocatedPrograms = annualReport.programs.filter(
    (row) => row.overCapex || row.overOpex,
  ).length;
  const projectsWithFlags = projectReport.rows.filter((row) => row.flags.length > 0).length;
  const openCommitmentTotal =
    executionTotal.openCommitmentCapex + executionTotal.openCommitmentOpex;
  const spendTotal = executionTotal.spendCapex + executionTotal.spendOpex;
  const remainingTotal = remainingCapex + remainingOpex;

  return {
    envelope,
    programBudget: availableCapex + availableOpex,
    allocated: allocatedCapex + allocatedOpex,
    openCommitments: openCommitmentTotal,
    spend: spendTotal,
    remaining: remainingTotal,
    commitments: executionTotal.commitmentCapex + executionTotal.commitmentOpex,
    priorOpening: executionTotal.priorOpeningCapex + executionTotal.priorOpeningOpex,
    crossYear: executionTotal.crossYearCapex + executionTotal.crossYearOpex,
    rows: [
      {
        label: 'Capex',
        available: availableCapex,
        allocated: allocatedCapex,
        openCommitments: executionTotal.openCommitmentCapex,
        currentSpend: executionTotal.currentSpendCapex,
        remaining: remainingCapex,
      },
      {
        label: 'Opex',
        available: availableOpex,
        allocated: allocatedOpex,
        openCommitments: executionTotal.openCommitmentOpex,
        currentSpend: executionTotal.currentSpendOpex,
        remaining: remainingOpex,
      },
      {
        label: 'Total',
        available: availableCapex + availableOpex,
        allocated: allocatedCapex + allocatedOpex,
        openCommitments: openCommitmentTotal,
        currentSpend: executionTotal.currentSpendCapex + executionTotal.currentSpendOpex,
        remaining: remainingTotal,
      },
    ],
    plans,
    threads,
    recentAudit,
    overAllocatedPrograms,
    projectsWithFlags,
  };
}

export default async function DashboardPage() {
  const plan = await getCurrentStrategicPlan();

  if (!plan) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Portfolio health for the active planning cycle." />
        <Card title="No strategic plan yet">
          <p className="text-sm text-slate-700">
            Create the strategic plan to see portfolio health.{' '}
            <Link href="/plan/strategic" className={linkClass}>
              Open the strategic plan
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  const portfolio = await loadPortfolio(plan.id);
  const currentYear = portfolio.plans.find((row) => row.annualPlan.status === 'active');
  const closedYear = portfolio.plans.find((row) => row.annualPlan.status === 'closed');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Portfolio health for ${plan.name} · fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {currentYear ? (
              <Badge tone="success">FY{currentYear.annualPlan.fiscalYear} active</Badge>
            ) : (
              <Badge tone="warning">no active fiscal year</Badge>
            )}
            {closedYear ? <Badge tone="info">FY{closedYear.annualPlan.fiscalYear} closed</Badge> : null}
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Envelope" value={<Money value={portfolio.envelope} />} />
        <Stat label="Program budget + carry-in" value={<Money value={portfolio.programBudget} />} />
        <Stat label="Allocated + carry-in" value={<Money value={portfolio.allocated} />} />
        <Stat
          label="Open commitments"
          value={<Money value={portfolio.openCommitments} />}
          hint="Committed but not yet settled; not carry-over"
        />
        <Stat label="In-app spend" value={<Money value={portfolio.spend} />} />
        <Stat
          label="Remaining"
          value={<Money value={portfolio.remaining} />}
          hint="Allocated − open commitments − current-year spend"
        />
        <Stat label="Fiscal-year commitments" value={<Money value={portfolio.commitments} />} />
        <Stat
          label="Flags"
          value={`${portfolio.overAllocatedPrograms + portfolio.projectsWithFlags}`}
          hint={`${portfolio.overAllocatedPrograms} over-allocated program(s), ${portfolio.projectsWithFlags} project(s) flagged`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Plan versus execution"
          description="Capex and opex across the plan; remaining follows ADR-0003 (open commitments are not carry-over)."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Component</th>
                  <th className="py-2 pr-3">Available</th>
                  <th className="py-2 pr-3">Allocated</th>
                  <th className="py-2 pr-3">Open commitments</th>
                  <th className="py-2 pr-3">Current-year spend</th>
                  <th className="py-2">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {portfolio.rows.map((row) => (
                  <tr key={row.label} className={row.label === 'Total' ? 'font-medium' : undefined}>
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Money value={row.available} />
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Money value={row.allocated} />
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Money value={row.openCommitments} />
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Money value={row.currentSpend} />
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <Money value={row.remaining} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Cross-year settlement portions <Money value={portfolio.crossYear} /> and prior-year opening payments{' '}
            <Money value={portfolio.priorOpening} /> are excluded from the current-year remaining.
          </p>
        </Card>

        <Card title="Fiscal years" description="Planning cycle status; closed years are read-only.">
          {portfolio.plans.length === 0 ? (
            <p className="text-sm text-slate-600">
              No annual plans yet.{' '}
              <Link href="/plan/annual" className={linkClass}>
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {portfolio.plans.map((row) => (
                <li key={row.annualPlan.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      <Link href={`/plan/annual/${row.annualPlan.id}`} className={linkClass}>
                        FY{row.annualPlan.fiscalYear} annual plan
                      </Link>
                    </p>
                    <p className="text-slate-600">
                      {row.programCount} program{row.programCount === 1 ? '' : 's'} ·{' '}
                      {row.recurringOpsCount} recurring ops item{row.recurringOpsCount === 1 ? '' : 's'}
                    </p>
                    {row.annualPlan.status === 'closed' && row.annualPlan.closeReference ? (
                      <p className="text-xs text-slate-500">
                        Closed with reference {row.annualPlan.closeReference}
                        {row.annualPlan.closedAt
                          ? ` on ${row.annualPlan.closedAt.toISOString().slice(0, 10)}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={row.annualPlan.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Program threads" description="Programs continuing across fiscal years.">
          {portfolio.threads.length === 0 ? (
            <p className="text-sm text-slate-600">No programs yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {portfolio.threads.map((thread) => (
                <li key={thread.rootId} className="flex flex-wrap items-center gap-2">
                  {thread.entries.map((entry, index) => (
                    <span key={entry.programId} className="flex items-center gap-2">
                      {index > 0 ? <span className="text-slate-400">→</span> : null}
                      <Link href={`/plan/programs/${entry.programId}`} className={linkClass}>
                        FY{entry.fiscalYear} {entry.code}
                      </Link>
                    </span>
                  ))}
                  {thread.entries.length === 1 ? (
                    <span className="text-xs text-slate-500">(no continuation yet)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" description="Latest audited changes across the portfolio.">
          {portfolio.recentAudit.length === 0 ? (
            <p className="text-sm text-slate-600">No changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {portfolio.recentAudit.map((row) => (
                <li key={row.entry.id} className="py-2">
                  <p>
                    <span className="font-medium">{row.entry.action}</span>{' '}
                    <span className="text-slate-600">{row.entry.entityType}</span>{' '}
                    <span className="text-slate-500">by {row.actorName ?? 'system'}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(row.entry.createdAt)}
                    {row.entry.reason ? ` · ${row.entry.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href="/admin/audit" className={linkClass}>
              Search the audit trail
            </Link>
          </p>
        </Card>
      </section>

      <Card title="Quick links" description="The portfolio workflows.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <Link href="/plan" className={linkClass}>
              Plan overview
            </Link>
          </li>
          <li>
            <Link href="/plan/projects" className={linkClass}>
              Projects & allocations
            </Link>
          </li>
          <li>
            <Link href="/plan/opening-balances" className={linkClass}>
              Opening balances
            </Link>
          </li>
          <li>
            <Link href="/funding" className={linkClass}>
              Funding & flags
            </Link>
          </li>
          <li>
            <Link href="/reports" className={linkClass}>
              Reports & exports
            </Link>
          </li>
          <li>
            <Link href="/admin/members" className={linkClass}>
              Members
            </Link>
          </li>
          <li>
            <Link href="/admin/audit" className={linkClass}>
              Audit trail
            </Link>
          </li>
          <li>
            <Link href="/plan/annual" className={linkClass}>
              Annual plans & close
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
