import type { Metadata } from 'next';
import Link from 'next/link';
import { OpeningImportWizard } from '@/components/plan/opening-import-wizard';
import { PlanNav } from '@/components/plan-nav';
import { Card, PageHeader } from '@/components/ui';
import { getOpeningLoadScene } from '@/server/plan/opening-queries';
import { getCurrentStrategicPlan, isFirstStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Opening-balance import' };

const linkClass =
  'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function OpeningImportPage() {
  const plan = await getCurrentStrategicPlan();

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Opening-balance import"
          description="Load the prior-year close figures from a CSV or XLSX file."
        />
        <PlanNav />
        <p className="text-sm text-slate-700">
          Create the strategic plan first.{' '}
          <Link href="/plan/strategic" className={linkClass}>
            Go to the strategic plan
          </Link>
          .
        </p>
      </div>
    );
  }

  // Opening balances are recorded once, for the first plan (#109, ADR-0008 §7):
  // an archived plan is read-only and a successor starts without them, so the
  // wizard is not offered for either.
  const firstPlan = await isFirstStrategicPlan(plan);
  if (plan.status === 'archived' || !firstPlan) {
    return (
      <div>
        <PageHeader
          title="Opening-balance import"
          description="Load the prior-year close figures from a CSV or XLSX file."
        />
        <PlanNav />
        <Card title="Opening balances are recorded once, for the first plan">
          <p className="text-sm text-slate-700">
            {plan.status === 'archived'
              ? 'This plan is archived and read-only, so no opening balances can be imported for it.'
              : 'This plan is a successor plan; it starts without opening balances. The first plan keeps its signed-off figures.'}{' '}
            <Link href="/plan/strategic/archived" className={linkClass}>
              Archived plans
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const scene = await getOpeningLoadScene(plan);
  const annualPlan = scene.annualPlan;

  return (
    <div>
      <PageHeader
        title="Opening-balance import"
        description={`Load the FY${plan.startFiscalYear} close figures into ${plan.name}, one data set at a time.`}
        actions={
          <Link href="/plan/opening-balances" className="text-sm text-slate-600 hover:text-slate-900">
            ← Opening balances
          </Link>
        }
      />
      <PlanNav />

      <div className="space-y-6">
        <Card
          title="Import wizard"
          description="Template, upload/validate, load. The template and parser include the active custom fields for the chosen data set; validation writes nothing and the load is one transaction."
        >
          {!annualPlan ? (
            <p className="text-sm text-slate-700">
              Create the FY{plan.startFiscalYear + 1} annual plan before importing. The wizard loads into
              the first in-app fiscal year.{' '}
              <Link href="/plan/annual" className={linkClass}>
                Go to the annual plans
              </Link>
              .
            </p>
          ) : annualPlan.status === 'closed' ? (
            <p className="text-sm text-slate-700">
              FY{annualPlan.fiscalYear} is closed and cannot receive an import.
            </p>
          ) : (
            <OpeningImportWizard closingFiscalYear={plan.startFiscalYear} />
          )}
        </Card>

        <Card title="Load order" description="Each data set depends on the one before it.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <strong>Strategic initiatives</strong> — creates the initiatives with their capex and opex
              envelopes and their prior program budget consumed (capex and opex).
            </li>
            <li>
              <strong>Annual programs</strong> — creates the programs and their carry-in; each row&apos;s SI
              code must already exist.
            </li>
            <li>
              <strong>Projects</strong> — creates the projects, their opening figures and ijin prinsip
              records; each row&apos;s originating program code must already exist.
            </li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            The import creates records; it does not update existing ones. Duplicate codes and unknown
            references fail the whole file with a line number, and a failed validation writes nothing.
          </p>
        </Card>
      </div>
    </div>
  );
}
