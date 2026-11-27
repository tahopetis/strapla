import { Badge } from '@/components/ui';
import { CORRECTED_AFTER_CLOSE_LABEL, CORRECTION_FOOTNOTE } from '@/domain/corrections';

/**
 * The report-side "corrected after close" marker (#108).
 *
 * A marker is a label, never money: a corrected row keeps the live corrected
 * figures, the totals still sum those figures, and this only says where they
 * came from. The footnote sentence comes from the domain so the screen and the
 * CSV/XLSX note cannot drift apart.
 */
const REPORT_CORRECTION_NOTE = CORRECTION_FOOTNOTE;

/**
 * The row-level badge for a report row corrected after its fiscal year closed.
 *
 * `info` rather than `warning`: these tables already spend amber on funding
 * flags and red/emerald on status, and the marker is provenance rather than a
 * warning about the figures.
 */
export function CorrectionBadge() {
  return <Badge tone="info">{CORRECTED_AFTER_CLOSE_LABEL}</Badge>;
}

/** The footnote a report shows under its table when at least one row is marked. */
export function CorrectionNote() {
  return <p className="mt-3 text-xs text-slate-500">{REPORT_CORRECTION_NOTE}</p>;
}
