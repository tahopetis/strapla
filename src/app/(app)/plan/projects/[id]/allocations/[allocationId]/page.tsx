import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CommitmentsSection,
  FundingSummaryCard,
  SpendSection,
} from '@/components/execution/execution-sections';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Flash, PageHeader } from '@/components/ui';
import { toDateInputValue } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import {
  getAllocationFunding,
  listSpendCategoryOptions,
} from '@/server/plan/execution-queries';
import { loadCorrectionMarkers } from '@/server/plan/correction-queries';
import { CORRECTED_AFTER_CLOSE_LABEL } from '@/domain/corrections';

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
  // A closed year accepts in-place corrections of existing records only: the
  // commitment update is the single correctable entry form on this page, while
  // creates, voids, spend edits and settlement-link changes stay closed
  // (ADR-0007 §1, §7). A voided allocation or a cancelled project offers nothing.
  const correctable =
    funding.strategicPlan.status !== 'archived' &&
    funding.annualPlan.status === 'closed' &&
    funding.project.status !== 'cancelled' &&
    funding.allocation.voidedAt === null;
  const correctionMarkers =
    funding.annualPlan.status === 'closed'
      ? await loadCorrectionMarkers(funding.strategicPlan.id)
      : null;
  const correctedRecords = correctionMarkers?.corrected ?? new Set<string>();
  const today = toDateInputValue(new Date());

  return (
    <div>
      <PageHeader
        title={`FY${funding.annualPlan.fiscalYear} allocation · ${funding.program.code}`}
        description={`${funding.project.code} · ${funding.project.name}`}
        actions={
          <div className="flex items-center gap-3">
            {correctedRecords.has(funding.allocation.id) ? (
              <Badge tone="warning">{CORRECTED_AFTER_CLOSE_LABEL}</Badge>
            ) : null}
            <Link
              href={`/plan/projects/${funding.project.id}`}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Project
            </Link>
          </div>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      {funding.annualPlan.status === 'closed' ? (
        <p className="mb-5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {correctable
            ? 'This fiscal year is closed. New commitments and spend entries cannot be added; an existing commitment can still be corrected with a reason.'
            : 'This fiscal year is closed. New commitments and spend entries cannot be added.'}
        </p>
      ) : null}

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
          correctable={correctable}
          correctedRecords={correctedRecords}
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
