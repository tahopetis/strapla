'use client';

import { Form, HiddenField, ReasonField, SubmitButton, TextField, useFieldState } from '@/components/form';
import { inputClass } from '@/components/ui';
import { formatRupiah } from '@/domain/money';
import type { RevisionProgramPosition } from '@/domain/revisions';
import { revisionAllocationFieldName, revisionProgramFieldName } from '@/lib/revision-form';
import { createRevisionAction } from '@/server/plan/revision-actions';
import type { RevisionAllocationOption } from '@/server/plan/revision-queries';

/**
 * The budget revision create form (#112, ADR-0006 §4).
 *
 * The header is an ordinary form; the lines are a grid of signed amounts, one
 * per program and component, plus a de-allocation grid for the switches that
 * need it. A blank cell means "this entity does not change", so the same grid
 * posts a switch, a cut or an addition without any client-side state.
 */

/**
 * One signed delta cell. `MoneyField` only accepts digits, so a cut needs the
 * raw input and the shared field wiring for its message and echo.
 */
function RevisionDeltaField({ name, label }: { name: string; label: string }) {
  const { error, echo, errorId, invalid } = useFieldState(name);
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        name={name}
        inputMode="text"
        defaultValue={echo}
        placeholder="—"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={error ? errorId : undefined}
        className={`${inputClass} mt-0 tabular-nums`}
      />
      {error ? (
        <span id={errorId} className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const cell = 'px-2 py-2 align-top';
const headCell = 'px-2 pb-2 text-left text-xs uppercase tracking-wide text-slate-500';

export function RevisionForm({
  annualPlanId,
  today,
  programs,
  allocations,
}: {
  annualPlanId: string;
  today: string;
  programs: readonly RevisionProgramPosition[];
  allocations: readonly RevisionAllocationOption[];
}) {
  return (
    <Form action={createRevisionAction} className="space-y-6">
      <HiddenField name="annualPlanId" value={annualPlanId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Revision date"
          name="revisionDate"
          type="date"
          defaultValue={today}
          required
        />
        <TextField
          label="Decision reference"
          name="decisionReference"
          maxLength={160}
          hint="Optional: leave blank when the formal decision does not exist yet — the revision shows as awaiting it, and it can be recorded later."
        />
      </div>
      <ReasonField hint="Required: why the budget changes (recorded in the audit trail and shown in the register)." />

      <div>
        <h3 className="text-sm font-semibold text-slate-700">Program budget lines</h3>
        <p className="mt-1 text-xs text-slate-500">
          A signed amount per program and component: a minus is a cut, a plus an addition. A switch
          is one program down and another up in the <em>same</em> component — capex and opex never
          offset each other. Leave a cell blank when the program does not change.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={headCell}>Program</th>
                <th className={headCell}>Effective capex</th>
                <th className={headCell}>Capex delta</th>
                <th className={headCell}>Effective opex</th>
                <th className={headCell}>Opex delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map((program) => {
                const label = `${program.code} · ${program.name}`;
                return (
                  <tr key={program.programId}>
                    <td className={`${cell} whitespace-nowrap font-medium`}>{label}</td>
                    <td className={`${cell} whitespace-nowrap tabular-nums text-slate-600`}>
                      {formatRupiah(program.capexBudget)}
                    </td>
                    <td className={cell}>
                      <RevisionDeltaField
                        name={revisionProgramFieldName(program.programId, 'capex')}
                        label={`${label} capex delta`}
                      />
                    </td>
                    <td className={`${cell} whitespace-nowrap tabular-nums text-slate-600`}>
                      {formatRupiah(program.opexBudget)}
                    </td>
                    <td className={cell}>
                      <RevisionDeltaField
                        name={revisionProgramFieldName(program.programId, 'opex')}
                        label={`${label} opex delta`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {allocations.length > 0 ? (
        <details open={false}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            De-allocate project year allocations
          </summary>
          <p className="mt-1 text-xs text-slate-500">
            A switch may take only a program&apos;s unallocated budget. When it takes more, free the
            difference here: a de-allocation is always negative and may not push an allocation below
            its open commitments plus current-year spend.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={headCell}>Project year allocation</th>
                  <th className={headCell}>Effective capex</th>
                  <th className={headCell}>Capex de-allocation</th>
                  <th className={headCell}>Effective opex</th>
                  <th className={headCell}>Opex de-allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td className={`${cell} font-medium`}>{allocation.label}</td>
                    <td className={`${cell} whitespace-nowrap tabular-nums text-slate-600`}>
                      {formatRupiah(allocation.effectiveCapex)}
                    </td>
                    <td className={cell}>
                      <RevisionDeltaField
                        name={revisionAllocationFieldName(allocation.id, 'capex')}
                        label={`${allocation.label} capex de-allocation`}
                      />
                    </td>
                    <td className={`${cell} whitespace-nowrap tabular-nums text-slate-600`}>
                      {formatRupiah(allocation.effectiveOpex)}
                    </td>
                    <td className={cell}>
                      <RevisionDeltaField
                        name={revisionAllocationFieldName(allocation.id, 'opex')}
                        label={`${allocation.label} opex de-allocation`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <SubmitButton>Post revision</SubmitButton>
    </Form>
  );
}
