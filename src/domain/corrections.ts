/**
 * Closed-year audited corrections (ADR-0007, issue #108).
 *
 * A closed fiscal year accepts in-place **updates** of existing plan records.
 * Such a write is a *correction after close*: the server derives that from the
 * governing annual plan's status at write time — there is no client-supplied
 * flag — and records it under its own audit action so the trail, the record
 * badge, the closed plan's banner, the report markers and the close receipt
 * notice all recognise it the same way.
 *
 * What a correction never touches: the close snapshot, the carry-over ledger
 * and the `carry_in_*` caches. Those are the frozen record of the close
 * decision (ADR-0006); correcting a live figure does not re-open it. Creates,
 * voids, status changes and settlement-link edits keep refusing in a closed
 * year, and an archived strategic plan, a cancelled project and a voided record
 * stay fully read-only.
 *
 * "Corrected after close" is never stored: it is derived from the audit trail
 * (a `correction` entry for the entity), so a schema change is not needed and
 * the marker cannot drift from the trail.
 */

/** The audit action a closed-year in-place update is recorded under. */
export const CORRECTION_ACTION = 'correction' as const;

/** The label a corrected record, report row and export column carry. */
export const CORRECTED_AFTER_CLOSE_LABEL = 'Corrected after close';

/**
 * The footnote a report carries when one of its rows rests on a corrected
 * record (ADR-0007 §8). It keeps the two truths apart: the figures are the live
 * corrected figures, the close snapshot is the historical record. Shared by the
 * screen and the CSV/XLSX note so the two can never drift.
 */
export const CORRECTION_FOOTNOTE =
  'Rows marked corrected after close rest on a record corrected after the year closed. The figures shown are the live corrected figures; the close snapshot remains the historical record.';

/**
 * The guard option an update path passes to say "a closed year is allowed here,
 * and the write is audited as a correction". Naming the option keeps it from
 * reading as a generic escape hatch: it is the correction path, and only the
 * six correctable update operations pass it (ADR-0007 §2).
 */
export const CORRECTION_WRITE = { allowClosed: true } as const;

type PlanStatus = 'draft' | 'active' | 'closed';

/** True when a write governed by this annual plan is a correction after close. */
export function isCorrectionAfterClose(annualPlan: { status: PlanStatus }): boolean {
  return annualPlan.status === 'closed';
}

/**
 * The audit action for an in-place update of an existing record (ADR-0007 §5):
 * `correction` in a closed year, `update` otherwise.
 */
export function updateAuditAction(annualPlan: { status: PlanStatus }): 'correction' | 'update' {
  return isCorrectionAfterClose(annualPlan) ? CORRECTION_ACTION : 'update';
}

/**
 * The minimum length of a reason. Every update form already requires one; a
 * correction is held to the same standard rather than a looser one, because the
 * reason is the whole ceremony (ADR-0007 §5, §7).
 */
const MIN_REASON_LENGTH = 3;

/**
 * Whether a reason is good enough for a correction. Callers turn a `false` into
 * their own form refusal, so the message stays with the form that asks for it.
 */
export function isCorrectionReason(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().length >= MIN_REASON_LENGTH;
}
