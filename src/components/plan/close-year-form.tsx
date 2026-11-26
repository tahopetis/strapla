'use client';

import { useActionState, useState, type Dispatch, type SetStateAction } from 'react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Card, Money } from '@/components/ui';
import {
  carryOverTotals,
  closeConfirmationPhrase,
  type CarryOverAmount,
  type CarryOverTotalsByEntity,
} from '@/domain/close';
import { formatRupiah, parseRupiah } from '@/domain/money';
import { initialFormState } from '@/lib/form-state';
import {
  carryOverFieldName,
  notCarriedReasonFieldName,
  targetProgramFieldName,
  type CarryOverComponent,
} from '@/lib/close-form';
import { closeFiscalYearAction } from '@/server/plan/close-actions';

const th = 'py-2 pr-3 text-left text-xs uppercase tracking-wide text-slate-500';
const moneyInput =
  'block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const selectClass =
  'block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const COMPONENTS: readonly CarryOverComponent[] = ['capex', 'opex'];

export interface CloseYearProgram {
  id: string;
  code: string;
  name: string;
  availableCapex: number;
  availableOpex: number;
  /** The only valid target when set (the continuation program). */
  continuationProgramId: string | null;
  /** Same-initiative targets offered when the source is discontinued or merged. */
  targetPrograms: Array<{ value: string; label: string }>;
}

export interface CloseYearAllocation {
  id: string;
  projectCode: string;
  projectName: string;
  availableCapex: number;
  availableOpex: number;
  hasTargetAllocation: boolean;
  note: string | null;
}

export interface CloseYearFormProps {
  annualPlanId: string;
  fiscalYear: number;
  targetFiscalYear: number;
  programs: CloseYearProgram[];
  allocations: CloseYearAllocation[];
}

type Amounts = Record<string, Record<CarryOverComponent, string>>;

function initialAmounts(rows: ReadonlyArray<{ id: string }>): Amounts {
  return Object.fromEntries(rows.map((row) => [row.id, { capex: '', opex: '' }]));
}

/** Live preview parsing: an invalid or blank field is counted as invalid, not zeroed silently. */
function previewAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    return parseRupiah(trimmed);
  } catch {
    return null;
  }
}

/**
 * The year-close form (W4a/W5b, #113). It owns the carry amounts, the
 * not-carried reasons, the approval reference, the typed confirmation and the
 * discontinuous target programs as local state, so the preview above the button
 * is derived from real values and a refused close keeps every one of them. Zero
 * carry must be typed; a reason is needed whenever part of the available amount
 * stays behind (the close snapshot records it).
 */
export function CloseYearForm({
  annualPlanId,
  fiscalYear,
  targetFiscalYear,
  programs,
  allocations,
}: CloseYearFormProps) {
  const confirmationPhrase = closeConfirmationPhrase(fiscalYear);
  const [state, formAction] = useActionState(closeFiscalYearAction, initialFormState);
  const [programAmounts, setProgramAmounts] = useState<Amounts>(() => initialAmounts(programs));
  const [allocationAmounts, setAllocationAmounts] = useState<Amounts>(() => initialAmounts(allocations));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // The approval reference, typed confirmation and target selects are kept as
  // local state: React resets an uncontrolled form after its action runs, and a
  // refused close must not discard what the user entered.
  const [reference, setReference] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(programs.map((row) => [row.id, row.continuationProgramId ?? ''])),
  );
  const referenceError = state.fieldErrors?.reference;
  const confirmationError = state.fieldErrors?.confirmation;

  const entries: CarryOverAmount[] = [];
  let hasInvalid = false;
  for (const row of programs) {
    for (const component of COMPONENTS) {
      const amount = previewAmount(programAmounts[row.id]?.[component] ?? '');
      if (amount === null) hasInvalid = true;
      else entries.push({ entityType: 'program', component, amount });
    }
  }
  for (const row of allocations) {
    for (const component of COMPONENTS) {
      const amount = previewAmount(allocationAmounts[row.id]?.[component] ?? '');
      if (amount === null) hasInvalid = true;
      else entries.push({ entityType: 'allocation', component, amount });
    }
  }

  let totals: CarryOverTotalsByEntity;
  try {
    totals = carryOverTotals(entries);
  } catch {
    totals = carryOverTotals([]);
    hasInvalid = true;
  }

  const setAmount = (
    setter: Dispatch<SetStateAction<Amounts>>,
    entityId: string,
    component: CarryOverComponent,
    value: string,
  ) => {
    setter((current) => ({
      ...current,
      [entityId]: { ...(current[entityId] ?? { capex: '', opex: '' }), [component]: value },
    }));
  };

  /** True when the typed carry leaves part of the available amount behind. */
  const needsReason = (available: { capex: number; opex: number }, amounts: Amounts, id: string) => {
    return COMPONENTS.some((component) => {
      const carried = previewAmount(amounts[id]?.[component] ?? '');
      return carried !== null && carried < available[component];
    });
  };

  const reasonField = (entityType: 'program' | 'allocation', entityId: string, required: boolean) => (
    <input
      name={notCarriedReasonFieldName(entityType, entityId)}
      maxLength={1000}
      placeholder={required ? 'Why is the rest not carried? (required)' : 'Only when part is not carried'}
      value={reasons[`${entityType}:${entityId}`] ?? ''}
      onChange={(event) =>
        setReasons((current) => ({ ...current, [`${entityType}:${entityId}`]: event.target.value }))
      }
      className={moneyInput}
      aria-label={`${entityType} not-carried reason`}
      aria-invalid={required ? true : undefined}
    />
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="annualPlanId" value={annualPlanId} />

      <Card
        title="Program carry-over"
        description="Unallocated program budget moves to the continuation program in the target year. A program without a continuation was discontinued or merged: its target must be chosen explicitly within the same strategic initiative."
      >
        {programs.length === 0 ? (
          <p className="text-sm text-slate-600">No programs in this fiscal year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>Program</th>
                  <th className={th}>Capex available</th>
                  <th className={th}>Carry capex</th>
                  <th className={th}>Opex available</th>
                  <th className={th}>Carry opex</th>
                  <th className={th}>Target program (FY{targetFiscalYear})</th>
                  <th className={th}>Not-carried reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {programs.map((row) => {
                  const reasonRequired = needsReason(
                    { capex: row.availableCapex, opex: row.availableOpex },
                    programAmounts,
                    row.id,
                  );
                  const continuationLabel = row.continuationProgramId
                    ? (row.targetPrograms.find((option) => option.value === row.continuationProgramId)
                        ?.label ?? row.continuationProgramId)
                    : null;
                  return (
                    <tr key={row.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{row.code}</p>
                        <p className="text-slate-600">{row.name}</p>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={row.availableCapex} />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          name={carryOverFieldName('program', row.id, 'capex')}
                          inputMode="numeric"
                          required
                          placeholder="0"
                          value={programAmounts[row.id]?.capex ?? ''}
                          onChange={(event) =>
                            setAmount(setProgramAmounts, row.id, 'capex', event.target.value)
                          }
                          className={moneyInput}
                        />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={row.availableOpex} />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          name={carryOverFieldName('program', row.id, 'opex')}
                          inputMode="numeric"
                          required
                          placeholder="0"
                          value={programAmounts[row.id]?.opex ?? ''}
                          onChange={(event) =>
                            setAmount(setProgramAmounts, row.id, 'opex', event.target.value)
                          }
                          className={moneyInput}
                        />
                      </td>
                      <td className="py-3 pr-3 min-w-48">
                        {row.continuationProgramId ? (
                          <>
                            <p className="text-slate-700">{continuationLabel}</p>
                            <input
                              type="hidden"
                              name={targetProgramFieldName(row.id)}
                              value={row.continuationProgramId}
                            />
                            <p className="mt-1 text-xs text-slate-500">Continuation program</p>
                          </>
                        ) : (
                          <>
                            <select
                              name={targetProgramFieldName(row.id)}
                              value={targets[row.id] ?? ''}
                              onChange={(event) =>
                                setTargets((current) => ({ ...current, [row.id]: event.target.value }))
                              }
                              className={selectClass}
                            >
                              <option value="">Choose a target program</option>
                              {row.targetPrograms.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-amber-700">
                              Source discontinued or merged: the target is a reallocation decision.
                            </p>
                          </>
                        )}
                      </td>
                      <td className="py-3 pr-3 min-w-56">
                        {reasonField(
                          'program',
                          row.id,
                          reasonRequired &&
                            (reasons[`program:${row.id}`] ?? '').trim() === '',
                        )}
                        {reasonRequired && (reasons[`program:${row.id}`] ?? '').trim() === '' ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            Part of the available amount is not carried: a reason is required.
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Project allocation carry-over"
        description="The remaining slice of each project moves into its target-year allocation."
      >
        {allocations.length === 0 ? (
          <p className="text-sm text-slate-600">No allocations in this fiscal year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className={th}>Project</th>
                  <th className={th}>Remaining capex</th>
                  <th className={th}>Carry capex</th>
                  <th className={th}>Remaining opex</th>
                  <th className={th}>Carry opex</th>
                  <th className={th}>Target</th>
                  <th className={th}>Not-carried reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map((row) => {
                  const reasonRequired = needsReason(
                    { capex: row.availableCapex, opex: row.availableOpex },
                    allocationAmounts,
                    row.id,
                  );
                  return (
                    <tr key={row.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{row.projectCode}</p>
                        <p className="text-slate-600">{row.projectName}</p>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={row.availableCapex} />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          name={carryOverFieldName('allocation', row.id, 'capex')}
                          inputMode="numeric"
                          required
                          placeholder="0"
                          value={allocationAmounts[row.id]?.capex ?? ''}
                          onChange={(event) =>
                            setAmount(setAllocationAmounts, row.id, 'capex', event.target.value)
                          }
                          className={moneyInput}
                        />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Money value={row.availableOpex} />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          name={carryOverFieldName('allocation', row.id, 'opex')}
                          inputMode="numeric"
                          required
                          placeholder="0"
                          value={allocationAmounts[row.id]?.opex ?? ''}
                          onChange={(event) =>
                            setAmount(setAllocationAmounts, row.id, 'opex', event.target.value)
                          }
                          className={moneyInput}
                        />
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-600">
                        {row.hasTargetAllocation
                          ? 'Existing target allocation (carry-in is added)'
                          : (row.note ?? '—')}
                      </td>
                      <td className="py-3 pr-3 min-w-56">
                        {reasonField(
                          'allocation',
                          row.id,
                          reasonRequired &&
                            (reasons[`allocation:${row.id}`] ?? '').trim() === '',
                        )}
                        {reasonRequired && (reasons[`allocation:${row.id}`] ?? '').trim() === '' ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            Part of the remaining amount is not carried: a reason is required.
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Approval and close" description="Closing is irreversible: there is no reopen in v1 (charter §6.7).">
        <section
          aria-label="Carry-over totals preview"
          className="mb-5 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-slate-800">Carry-over totals from the amounts entered</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Program capex</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(totals.program.capex)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Program opex</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(totals.program.opex)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Allocation capex</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(totals.allocation.capex)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Allocation opex</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(totals.allocation.opex)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            These are the amounts entered; the close rejects any amount above what is available or
            remaining, and records the part left behind with its reason.
          </p>
          {hasInvalid ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              Every carry-over field needs a whole Rupiah amount; enter 0 for none. A blank or non-numeric
              field blocks the close.
            </p>
          ) : null}
        </section>

        <FormMessage state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Approval reference
            <input
              name="reference"
              required
              maxLength={160}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              aria-invalid={referenceError ? true : undefined}
              aria-describedby={referenceError ? 'close-reference-error' : undefined}
              placeholder="Board approval or memo reference"
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            {referenceError ? (
              <span id="close-reference-error" className="mt-1 block text-xs font-medium text-red-700">
                {referenceError}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Typed confirmation
            <input
              name="confirmation"
              required
              autoComplete="off"
              maxLength={40}
              pattern={confirmationPhrase}
              title={`Type ${confirmationPhrase} to confirm`}
              placeholder={confirmationPhrase}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={confirmationError ? true : undefined}
              aria-describedby={confirmationError ? 'close-confirmation-error' : undefined}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Type <code className="font-mono">{confirmationPhrase}</code> exactly to confirm.
            </span>
            {confirmationError ? (
              <span id="close-confirmation-error" className="mt-1 block text-xs font-medium text-red-700">
                {confirmationError}
              </span>
            ) : null}
          </label>
          <div className="flex items-end sm:col-span-2">
            <SubmitButton pendingLabel="Closing…">
              Close FY{fiscalYear} and carry over
            </SubmitButton>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Carry amounts start blank: enter an amount for every field — type 0 for none. A blank field
          blocks the close. The close records a snapshot of available / carried / not-carried per entity
          and component; the not-carried reason is required whenever part of the amount stays behind.
          After the close, settlement lifecycle events (paying existing commitments) can still be
          recorded and are audited; all other edits on the closed year are blocked.
        </p>
      </Card>
    </form>
  );
}
