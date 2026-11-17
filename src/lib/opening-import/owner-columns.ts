/**
 * Owner-added columns on the opening-balance import (W3a / W9 field list).
 *
 * The field list is per deployment and committed to the repo (G5/G6). To let the
 * owner capture extra record metadata, add a column here: it is typed and validated
 * exactly like an app-owned column, appears in the generated CSV/XLSX template, and
 * never participates in money, remaining or flags (G1). Columns are added to the
 * data set they belong to; the app-owned columns live in `field-list.ts`.
 *
 * `projects` carries one committed owner column as the working demonstration of the
 * mechanism and for the import UAT ("one extra typed column proven end to end",
 * UX-ENHANCEMENT-PROPOSAL §14). Replace or extend it when the owner declares the
 * real columns for this deployment; it may be removed if the owner does not want it.
 *
 * Example shape:
 *
 *   {
 *     name: 'procurementMethod',
 *     label: 'Procurement method',
 *     type: 'text',
 *     required: false,
 *     description: 'Owner-added column: how the project is procured.',
 *     example: 'Tender',
 *   }
 *
 * Storage of the values per record arrives with the Phase B load (W9).
 */
import type { OpeningDataSetId, OpeningField } from './field-list.ts';

export const OWNER_COLUMNS: Record<OpeningDataSetId, readonly OpeningField[]> = {
  'strategic-initiatives': [],
  'annual-programs': [],
  projects: [
    {
      name: 'procurementMethod',
      label: 'Procurement method',
      type: 'text',
      required: false,
      description: 'Owner-added column: how the project is procured (metadata, never money).',
      example: 'Tender',
    },
  ],
};
