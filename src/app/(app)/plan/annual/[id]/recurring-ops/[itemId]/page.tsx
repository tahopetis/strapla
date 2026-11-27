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
  getRecurringOpsFunding,
  listSpendCategoryOptions,
} from '@/server/plan/execution-queries';
import { loadCorrectionMarkers } from '@/server/plan/correction-queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring ops execution' };

export default async function RecurringOpsFundingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id, itemId } = await params;
  if (!isRecordId(id) || !isRecordId(itemId)) notFound();
  const { error, message } = await searchParams;
  const funding = await getRecurringOpsFunding(itemId, { withCustomFields: true });
  if (!funding || funding.annualPlan.id !== id) notFound();

  const categories = await listSpendCategoryOptions();
  const editable =
    funding.strategicPlan.status !== 'archived' && funding.annualPlan.status !== 'closed';
  // A closed year corrects an existing commitment in place; creates, voids and
  // spend entry forms stay closed (ADR-0007 §1, §7). A voided item offers nothing.
  const correctable =
    funding.strategicPlan.status !== 'archived' &&
    funding.annualPlan.status === 'closed' &&
    funding.item.voidedAt === null;
  const correctionMarkers =
    funding.annualPlan.status === 'closed'
      ? await loadCorrectionMarkers(funding.strategicPlan.id)
      : null;
  const correctedRecords = correctionMarkers?.corrected ?? new Set<string>();
  const today = toDateInputValue(new Date());

  return (
    <div>
      <PageHeader
        title={`FY${funding.annualPlan.fiscalYear} · ${funding.item.name}`}
        description="Recurring operations: opex-only budget, commitments and spend."
        actions={
          <Link href={`/plan/annual/${funding.annualPlan.id}`} className="text-sm text-slate-600 hover:text-slate-900">
            ← Annual plan
          </Link>
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
          title="Budget and execution"
          description="Opex budget + carry-in, commitments and spend for this recurring ops item."
          totals={funding.totals}
          allocationCapex={0}
          allocationOpex={funding.item.opexBudget}
          carryInCapex={0}
          carryInOpex={funding.item.carryInOpex}
          allowCapex={false}
        />

        <CommitmentsSection
          parentKind="recurring"
          parentId={funding.item.id}
          rows={funding.commitments}
          editable={editable}
          correctable={correctable}
          correctedRecords={correctedRecords}
          allowCapex={false}
          today={today}
          customFields={funding.customFields.commitmentFields}
          customValues={funding.customFields.commitmentValues}
        />

        <SpendSection
          parentKind="recurring"
          parentId={funding.item.id}
          rows={funding.spends}
          settlementOptions={funding.settlementOptions}
          categoryOptions={categories}
          editable={editable}
          allowCapex={false}
          today={today}
          fiscalYear={funding.annualPlan.fiscalYear}
          customFields={funding.customFields.spendFields}
          customValues={funding.customFields.spendValues}
        />
      </div>
    </div>
  );
}
