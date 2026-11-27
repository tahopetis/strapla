import type { AnnualPlan } from '@/db/schema';
import {
  isCorrectionAfterClose,
  isCorrectionReason,
  updateAuditAction,
} from '@/domain/corrections';
import { FormError } from '@/server/actions/common';

/**
 * The closed-year correction guards the six in-place update operations share
 * (ADR-0007 §1, §5).
 *
 * The *editability* guards stay with the action modules: each one sees a
 * different combination of closed year, archived strategic plan, cancelled
 * project and voided record, and refusing in its own words is the point. The
 * **reason** rule is one rule, so it lives once here — six copies of the same
 * message would let the six paths drift apart, and the product promises an
 * administrator one wording, not six.
 */

/** The refusal a correction gets when its reason is missing or too thin (ADR-0007 §5). */
export const CORRECTION_REASON_MESSAGE = 'Give a reason for a correction after close.';

/**
 * Defence in depth on the reason a correction must carry (ADR-0007 §5). Every
 * update schema already requires a reason; this check keeps the rule on the
 * write path itself, so a correction cannot be saved without one whichever form
 * or caller reached the operation (the ijin prinsip schema makes the field
 * optional, and a future caller is not a promise).
 */
export function requireCorrectionReason(
  annualPlan: Pick<AnnualPlan, 'status'>,
  reason: string | null | undefined,
): void {
  if (!isCorrectionAfterClose(annualPlan)) return;
  if (!isCorrectionReason(reason)) throw new FormError(CORRECTION_REASON_MESSAGE);
}

/**
 * The two rule calls every in-place update path makes, in one place
 * (ADR-0007 §5): classify the audit action from the governing plan's status at
 * write time, then hold a correction to its reason. Returning the action keeps
 * the six wirings one rule instead of six copies of the same preamble.
 */
export function correctionAuditAction(
  annualPlan: Pick<AnnualPlan, 'status'>,
  reason: string | null | undefined,
): 'correction' | 'update' {
  const action = updateAuditAction(annualPlan);
  requireCorrectionReason(annualPlan, reason);
  return action;
}
