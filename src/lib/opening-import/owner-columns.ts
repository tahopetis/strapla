/**
 * Owner-added columns on the opening-balance import (W3a / W9 field list).
 *
 * The field list is per deployment and committed to the repo (G5/G6). This file
 * is the **headless** list: the template/parser CLI and the dry-run harness have
 * no database, so they read owner columns from here. At runtime the server reads
 * the active custom-field registry instead (Administration → Custom fields), so
 * an administrator-added field is importable without a code change; the two
 * sources share identifiers — a column's `name` here is the registry's stable
 * `key` — and the W9 demonstration column below was seeded into the registry by
 * migration 0006.
 *
 * Add a committed column here only for the headless tooling. Columns are typed
 * and validated exactly like an app-owned column, never participate in money,
 * remaining or flags (G1), and are merged into the data set they belong to. The
 * app-owned columns live in `field-list.ts`.
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
