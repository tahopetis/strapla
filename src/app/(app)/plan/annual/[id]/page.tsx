import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomFieldInputs, CustomFieldsPanel } from '@/components/custom-fields';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PlanHeaderActions } from '@/components/plan/plan-header-actions';
import {
  Form,
  HiddenField,
  MoneyField,
  ReasonField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { CarryReceiptForm } from '@/components/plan/carry-receipt-form';
import { CorrectionDisclosure } from '@/components/plan/correction-disclosure';
import { RecurringOpsSection } from '@/components/plan/recurring-ops-section';
import { PlanNav } from '@/components/plan-nav';
import { Badge, Card, EmptyState, Flash, Money, PageHeader } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldValues } from '@/domain/custom-fields';
import { CORRECTED_AFTER_CLOSE_LABEL } from '@/domain/corrections';
import { formatDate } from '@/lib/format';
import { isRecordId } from '@/lib/record-id';
import type { AnnualPlanDetail, ProgramRow } from '@/server/plan/annual-queries';
import { getAnnualPlanDetail } from '@/server/plan/annual-queries';
import { listCarryTargetOptions } from '@/server/plan/carry-queries';
import { listPlanCorrections, type PlanCorrection } from '@/server/plan/correction-queries';
import { listCustomFieldDefinitions, readCustomFieldValuesMap } from '@/server/custom-fields/data';
import {
  activateAnnualPlanAction,
  createProgramAction,
  updateProgramAction,
  voidProgramAction,
} from '@/server/plan/annual-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Annual plan' };

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';
const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

export default async function AnnualPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  if (!isRecordId(id)) notFound();
  const { error, message } = await searchParams;
  const detail = await getAnnualPlanDetail(id);
  if (!detail) notFound();

  const editable = detail.annualPlan.status !== 'closed' && detail.strategicPlan.status !== 'archived';
  // Correction mode (ADR-0007 §7): a closed year still accepts in-place updates
  // of its programs and recurring ops items, revealed behind an explicit
  // affordance. An archived strategic plan is fully read-only, so it allows none.
  const correctable =
    detail.annualPlan.status === 'closed' && detail.strategicPlan.status !== 'archived';
  // Once the plan is active the program budgets are frozen (#112, ADR-0006 §4):
  // the form keeps the non-amount fields and points at the revision register. A
  // closed year is the exception — a correction changes the budget in place and
  // posts no revision (ADR-0007 §3).
  const budgetEditable =
    detail.annualPlan.status !== 'active' && (editable || correctable);
  const canActivate =
    editable && detail.annualPlan.status === 'draft' && detail.strategicPlan.status === 'active';

  const [programFields, programValues, recurringFields, recurringValues, carryTargets] =
    await Promise.all([
    listCustomFieldDefinitions('annual_program'),
    readCustomFieldValuesMap(
      'annual_program',
      detail.programs.map((row) => row.program.id),
    ),
    listCustomFieldDefinitions('recurring_ops_item'),
    readCustomFieldValuesMap(
      'recurring_ops_item',
      detail.recurringOps.map((row) => row.item.id),
    ),
    listCarryTargetOptions(detail.annualPlan.id),
  ]);

  // The corrections recorded against this fiscal year (ADR-0007 §6, §8). Only a
  // closed year has any; the card is rendered only when the count is above zero.
  const corrections: PlanCorrection[] =
    detail.annualPlan.status === 'closed'
      ? await listPlanCorrections(detail.annualPlan.id)
      : [];
  const correctedRecords = new Set(corrections.map((correction) => correction.entityId));

  return (
    <div>
      <PageHeader
        title={`FY${detail.annualPlan.fiscalYear} annual plan`}
        description={detail.strategicPlan.name}
        actions={
          <PlanHeaderActions
            status={detail.annualPlan.status}
            activation={
              canActivate
                ? {
                    action: activateAnnualPlanAction,
                    id: detail.annualPlan.id,
                    label: 'Activate annual plan',
                    hint: 'Activation is audited and freezes the program budgets; later budget changes are revisions.',
                  }
                : undefined
            }
          >
            <Badge>
              {detail.revisions.count} revision{detail.revisions.count === 1 ? '' : 's'}
            </Badge>
            {detail.revisions.awaitingDecision > 0 ? (
              <Badge tone="warning">
                {detail.revisions.awaitingDecision} awaiting decision
              </Badge>
            ) : null}
            {detail.annualPlan.status === 'active' ? (
              <Link
                href={`/plan/annual/${detail.annualPlan.id}/close`}
                className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                Close fiscal year
              </Link>
            ) : detail.annualPlan.status === 'closed' ? (
              <Link
                href={`/plan/annual/${detail.annualPlan.id}/close`}
                className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                Close receipt
              </Link>
            ) : null}
            <Link href="/plan/annual" className="text-sm text-slate-600 hover:text-slate-900">
              ← All annual plans
            </Link>
          </PlanHeaderActions>
        }
      />
      <PlanNav />
      <Flash error={error} message={message} />

      <div className="space-y-6">
        <Card title="Annual plan">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Fiscal year</dt>
              <dd className="mt-1 font-medium">FY{detail.annualPlan.fiscalYear}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Strategic plan</dt>
              <dd className="mt-1 font-medium">{detail.strategicPlan.name}</dd>
            </div>
          </dl>

          {detail.annualPlan.status === 'closed' ? (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {correctable
                ? 'This fiscal year is closed. Figures can still be corrected with a reason; every correction is audited and the close snapshot stays frozen.'
                : 'This fiscal year is closed and the strategic plan is archived; the page is read-only.'}
            </p>
          ) : null}
        </Card>

        {corrections.length > 0 ? (
          <Card
            title="Corrections after close"
            description="Each correction is audited; the close snapshot stays the historical record while the figures below show the corrected values."
            actions={<Badge tone="warning">{corrections.length}</Badge>}
          >
            <p className="text-sm text-slate-600">
              <span className="font-medium">
                {corrections.length} correction{corrections.length === 1 ? '' : 's'}
              </span>{' '}
              after close.
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {corrections.map((correction) => (
                <li key={`${correction.entityType}:${correction.entityId}`} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={correction.href} className={linkClass}>
                      {correction.label}
                    </Link>
                    <span className="text-xs text-slate-500">{correction.entityTypeLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {correction.reason ?? 'No reason recorded'} ·{' '}
                    {correction.actorName ?? correction.actorEmail ?? 'system'} ·{' '}
                    {formatDate(correction.correctedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card
          title="Budget revisions"
          description="Once the plan is active its program budgets change only through numbered, immutable revisions."
          actions={
            <div className="flex flex-wrap gap-2">
              <Badge>{detail.revisions.count}</Badge>
              {detail.revisions.awaitingDecision > 0 ? (
                <Badge tone="warning">{detail.revisions.awaitingDecision} awaiting decision</Badge>
              ) : null}
            </div>
          }
        >
          <p className="text-sm text-slate-600">
            {detail.annualPlan.status === 'active'
              ? `${detail.revisions.count} revision${detail.revisions.count === 1 ? '' : 's'} posted for FY${detail.annualPlan.fiscalYear}. Program budgets below show the effective budget — the initial budget plus every posted delta.`
              : 'Revisions begin when the plan is activated. While it is a draft the program budgets are edited in place.'}
          </p>
          <p className="mt-3 text-sm">
            <Link href={`/plan/annual/${detail.annualPlan.id}/revisions`} className={linkClass}>
              Open the revision register
            </Link>
          </p>
        </Card>

        <div id="carry-in-receipts" className="scroll-mt-24">
          <Card
            title="Carry-in receipts"
            description="Carry-in enters through the ledger: a year close, the opening balances, or a reasoned manual grant. It is not typed on a program or allocation."
            actions={<Badge>ledger</Badge>}
          >
            {editable ? (
              <CarryReceiptForm annualPlanId={detail.annualPlan.id} options={carryTargets} />
            ) : (
              <p className="text-sm text-slate-600">
                This fiscal year is closed or archived; carry-in comes from the ledger and is
                not edited here.
              </p>
            )}
          </Card>
        </div>

        <ProgramsSection
          detail={detail}
          editable={editable}
          correctable={correctable}
          budgetEditable={budgetEditable}
          correctedRecords={correctedRecords}
          customFields={programFields}
          customValues={programValues}
        />

        <RecurringOpsSection
          detail={detail}
          editable={editable}
          correctable={correctable}
          correctedRecords={correctedRecords}
          customFields={recurringFields}
          customValues={recurringValues}
        />
      </div>
    </div>
  );
}

function ProgramsSection({
  detail,
  editable,
  correctable,
  budgetEditable,
  correctedRecords,
  customFields,
  customValues,
}: {
  detail: AnnualPlanDetail;
  editable: boolean;
  correctable: boolean;
  budgetEditable: boolean;
  correctedRecords: ReadonlySet<string>;
  customFields: readonly CustomFieldDefinition[];
  customValues: Map<string, CustomFieldValues>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Annual programs</h2>
        <Badge>{detail.programs.length}</Badge>
      </div>

      {detail.initiativeOptions.length === 0 ? (
        <EmptyState>
          Add strategic initiatives to the strategic plan before creating programs.{' '}
          <Link href="/plan/strategic" className={linkClass}>
            Open the strategic plan
          </Link>
        </EmptyState>
      ) : editable ? (
        <Card
          title="Add annual program"
          description="A program belongs to exactly one SI (BR-4) and carries capex and opex budgets. A continuing program links to last year's program (program thread)."
        >
          <Form action={createProgramAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name="annualPlanId" value={detail.annualPlan.id} />
            <TextField label="Code" name="code" defaultValue={detail.suggestedProgramCode} required maxLength={40} />
            <TextField label="Name" name="name" required maxLength={160} />
            <SelectField
              label="Strategic initiative"
              name="siId"
              required
              placeholder="Select an initiative"
              options={detail.initiativeOptions}
            />
            <SelectField
              label="Continues program"
              name="prevProgramId"
              placeholder="No continuation (new program)"
              options={detail.continuationOptions}
              hint="Optional: the prior fiscal year's program of the same SI."
            />
            {budgetEditable ? (
              <>
                <MoneyField label="Capex budget" name="capexBudget" defaultValue={0} required />
                <MoneyField label="Opex budget" name="opexBudget" defaultValue={0} required />
              </>
            ) : (
              <>
                <HiddenField name="capexBudget" value="0" />
                <HiddenField name="opexBudget" value="0" />
                <p className="sm:col-span-2 lg:col-span-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  A program created while the plan is active starts with a zero budget; fund it
                  with a{' '}
                  <Link href={`/plan/annual/${detail.annualPlan.id}/revisions`} className="underline">
                    budget revision
                  </Link>
                  .
                </p>
              </>
            )}
            <p className="sm:col-span-2 lg:col-span-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Carry-in is not typed on a program: it is received through the carry-over ledger
              (a year close, the opening balances, or a reasoned manual receipt).
            </p>
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField label="Notes" name="notes" rows={2} />
            </div>
            <CustomFieldInputs fields={customFields} />
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add program</SubmitButton>
            </div>
          </Form>
        </Card>
      ) : null}

      {detail.programs.length === 0 ? (
        <EmptyState>No programs in this annual plan yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {detail.programs.map((row) => (
            <ProgramCard
              key={row.program.id}
              row={row}
              detail={detail}
              editable={editable}
              correctable={correctable}
              budgetEditable={budgetEditable}
              corrected={correctedRecords.has(row.program.id)}
              customFields={customFields}
              customValues={customValues.get(row.program.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramCard({
  row,
  detail,
  editable,
  correctable,
  budgetEditable,
  corrected,
  customFields,
  customValues,
}: {
  row: ProgramRow;
  detail: AnnualPlanDetail;
  editable: boolean;
  correctable: boolean;
  budgetEditable: boolean;
  corrected: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues?: CustomFieldValues;
}) {
  const { program, availability, allocatedCapex, allocatedOpex, position } = row;
  return (
    <Card
      title={`${program.code} · ${program.name}`}
      description={`${row.siCode} · ${row.siName}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {corrected ? (
            <Badge tone="warning">{CORRECTED_AFTER_CLOSE_LABEL}</Badge>
          ) : null}
          <Badge tone="info">{row.siCode}</Badge>
          <Link
            href={`/plan/programs/${program.id}`}
            className="text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            Thread
          </Link>
        </div>
      }
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-slate-500">Capex available (effective budget + carry-in)</dt>
          <dd className="mt-1 font-medium">
            <Money value={availability.capexAvailable} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex allocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocatedCapex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Capex unallocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.capex.unallocated} />
            {position.capex.over ? <Badge tone="danger">over-allocated</Badge> : null}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex available (effective budget + carry-in)</dt>
          <dd className="mt-1 font-medium">
            <Money value={availability.opexAvailable} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex allocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocatedOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex unallocated</dt>
          <dd className="mt-1 font-medium">
            <Money value={position.opex.unallocated} />
            {position.opex.over ? <Badge tone="danger">over-allocated</Badge> : null}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-slate-600">
        Carry-in received from the ledger: capex <Money value={program.carryInCapex} /> · opex{' '}
        <Money value={program.carryInOpex} />.
      </p>

      <p className="mt-3 text-sm text-slate-600">
        Effective budget: capex <Money value={row.effectiveCapexBudget} /> (initial{' '}
        <Money value={program.capexBudget} />, revisions <Money value={row.revisionCapex} />) · opex{' '}
        <Money value={row.effectiveOpexBudget} /> (initial <Money value={program.opexBudget} />,
        revisions <Money value={row.revisionOpex} />).
      </p>

      <p className="mt-3 text-xs text-slate-500">
        Allocations above the program budget are flagged, never blocked (BR-7/BR-17). Project allocations are
        managed on the project page.
      </p>

      {row.continuationLabel ? (
        <p className="mt-3 text-sm text-slate-600">
          Continues program <span className="font-medium">{row.continuationLabel}</span>.
        </p>
      ) : null}

      {program.notes ? <p className="mt-3 text-sm text-slate-600">{program.notes}</p> : null}

      <CustomFieldsPanel fields={customFields} values={customValues} />

      {editable ? (
        <div className="mt-5 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <details>
            <summary className={summaryClass}>Edit program</summary>
            <ProgramEditForm
              program={program}
              detail={detail}
              budgetEditable={budgetEditable}
              customFields={customFields}
              customValues={customValues}
            />
          </details>

          <div className="flex items-start">
            <ConfirmDialog
              action={voidProgramAction}
              triggerLabel="Void program"
              title="Void this program?"
              consequence="Voiding keeps the program and its history but removes it from active lists."
              confirmLabel="Void program"
            >
              <HiddenField name="id" value={program.id} />
              <ReasonField hint="Recorded in the audit trail." />
            </ConfirmDialog>
          </div>
        </div>
      ) : correctable ? (
        // A closed year keeps the read-only frame: the same form is revealed by
        // the affordance, and no void control is rendered (ADR-0007 §1, §7).
        <CorrectionDisclosure>
          <ProgramEditForm
            program={program}
            detail={detail}
            budgetEditable={budgetEditable}
            customFields={customFields}
            customValues={customValues}
          />
        </CorrectionDisclosure>
      ) : null}
    </Card>
  );
}

/**
 * The program edit form (W5b). The open-year page renders it inside its
 * disclosure; a closed year renders the same element inside the correction
 * affordance, so the correction can never become a different form (ADR-0007 §7).
 */
function ProgramEditForm({
  program,
  detail,
  budgetEditable,
  customFields,
  customValues,
}: {
  program: ProgramRow['program'];
  detail: AnnualPlanDetail;
  budgetEditable: boolean;
  customFields: readonly CustomFieldDefinition[];
  customValues?: CustomFieldValues;
}) {
  return (
    <Form action={updateProgramAction} className="mt-4 grid gap-3 sm:grid-cols-2">
      <HiddenField name="id" value={program.id} />
      <TextField label="Code" name="code" defaultValue={program.code} required maxLength={40} />
      <TextField label="Name" name="name" defaultValue={program.name} required maxLength={160} />
      <SelectField
        label="Strategic initiative"
        name="siId"
        required
        options={detail.initiativeOptions}
        defaultValue={program.siId}
      />
      <SelectField
        label="Continues program"
        name="prevProgramId"
        placeholder="No continuation"
        options={detail.continuationOptions}
        defaultValue={program.prevProgramId ?? ''}
      />
      {budgetEditable ? (
        <>
          <MoneyField
            label="Capex budget"
            name="capexBudget"
            defaultValue={program.capexBudget}
            required
          />
          <MoneyField
            label="Opex budget"
            name="opexBudget"
            defaultValue={program.opexBudget}
            required
          />
        </>
      ) : (
        <>
          <HiddenField name="capexBudget" value={String(program.capexBudget)} />
          <HiddenField name="opexBudget" value={String(program.opexBudget)} />
          <p className="sm:col-span-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Budgets are frozen while the plan is active. Name, notes and the strategic
            initiative stay editable; a budget change is{' '}
            <Link
              href={`/plan/annual/${detail.annualPlan.id}/revisions`}
              className="underline"
            >
              a posted revision
            </Link>
            .
          </p>
        </>
      )}
      <p className="sm:col-span-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Carry-in received: capex <Money value={program.carryInCapex} /> · opex{' '}
        <Money value={program.carryInOpex} /> — recorded in the carry-over ledger, not
        edited here.
      </p>
      <div className="sm:col-span-2">
        <TextAreaField label="Notes" name="notes" defaultValue={program.notes} rows={2} />
      </div>
      <CustomFieldInputs fields={customFields} values={customValues} />
      <div className="sm:col-span-2">
        <ReasonField />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </Form>
  );
}
