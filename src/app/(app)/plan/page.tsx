import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Money, PageHeader, Stat, StatusBadge } from '@/components/ui';
import type { EnvelopeComponentCheck } from '@/domain/plan';
import { getCurrentStrategicPlan, getPlanOverview } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plan' };

const secondaryLink =
  'inline-flex items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';
const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

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
          <>
            <Link href="/plan/strategic" className={secondaryLink}>
              Manage strategic plan
            </Link>
            <Link href="/plan/opening-balances" className={secondaryLink}>
              Opening balances
            </Link>
          </>
        }
      />
      <PlanNav />

      {plan.status === 'archived' ? (
        <p className="mb-6 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This plan is archived and read-only. Create a successor plan to continue the portfolio.{' '}
          <Link href="/plan/strategic" className={linkClass}>
            Create the successor plan
          </Link>
        </p>
      ) : null}

      <div className="space-y-6">
        <Card
          title={plan.name}
          description={`Fiscal years ${plan.startFiscalYear}–${plan.endFiscalYear}`}
          actions={<StatusBadge status={plan.status} />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Strategic initiatives" value={overview.initiativeCount} />
            <Stat label="Annual plans" value={overview.annualPlanCount} />
            <Stat label="Annual programs" value={overview.programCount} />
            <Stat label="Projects" value={overview.projectCount} />
            <Stat label="Capex envelope" value={<Money value={overview.envelopeCapexTotal} />} />
            <Stat label="Opex envelope" value={<Money value={overview.envelopeOpexTotal} />} />
          </div>
        </Card>

        <Card
          title="Five-year envelope"
          description="Envelope versus prior program budget consumed plus in-app program budgets, per component (BR-2). Capex and opex never share headroom, and a flag never blocks entry."
          actions={
            envelope.over ? (
              <Badge tone="danger">Over an envelope</Badge>
            ) : (
              <Badge tone="success">Within both envelopes</Badge>
            )
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <EnvelopeComponentBlock title="Capex" check={envelope.capex} />
            <EnvelopeComponentBlock title="Opex" check={envelope.opex} />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Prior consumed comes from the opening balances. In-app program budgets appear as annual plans are
            built. Carry-in is excluded from the check: it was already counted in the source year.
          </p>
        </Card>

      </div>
    </div>
  );
}

function EnvelopeComponentBlock({ title, check }: { title: string; check: EnvelopeComponentCheck }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <Badge tone={check.over ? 'danger' : 'success'}>
          {check.over ? `over ${title.toLowerCase()}` : `within ${title.toLowerCase()}`}
        </Badge>
      </div>
      <dl className="mt-2 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Envelope</dt>
          <dd className="mt-1 text-lg font-semibold">
            <Money value={check.envelope} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Consumed (prior + programs)</dt>
          <dd className="mt-1 text-lg font-semibold">
            <Money value={check.consumed} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Remaining</dt>
          <dd className={`mt-1 text-lg font-semibold ${check.over ? 'text-red-700' : ''}`}>
            <Money value={check.remaining} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
