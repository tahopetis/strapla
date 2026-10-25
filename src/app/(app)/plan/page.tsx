import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Money, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { getCurrentStrategicPlan, getPlanOverview } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plan' };

const secondaryLink =
  'inline-flex items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

export default async function PlanOverviewPage() {
  const plan = await getCurrentStrategicPlan();

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Plan"
          description="The five-year strategic plan, its initiatives and the annual plans that fund the portfolio."
        />
        <PlanNav />
        <EmptyState>
          No strategic plan yet. Start with the five-year horizon, then add strategic initiatives and their
          envelopes.
        </EmptyState>
        <div className="mt-4">
          <Link href="/plan/strategic" className={secondaryLink}>
            Create the strategic plan
          </Link>
        </div>
      </div>
    );
  }

  const overview = await getPlanOverview(plan);
  const envelope = overview.envelopeTotals;

  return (
    <div>
      <PageHeader
        title="Plan"
        description="One source of truth for the five-year plan and its annual delivery."
        actions={
          <Link href="/plan/strategic" className={secondaryLink}>
            Manage strategic plan
          </Link>
        }
      />
      <PlanNav />

      <div className="space-y-6">
        <Card
          title={plan.name}
          description={`Fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
          actions={<StatusBadge status={plan.status} />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Strategic initiatives" value={overview.initiativeCount} />
            <Stat label="Annual plans" value={overview.annualPlanCount} />
            <Stat label="Annual programs" value={overview.programCount} />
            <Stat label="Projects" value={overview.projectCount} />
          </div>
        </Card>

        <Card
          title="Five-year envelope"
          description="Envelope versus prior program budget consumed plus in-app program budgets (BR-2). Flags never block entry."
          actions={
            envelope.over ? (
              <Badge tone="danger">Over envelope</Badge>
            ) : (
              <Badge tone="success">Within envelope</Badge>
            )
          }
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Total envelope</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={overview.envelopeTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Consumed (prior + programs)</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={envelope.consumed} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Remaining</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money value={envelope.remaining} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Prior consumed comes from the opening balances. In-app program budgets appear as annual plans are
            built.
          </p>
        </Card>

        <Card title="Remaining M1 work" description="The plan module is almost complete.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Opening balances entry and reconciliation before the FY2027 plan goes live</li>
            <li>The end-to-end plan pass (E2E) and navigation polish</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
