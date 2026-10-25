import type { Metadata } from 'next';
import Link from 'next/link';
import { HiddenField, SelectField, SubmitButton, TextAreaField } from '@/components/form';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { planYears } from '@/domain/plan';
import { createAnnualPlanAction } from '@/server/plan/annual-actions';
import { listAnnualPlans } from '@/server/plan/annual-queries';
import { getCurrentStrategicPlan } from '@/server/plan/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annual plans' };

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function AnnualPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const strategicPlan = await getCurrentStrategicPlan();

  if (!strategicPlan) {
    return (
      <div>
        <PageHeader title="Annual plans" description="One annual plan per fiscal year, inside the strategic plan horizon." />
        <PlanNav />
        <EmptyState>
          No strategic plan yet. Create the strategic plan first — annual plans live inside its horizon.
        </EmptyState>
        <p className="mt-4">
          <Link href="/plan/strategic" className={linkClass}>
            Go to the strategic plan
          </Link>
        </p>
      </div>
    );
  }

  const rows = await listAnnualPlans(strategicPlan.id);
  const usedYears = new Set(rows.map((row) => row.annualPlan.fiscalYear));
  const availableYears = planYears(strategicPlan).filter((year) => !usedYears.has(year));
  const canCreate = strategicPlan.status === 'active' && availableYears.length > 0;

  return (
    <div>
      <PageHeader
        title="Annual plans"
        description={`Fiscal years ${strategicPlan.startFiscalYear}–${strategicPlan.endFiscalYear} of ${strategicPlan.name}. One annual plan per fiscal year.`}
        actions={<StatusBadge status={strategicPlan.status} />}
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {strategicPlan.status !== 'active' ? (
        <Card title="The strategic plan is not active yet">
          <p className="text-sm text-slate-700">
            Annual plans can only be created once the strategic plan is active.{' '}
            <Link href="/plan/strategic" className={linkClass}>
              Open the strategic plan
            </Link>{' '}
            to activate it.
          </p>
        </Card>
      ) : canCreate ? (
        <Card
          title="Create an annual plan"
          description="The plan starts as a draft; activate it when the fiscal year's budget is settled."
          className="mb-6"
        >
          <form action={createAnnualPlanAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="planId" value={strategicPlan.id} />
            <SelectField
              label="Fiscal year"
              name="fiscalYear"
              required
              placeholder="Select a fiscal year"
              options={availableYears.map((year) => ({ value: String(year), label: `FY${year}` }))}
            />
            <div className="sm:col-span-2">
              <TextAreaField label="Notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Create annual plan</SubmitButton>
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Every fiscal year in the horizon already has an annual plan">
          <p className="text-sm text-slate-700">
            Annual plans exist for all {availableYears.length === 0 ? 'years' : ''} in the horizon. Close a year
            through the year-close workflow (M4) or extend the plan horizon.
          </p>
        </Card>
      )}

      <Card title="Annual plans" description="Open a plan to manage its programs and recurring operations.">
        {rows.length === 0 ? (
          <EmptyState>No annual plans yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Fiscal year</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Programs</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.annualPlan.id}>
                    <td className="py-3 pr-4 font-medium">FY{row.annualPlan.fiscalYear}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={row.annualPlan.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <Badge>{row.programCount}</Badge>
                    </td>
                    <td className="py-3">
                      <Link href={`/plan/annual/${row.annualPlan.id}`} className={linkClass}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
