import {
  HiddenField,
  MoneyField,
  ReasonField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/form';
import { Badge, Card, EmptyState, Money } from '@/components/ui';
import type { CommitmentRow, SettlementOption, SpendRow } from '@/server/plan/execution-queries';
import {
  createCommitmentAction,
  createSpendAction,
  updateCommitmentAction,
  updateSpendAction,
  voidCommitmentAction,
  voidSpendAction,
} from '@/server/plan/execution-actions';

const summaryClass = 'cursor-pointer text-sm font-medium text-slate-700';

function statusTone(status: CommitmentRow['status']): 'neutral' | 'info' | 'success' {
  if (status === 'settled') return 'success';
  if (status === 'partially_settled') return 'info';
  return 'neutral';
}

export function FundingSummaryCard({
  title,
  description,
  totals,
  allocationCapex,
  allocationOpex,
  carryInCapex,
  carryInOpex,
  allowCapex,
}: {
  title: string;
  description: string;
  totals: import('@/server/plan/execution-queries').FundingTotals;
  allocationCapex: number;
  allocationOpex: number;
  carryInCapex: number;
  carryInOpex: number;
  allowCapex: boolean;
}) {
  return (
    <Card
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap gap-1">
          {totals.br11Capex ? <Badge tone="danger">capex spend above commitment (BR-11)</Badge> : null}
          {totals.br11Opex ? <Badge tone="danger">opex spend above commitment (BR-11)</Badge> : null}
        </div>
      }
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {allowCapex ? (
          <>
            <div>
              <dt className="text-slate-500">Capex allocation + carry-in</dt>
              <dd className="mt-1 font-medium">
                <Money value={allocationCapex + carryInCapex} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Capex commitments (open)</dt>
              <dd className="mt-1 font-medium">
                <Money value={totals.fiscalYearCommitmentsCapex} /> (open{' '}
                <Money value={totals.openCommitmentsCapex} />)
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Capex spend this year</dt>
              <dd className="mt-1 font-medium">
                <Money value={totals.currentYearSpendCapex} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Capex remaining</dt>
              <dd className="mt-1 font-medium">
                <Money value={totals.remainingCapex} />
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="text-slate-500">Opex allocation + carry-in</dt>
          <dd className="mt-1 font-medium">
            <Money value={allocationOpex + carryInOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex commitments (open)</dt>
          <dd className="mt-1 font-medium">
            <Money value={totals.fiscalYearCommitmentsOpex} /> (open{' '}
            <Money value={totals.openCommitmentsOpex} />)
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex spend this year</dt>
          <dd className="mt-1 font-medium">
            <Money value={totals.currentYearSpendOpex} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Opex remaining</dt>
          <dd className="mt-1 font-medium">
            <Money value={totals.remainingOpex} />
          </dd>
        </div>
        {totals.priorYearOpeningCapex + totals.priorYearOpeningOpex > 0 ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-slate-500">Prior-year opening payments (excluded from remaining)</dt>
            <dd className="mt-1 font-medium">
              capex <Money value={totals.priorYearOpeningCapex} /> · opex{' '}
              <Money value={totals.priorYearOpeningOpex} />
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-xs text-slate-500">
        Remaining = allocation + carry-in − open commitments − current-year spend, per component
        (ADR-0003 §3). Cross-year settlement portions and prior-year opening payments do not reduce the
        current year. BR-11 warns when current-year spend exceeds the year&apos;s commitments.
      </p>
    </Card>
  );
}

export function CommitmentsSection({
  parentKind,
  parentId,
  rows,
  editable,
  allowCapex,
  today,
}: {
  parentKind: 'allocation' | 'recurring';
  parentId: string;
  rows: CommitmentRow[];
  editable: boolean;
  allowCapex: boolean;
  today: string;
}) {
  const parentField =
    parentKind === 'allocation' ? 'allocationId' : 'recurringOpsItemId';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Commitments</h2>
        <Badge>{rows.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Purchase orders and contract milestones. A commitment is open until spend settles it; open
        commitments reduce the available budget but are not carry-over (charter §6.7).
      </p>

      {editable ? (
        <Card title="Record commitment" description="Commitments are fiscal-year money for this parent.">
          <form action={createCommitmentAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name={parentField} value={parentId} />
            <SelectField
              label="Component"
              name="component"
              required
              options={
                allowCapex
                  ? [
                      { value: 'capex', label: 'Capex' },
                      { value: 'opex', label: 'Opex' },
                    ]
                  : [{ value: 'opex', label: 'Opex' }]
              }
            />
            <MoneyField label="Commitment amount" name="amount" required />
            <TextField label="Commitment date" name="commitmentDate" type="date" defaultValue={today} required />
            <TextField label="Reference" name="reference" maxLength={120} placeholder="PO number or milestone" />
            <div className="sm:col-span-2">
              <TextAreaField label="Description" name="description" rows={2} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Add commitment</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No commitments recorded yet.</EmptyState>
      ) : (
        <Card title="Commitment entries">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Component</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Settled</th>
                  <th className="py-2 pr-4">Open</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.commitment.id}>
                    <td className="py-3 pr-4 uppercase">{row.commitment.component}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.commitment.commitmentDate}</td>
                    <td className="py-3 pr-4">
                      <p>{row.commitment.reference ?? '—'}</p>
                      {row.commitment.description ? (
                        <p className="text-xs text-slate-500">{row.commitment.description}</p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.commitment.amount} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.settledAmount} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.openAmount} />
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(row.status)}>{row.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-3">
                      {editable ? (
                        <details>
                          <summary className={summaryClass}>Manage</summary>
                          <div className="mt-3 grid gap-4 lg:grid-cols-2">
                            <form action={updateCommitmentAction} className="space-y-2">
                              <HiddenField name="id" value={row.commitment.id} />
                              <SelectField
                                label="Component"
                                name="component"
                                options={
                                  allowCapex
                                    ? [
                                        { value: 'capex', label: 'Capex' },
                                        { value: 'opex', label: 'Opex' },
                                      ]
                                    : [{ value: 'opex', label: 'Opex' }]
                                }
                                defaultValue={row.commitment.component}
                              />
                              <MoneyField
                                label="Amount"
                                name="amount"
                                defaultValue={row.commitment.amount}
                                required
                              />
                              <TextField
                                label="Commitment date"
                                name="commitmentDate"
                                type="date"
                                defaultValue={row.commitment.commitmentDate}
                                required
                              />
                              <TextField
                                label="Reference"
                                name="reference"
                                defaultValue={row.commitment.reference}
                              />
                              <TextAreaField
                                label="Description"
                                name="description"
                                defaultValue={row.commitment.description}
                                rows={2}
                              />
                              <ReasonField />
                              <SubmitButton>Save commitment</SubmitButton>
                            </form>
                            <form action={voidCommitmentAction} className="space-y-2">
                              <HiddenField name="id" value={row.commitment.id} />
                              <ReasonField hint="Only commitments without settlements can be voided." />
                              <SubmitButton variant="danger">Void commitment</SubmitButton>
                            </form>
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-500">read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function SpendSection({
  parentKind,
  parentId,
  rows,
  settlementOptions,
  categoryOptions,
  editable,
  allowCapex,
  today,
  fiscalYear,
}: {
  parentKind: 'allocation' | 'recurring';
  parentId: string;
  rows: SpendRow[];
  settlementOptions: SettlementOption[];
  categoryOptions: Array<{ value: string; label: string }>;
  editable: boolean;
  allowCapex: boolean;
  today: string;
  fiscalYear: number;
}) {
  const parentField = parentKind === 'allocation' ? 'allocationId' : 'recurringOpsItemId';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Spend entries</h2>
        <Badge>{rows.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Actual spending (invoices recorded). A spend entry can settle open commitments; settling a
        commitment from an earlier fiscal year is a cross-year settlement and does not reduce this
        year&apos;s remaining. Payments of pre-FY2027 commitments are marked as prior-year opening.
      </p>

      {editable ? (
        <Card title="Record spend" description="Optionally settle open commitments with this payment.">
          <form action={createSpendAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HiddenField name={parentField} value={parentId} />
            <SelectField
              label="Component"
              name="component"
              required
              options={
                allowCapex
                  ? [
                      { value: 'capex', label: 'Capex' },
                      { value: 'opex', label: 'Opex' },
                    ]
                  : [{ value: 'opex', label: 'Opex' }]
              }
            />
            <MoneyField label="Spend amount" name="amount" required />
            <TextField label="Spent on" name="spentOn" type="date" defaultValue={today} required />
            <SelectField
              label="Category"
              name="categoryId"
              placeholder="No category"
              options={categoryOptions}
            />
            <TextField label="Vendor" name="vendor" maxLength={160} />
            <TextField label="Invoice / reference" name="reference" maxLength={120} />
            <div className="sm:col-span-2">
              <TextAreaField label="Description" name="description" rows={2} />
            </div>
            <SelectField
              label="Settlement classification"
              name="settlementKind"
              required
              options={[
                { value: 'current', label: 'Current-year spend (may settle commitments)' },
                {
                  value: 'prior_year_opening',
                  label: 'Pays a pre-FY2027 commitment (opening balance)',
                },
              ]}
            />
            {settlementOptions.length > 0 ? (
              <div className="sm:col-span-2 lg:col-span-3 rounded border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Settle open commitments (optional)</p>
                <p className="mt-1 text-xs text-slate-500">
                  Leave blank for none. FY{fiscalYear} spend settling an earlier-year commitment is
                  classified as cross-year automatically.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {settlementOptions.map((option) => (
                    <label key={option.commitmentId} className="block text-xs text-slate-600">
                      {option.label}
                      <input
                        name={`settle_${option.commitmentId}`}
                        inputMode="numeric"
                        placeholder="0"
                        className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Record spend</SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No spend entries recorded yet.</EmptyState>
      ) : (
        <Card title="Spend entries">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Component</th>
                  <th className="py-2 pr-4">Vendor / reference</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Classification</th>
                  <th className="py-2 pr-4">Settlements</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.spend.id}>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.spend.spentOn}</td>
                    <td className="py-3 pr-4 uppercase">{row.spend.component}</td>
                    <td className="py-3 pr-4">
                      <p>{row.spend.vendor ?? '—'}</p>
                      <p className="text-xs text-slate-500">
                        {row.spend.reference ?? row.categoryName ?? ''}
                      </p>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Money value={row.spend.amount} />
                    </td>
                    <td className="py-3 pr-4">
                      {row.spend.settlementKind === 'prior_year_opening' ? (
                        <Badge tone="info">prior-year opening</Badge>
                      ) : row.crossYearSettled > 0 ? (
                        <Badge tone="warning">cross-year settlement</Badge>
                      ) : (
                        <Badge tone="neutral">current year</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.settlementLinks.length === 0 ? (
                        <span className="text-xs text-slate-500">none</span>
                      ) : (
                        <ul className="space-y-1 text-xs text-slate-600">
                          {row.settlementLinks.map((link) => (
                            <li key={link.commitmentId}>
                              <Money value={link.amount} /> · FY{link.commitmentFiscalYear}
                              {link.commitmentFiscalYear < fiscalYear ? ' (cross-year)' : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-3">
                      {editable ? (
                        <details>
                          <summary className={summaryClass}>Manage</summary>
                          <div className="mt-3 grid gap-4 lg:grid-cols-2">
                            <form action={updateSpendAction} className="space-y-2">
                              <HiddenField name="id" value={row.spend.id} />
                              <SelectField
                                label="Component"
                                name="component"
                                options={
                                  allowCapex
                                    ? [
                                        { value: 'capex', label: 'Capex' },
                                        { value: 'opex', label: 'Opex' },
                                      ]
                                    : [{ value: 'opex', label: 'Opex' }]
                                }
                                defaultValue={row.spend.component}
                              />
                              <MoneyField
                                label="Amount"
                                name="amount"
                                defaultValue={row.spend.amount}
                                required
                              />
                              <TextField
                                label="Spent on"
                                name="spentOn"
                                type="date"
                                defaultValue={row.spend.spentOn}
                                required
                              />
                              <SelectField
                                label="Category"
                                name="categoryId"
                                placeholder="No category"
                                options={categoryOptions}
                                defaultValue={row.spend.categoryId ?? ''}
                              />
                              <TextField label="Vendor" name="vendor" defaultValue={row.spend.vendor} />
                              <TextField
                                label="Invoice / reference"
                                name="reference"
                                defaultValue={row.spend.reference}
                              />
                              <TextAreaField
                                label="Description"
                                name="description"
                                defaultValue={row.spend.description}
                                rows={2}
                              />
                              <SelectField
                                label="Settlement classification"
                                name="settlementKind"
                                options={[
                                  { value: 'current', label: 'Current-year spend' },
                                  {
                                    value: 'prior_year_opening',
                                    label: 'Prior-year opening payment',
                                  },
                                ]}
                                defaultValue={row.spend.settlementKind}
                              />
                              <ReasonField hint="Settlement links are fixed after creation; void and re-enter to change them." />
                              <SubmitButton>Save spend</SubmitButton>
                            </form>
                            <form action={voidSpendAction} className="space-y-2">
                              <HiddenField name="id" value={row.spend.id} />
                              <ReasonField hint="Voiding releases its settlements and excludes it from remaining." />
                              <SubmitButton variant="danger">Void spend</SubmitButton>
                            </form>
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-500">read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
