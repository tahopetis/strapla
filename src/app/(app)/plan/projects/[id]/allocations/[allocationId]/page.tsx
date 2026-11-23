import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CommitmentsSection,
  FundingSummaryCard,
  SpendSection,
} from '@/components/execution/execution-sections';
import { PlanNav } from '@/components/plan-nav';
import { Flash, PageHeader } from '@/components/ui';
import { toDateInputValue } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import {
  getAllocationFunding,
  listSpendCategoryOptions,
} from '@/server/plan/execution-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Allocation execution' };

export default async function AllocationFundingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; allocationId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id, allocationId } = await params;
  if (!isRecordId(id) || !isRecordId(allocationId)) notFound();
  const { error, message } = await searchParams;
  const funding = await getAllocationFunding(allocationId, { withCustomFields: true });
  if (!funding || funding.project.id !== id) notFound();

  const categories = await listSpendCategoryOptions();
  const editable =
    funding.strategicPlan.status !== 'archived' &&
    funding.annualPlan.status !== 'closed' &&
    funding.project.status !== 'cancelled';
  const today = toDateInputValue(new Date());

  return (
    <div>
      <PageHeader
        title={`FY${funding.annualPlan.fiscalYear} allocation · ${funding.program.code}`}
        description={`${funding.project.code} · ${funding.project.name}`}
        actions={
          <Link href={`/plan/projects/${funding.project.id}`} className="text-sm text-slate-600 hover:text-slate-900">
            ← Project
          </Link>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <FundingSummaryCard
          title="Allocation and execution"
          description="Commitments and spend for this fiscal-year slice; remaining follows ADR-0003."
          totals={funding.totals}
          allocationCapex={funding.effectiveAllocation.capex}
          allocationOpex={funding.effectiveAllocation.opex}
          carryInCapex={funding.allocation.carryInCapex}
          carryInOpex={funding.allocation.carryInOpex}
          allowCapex
        />

        <CommitmentsSection
          parentKind="allocation"
          parentId={funding.allocation.id}
          rows={funding.commitments}
          editable={editable}
          allowCapex
          today={today}
          customFields={funding.customFields.commitmentFields}
          customValues={funding.customFields.commitmentValues}
        />

        <SpendSection
          parentKind="allocation"
          parentId={funding.allocation.id}
          rows={funding.spends}
          settlementOptions={funding.settlementOptions}
          categoryOptions={categories}
          editable={editable}
          allowCapex
          today={today}
          fiscalYear={funding.annualPlan.fiscalYear}
          customFields={funding.customFields.spendFields}
          customValues={funding.customFields.spendValues}
        />
      </div>
    </div>
  );
}
