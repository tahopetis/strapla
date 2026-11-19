/**
 * The declared opening-balance import schema (W3a / W9 field list).
 *
 * This module is the single source of truth for the import template and the
 * parser: the CSV/XLSX headers, the type of every column, which columns are
 * required, the description shown to the owner, and the example row.
 *
 * The three data sets are the three opening edit surfaces (docs/OPENING-BALANCE-LOAD.md):
 * strategic initiatives, annual programs and projects. Project year allocation
 * carry-in is deliberately **not** part of the project data set: it is stored per
 * project *per fiscal year* on `project_year_allocations` (ADR-0003 §2), so it is a
 * separate opening figure entered with the allocation. It is not one of these three
 * import data sets; the Phase B wizard adds that level.
 *
 * Owner-added columns are declared in `owner-columns.ts`, committed to the repo and
 * reviewed like configuration. They are typed and validated exactly like app-owned
 * columns and never participate in money, remaining or flags (G1/G2/G5/G6).
 */

import { OWNER_COLUMNS } from './owner-columns.ts';

export type OpeningDataSetId = 'strategic-initiatives' | 'annual-programs' | 'projects';

export type OpeningFieldType = 'text' | 'number' | 'date';

/** One declared column of an opening data set. */
export interface OpeningField {
  /** Stable key used in parsed rows and in code. */
  name: string;
  /** Column header shown in the generated CSV/XLSX template. */
  label: string;
  type: OpeningFieldType;
  required: boolean;
  /** Shown in the template instructions; use the domain vocabulary. */
  description: string;
  /** Example value rendered into the template example row (always a string). */
  example: string;
}

/** A field as declared after merging app-owned and owner-added columns. */
export interface DeclaredOpeningField extends OpeningField {
  owner: boolean;
}

export interface OpeningDataSet {
  id: OpeningDataSetId;
  title: string;
  description: string;
  /** App-owned columns only; `openingFieldList` merges the owner columns in. */
  fields: readonly OpeningField[];
}

export class OpeningFieldListError extends Error {}

const TEXT = 'text' as const;
const NUMBER = 'number' as const;
const DATE = 'date' as const;

const STRATEGIC_INITIATIVE_FIELDS: readonly OpeningField[] = [
  {
    name: 'code',
    label: 'Code',
    type: TEXT,
    required: true,
    description: 'Unique initiative code within the strategic plan.',
    example: 'SI-01',
  },
  {
    name: 'name',
    label: 'Name',
    type: TEXT,
    required: true,
    description: 'Initiative name.',
    example: 'Digital service platform',
  },
  {
    name: 'owner',
    label: 'Owner',
    type: TEXT,
    required: false,
    description: 'Accountable person or role.',
    example: 'Chief Information Officer',
  },
  {
    name: 'objective',
    label: 'Objective',
    type: TEXT,
    required: false,
    description: 'Short objective of the initiative.',
    example: 'Consolidate citizen-facing services on one platform.',
  },
  {
    name: 'envelopeAmount',
    label: 'Envelope amount (Rp)',
    type: NUMBER,
    required: true,
    description: 'Five-year budget ceiling of the initiative, whole Rupiah.',
    example: '12500000000',
  },
  {
    name: 'priorProgramBudgetUsed',
    label: 'Prior program budget consumed (Rp)',
    type: NUMBER,
    required: false,
    description:
      'Opening balance: program budget already consumed before the first in-app fiscal year.',
    example: '3250000000',
  },
  {
    name: 'notes',
    label: 'Notes',
    type: TEXT,
    required: false,
    description: 'Free notes for the initiative.',
    example: 'Signed off with the FY2026 close.',
  },
];

const ANNUAL_PROGRAM_FIELDS: readonly OpeningField[] = [
  {
    name: 'code',
    label: 'Code',
    type: TEXT,
    required: true,
    description: 'Unique program code within the annual plan; the project data set refers to it.',
    example: 'PRG-01',
  },
  {
    name: 'name',
    label: 'Name',
    type: TEXT,
    required: true,
    description: 'Program name.',
    example: 'Platform modernisation',
  },
  {
    name: 'siCode',
    label: 'Strategic initiative code',
    type: TEXT,
    required: true,
    description: 'Code of the strategic initiative this program belongs to.',
    example: 'SI-01',
  },
  {
    name: 'prevProgramCode',
    label: 'Previous program code',
    type: TEXT,
    required: false,
    description:
      'Continuation link to the prior year program of the same thread; blank when there is none.',
    example: 'PRG-01-2026',
  },
  {
    name: 'capexBudget',
    label: 'Capex budget (Rp)',
    type: NUMBER,
    required: true,
    description: 'Capex budget of the program, whole Rupiah.',
    example: '8000000000',
  },
  {
    name: 'opexBudget',
    label: 'Opex budget (Rp)',
    type: NUMBER,
    required: true,
    description: 'Opex budget of the program, whole Rupiah.',
    example: '2500000000',
  },
  {
    name: 'carryInCapex',
    label: 'Capex carry-in (Rp)',
    type: NUMBER,
    required: false,
    description: 'Opening balance: capex carried forward from the manually closed prior year.',
    example: '750000000',
  },
  {
    name: 'carryInOpex',
    label: 'Opex carry-in (Rp)',
    type: NUMBER,
    required: false,
    description: 'Opening balance: opex carried forward from the manually closed prior year.',
    example: '150000000',
  },
  {
    name: 'notes',
    label: 'Notes',
    type: TEXT,
    required: false,
    description: 'Free notes for the program.',
    example: 'Runs with the platform team.',
  },
];

const PROJECT_FIELDS: readonly OpeningField[] = [
  {
    name: 'code',
    label: 'Code',
    type: TEXT,
    required: false,
    description:
      'Project code; leave blank to let the app generate PRJ-<first fiscal year>-<nnn>. A supplied code must be unique.',
    example: 'PRJ-2027-001',
  },
  {
    name: 'name',
    label: 'Name',
    type: TEXT,
    required: true,
    description: 'Project name.',
    example: 'Core network replacement',
  },
  {
    name: 'originatingProgramCode',
    label: 'Originating program code',
    type: TEXT,
    required: true,
    description: 'Code of the annual program the project derives from.',
    example: 'PRG-01',
  },
  {
    name: 'externalReference',
    label: 'External reference',
    type: TEXT,
    required: false,
    description: 'Reference used by the funding documents (for example the DIPA line).',
    example: 'DIPA-2027-014',
  },
  {
    name: 'owner',
    label: 'Owner',
    type: TEXT,
    required: false,
    description: 'Accountable person or role.',
    example: 'Network Manager',
  },
  {
    name: 'description',
    label: 'Description',
    type: TEXT,
    required: false,
    description: 'Short description of the project scope.',
    example: 'Replace the core switches and the distribution layer.',
  },
  {
    name: 'startFiscalYear',
    label: 'Start fiscal year',
    type: NUMBER,
    required: true,
    description: 'First fiscal year of the project.',
    example: '2027',
  },
  {
    name: 'endFiscalYear',
    label: 'End fiscal year',
    type: NUMBER,
    required: true,
    description: 'Last fiscal year of the project.',
    example: '2028',
  },
  {
    name: 'allocatedBudgetFullLife',
    label: 'Full-life allocated budget (Rp)',
    type: NUMBER,
    required: true,
    description: 'Budget allocated to the project over its whole life, whole Rupiah.',
    example: '9500000000',
  },
  {
    name: 'submittedPrice',
    label: 'Submitted price (Rp)',
    type: NUMBER,
    required: false,
    description: 'Highest vendor price submitted for the project.',
    example: '9400000000',
  },
  {
    name: 'finalDealPrice',
    label: 'Final deal price (Rp)',
    type: NUMBER,
    required: false,
    description: 'Negotiated contract value of the project (whole life).',
    example: '9250000000',
  },
  {
    name: 'openingAllocated',
    label: 'Opening allocated budget (Rp)',
    type: NUMBER,
    required: false,
    description: 'Opening balance: budget allocated to the project before the first in-app year.',
    example: '1200000000',
  },
  {
    name: 'openingCommitted',
    label: 'Opening open commitments (Rp)',
    type: NUMBER,
    required: false,
    description: 'Opening balance: commitments still open before the first in-app year.',
    example: '450000000',
  },
  {
    name: 'openingSpent',
    label: 'Opening actual spend (Rp)',
    type: NUMBER,
    required: false,
    description: 'Opening balance: actual spend before the first in-app year.',
    example: '300000000',
  },
  {
    name: 'ijinPrinsipDocumentNumber',
    label: 'Ijin prinsip document number',
    type: TEXT,
    required: false,
    description: 'Document number of the directors’ in-principle approval.',
    example: '002/IP/2026',
  },
  {
    name: 'ijinPrinsipDocumentDate',
    label: 'Ijin prinsip document date',
    type: DATE,
    required: false,
    description: 'Date of the in-principle approval document.',
    example: '2026-03-31',
  },
  {
    name: 'ijinPrinsipApprovedAmount',
    label: 'Ijin prinsip approved amount (Rp)',
    type: NUMBER,
    required: false,
    description: 'Amount approved by the directors.',
    example: '9250000000',
  },
  {
    name: 'ijinPrinsipApprover',
    label: 'Ijin prinsip approver',
    type: TEXT,
    required: false,
    description: 'Who signed the in-principle approval.',
    example: 'Board of Directors',
  },
  {
    name: 'ijinPrinsipDocumentUrl',
    label: 'Ijin prinsip document link',
    type: TEXT,
    required: false,
    description: 'Link to the approval document (documents are linked, never uploaded).',
    example: 'https://example.go.id/ijin-prinsip/002-IP-2026',
  },
  {
    name: 'ijinPrinsipNotes',
    label: 'Ijin prinsip notes',
    type: TEXT,
    required: false,
    description: 'Free notes recorded on the in-principle approval.',
    example: 'Approved with the condition that the contract is signed before year end.',
  },
];

export const OPENING_DATA_SETS: Record<OpeningDataSetId, OpeningDataSet> = {
  'strategic-initiatives': {
    id: 'strategic-initiatives',
    title: 'Strategic initiatives',
    description:
      'Strategic initiatives with their five-year envelope and the prior program budget consumed opening figure.',
    fields: STRATEGIC_INITIATIVE_FIELDS,
  },
  'annual-programs': {
    id: 'annual-programs',
    title: 'Annual programs',
    description:
      'Annual programs with capex/opex budgets and the carry-in opening figures for the target annual plan.',
    fields: ANNUAL_PROGRAM_FIELDS,
  },
  projects: {
    id: 'projects',
    title: 'Projects',
    description:
      'Projects with their full-life procurement figures, opening balances and ijin prinsip record.',
    fields: PROJECT_FIELDS,
  },
};

export function isOpeningDataSetId(value: string): value is OpeningDataSetId {
  return Object.prototype.hasOwnProperty.call(OPENING_DATA_SETS, value);
}

/**
 * The declared field list for one data set: app-owned columns followed by the
 * owner-added columns, validated and flagged with their origin.
 */
export function openingFieldList(
  dataSet: OpeningDataSetId,
  ownerColumns: readonly OpeningField[] = OWNER_COLUMNS[dataSet],
): readonly DeclaredOpeningField[] {
  const definition = OPENING_DATA_SETS[dataSet];
  if (!definition) throw new OpeningFieldListError(`Unknown opening data set "${dataSet}".`);

  const fields: DeclaredOpeningField[] = [
    ...definition.fields.map((field) => ({ ...field, owner: false })),
    ...ownerColumns.map((field) => ({ ...field, owner: true })),
  ];
  validateFieldList(fields);
  return fields;
}

/**
 * Guards the committed owner-columns configuration (and any runtime source added
 * later): a malformed field would otherwise fail deep inside the parser.
 */
function validateFieldList(fields: readonly DeclaredOpeningField[]): void {
  const names = new Set<string>();
  const labels = new Set<string>();
  for (const field of fields) {
    if (!field.name || !field.name.trim()) {
      throw new OpeningFieldListError('Every declared field needs a name.');
    }
    if (!field.label || !field.label.trim()) {
      throw new OpeningFieldListError(`Field "${field.name}" needs a column header.`);
    }
    if (!['text', 'number', 'date'].includes(field.type)) {
      throw new OpeningFieldListError(
        `Field "${field.name}" has an unknown type "${String(field.type)}".`,
      );
    }
    if (typeof field.required !== 'boolean') {
      throw new OpeningFieldListError(`Field "${field.name}" needs a required flag.`);
    }
    if (!field.description || !field.description.trim()) {
      throw new OpeningFieldListError(`Field "${field.name}" needs a description.`);
    }
    if (typeof field.example !== 'string' || !field.example.trim()) {
      throw new OpeningFieldListError(`Field "${field.name}" needs a non-empty example value.`);
    }
    if (names.has(field.name)) {
      throw new OpeningFieldListError(`Duplicate field name "${field.name}".`);
    }
    const labelKey = field.label.trim().toLowerCase();
    if (labels.has(labelKey)) {
      throw new OpeningFieldListError(`Duplicate column header "${field.label}".`);
    }
    names.add(field.name);
    labels.add(labelKey);
  }
}

/** The documented reason convention for opening-balance edits and import audit entries. */
export function openingReasonConvention(closingFiscalYear: number): string {
  if (!Number.isInteger(closingFiscalYear) || closingFiscalYear < 2000 || closingFiscalYear > 2100) {
    throw new OpeningFieldListError(
      `Closing fiscal year must be a four-digit year between 2000 and 2100 (got ${closingFiscalYear}).`,
    );
  }
  return `Opening balance — FY${closingFiscalYear} close / <reference>`;
}

/** The stored reason for one import record: the documented convention with the reference filled in. */
export function openingLoadReason(closingFiscalYear: number, reference: string): string {
  return openingReasonConvention(closingFiscalYear).replace('<reference>', reference.trim());
}
