import { CORRECTED_AFTER_CLOSE_LABEL, CORRECTION_FOOTNOTE } from '@/domain/corrections';
import type { ExportColumn, ExportDocument, ExportTable } from '@/lib/report-export';
import type { ReportCustomFieldGroup } from './report-custom-fields';
import {
  getAnnualPlanReport,
  getBudgetVsActualReport,
  getProjectRegisterReport,
  getSiFiveYearReport,
  type BudgetVsActualRow,
  type SiFiveYearComponent,
  type SiFiveYearReport,
} from './report-queries';

/** Builds the export document for a report key; shared by CSV and XLSX downloads. */

export type ReportKey = 'si-five-year' | 'annual-plan' | 'project-register' | 'budget-vs-actual';

export const REPORT_TITLES: Record<ReportKey, string> = {
  'si-five-year': 'SI five-year view',
  'annual-plan': 'Annual plan by SI and program',
  'project-register': 'Project register',
  'budget-vs-actual': 'Budget versus actual',
};

export const EXECUTION_NOTE =
  'Program budgets and project year allocations are effective: the initial figure plus every posted revision delta (a de-allocation is a revision line). Carry-in is a separate input. Commitments and actual spend come from the execution module. Prior-year settlements are spend paying earlier-year commitments (excluded from the current year); prior-year opening payments settle pre-app commitments. Post-close adjustments are closed-year settlements kept as a reserve; they never enter the locked close snapshot or the carry-over figures.';

/**
 * The fixed footnote a report carries when one of its rows is marked corrected
 * after close (ADR-0007 §8, issue #108). Re-exported from the domain so the
 * screen and the export cannot disagree about the sentence.
 */
export const REPORT_CORRECTION_NOTE = CORRECTION_FOOTNOTE;

/** The export column key of the corrected-after-close marker. */
const CORRECTION_COLUMN_KEY = 'corrected';

function table(name: string, columns: ExportColumn[]): ExportTable {
  return { name, columns, rows: [] };
}

/**
 * The record ids of the rows a report flagged as corrected after close, so a
 * table can be marked by the same record id it already carries.
 */
function correctedRowIds<T extends { corrected: boolean }>(
  rows: readonly T[],
  id: (row: T) => string,
): ReadonlySet<string> {
  return new Set(rows.filter((row) => row.corrected).map(id));
}

/**
 * Adds the corrected-after-close marker column to one export table (ADR-0007
 * §8, issue #108).
 *
 * The column appears **only** when at least one row of that table is marked: a
 * marked row carries `yes`, every other row carries an empty cell, and the
 * table's name, its existing columns and every figure and row id are copied
 * unchanged. A marker is a label, never money. A table with no marked row is
 * returned as-is, so an uncorrected report exports exactly as it did before.
 *
 * Totals tables are never passed here: a total has no single record to mark,
 * and a marker may not change it.
 */
export function applyCorrectionMarkers(
  exportTable: ExportTable,
  markedIds: ReadonlySet<string>,
): ExportTable {
  const isMarked = (row: ExportTable['rows'][number]): boolean => {
    const id = row.id;
    return id !== null && id !== undefined && markedIds.has(String(id));
  };
  if (!exportTable.rows.some(isMarked)) return exportTable;

  return {
    ...exportTable,
    columns: [
      ...exportTable.columns,
      { key: CORRECTION_COLUMN_KEY, header: CORRECTED_AFTER_CLOSE_LABEL },
    ],
    rows: exportTable.rows.map((row) => ({
      ...row,
      [CORRECTION_COLUMN_KEY]: isMarked(row) ? 'yes' : '',
    })),
  };
}

/**
 * The note a report document carries: the standing execution note, plus the
 * correction footnote only when one of the document's tables actually carries
 * the marker column — the note never claims a correction the report does not
 * show.
 */
export function documentNote(tables: readonly ExportTable[]): string {
  const marked = tables.some((candidate) =>
    candidate.columns.some((column) => column.key === CORRECTION_COLUMN_KEY),
  );
  return marked ? `${EXECUTION_NOTE} ${REPORT_CORRECTION_NOTE}` : EXECUTION_NOTE;
}

/** Export column key for a custom field, namespaced so it cannot clash with a report column. */
function customColumnKey(fieldId: string): string {
  return `custom:${fieldId}`;
}

/**
 * Appends one group's selected custom-field columns to a report table (issue #46).
 *
 * A row is matched to its record id (`row.id`); a record without a value
 * stays blank. Existing columns and rows are copied, never replaced, so
 * the money columns and the totals tables are unaffected.
 */
export function applyCustomFieldGroup(
  table: ExportTable,
  group: ReportCustomFieldGroup,
): ExportTable {
  if (group.selectedFields.length === 0) return table;

  const columns: ExportColumn[] = [
    ...table.columns,
    ...group.selectedFields.map(
      (field): ExportColumn => ({
        key: customColumnKey(field.id),
        header: field.name,
        kind: field.type === 'number' ? 'number' : 'text',
      }),
    ),
  ];

  const rows = table.rows.map((row) => {
    const values = group.values.get(String(row.id));
    const extra: Record<string, string | number | null> = {};
    for (const field of group.selectedFields) {
      extra[customColumnKey(field.id)] = values?.[field.id] ?? null;
    }
    return { ...row, ...extra };
  });

  return { ...table, columns, rows };
}

/** Applies every group to the table it names; a report table with no group is returned as-is. */
function applyCustomFieldGroups(
  tables: ExportTable[],
  groups: readonly ReportCustomFieldGroup[],
): ExportTable[] {
  if (groups.length === 0) return tables;
  return tables.map((base) => {
    let result = base;
    for (const group of groups) {
      if (group.tableName === result.name) result = applyCustomFieldGroup(result, group);
    }
    return result;
  });
}

/**
 * The closed year's post-close adjustment figures (#98). A reserve-treated
 * closed-year settlement never enters the locked close snapshot or the
 * carry-over figures; it is shown here, on its commitment's fiscal year, as a
 * separately labelled line beside the existing columns.
 */
export function postCloseAdjustmentTable(rows: readonly BudgetVsActualRow[]): ExportTable {
  const postClose = table('Post-close adjustments', [
    { key: 'fiscalYear', header: 'Commitment fiscal year', kind: 'number' },
    { key: 'si', header: 'SI' },
    { key: 'program', header: 'Program' },
    { key: 'programName', header: 'Program name' },
    { key: 'capexReserve', header: 'Capex reserve', kind: 'money' },
    { key: 'opexReserve', header: 'Opex reserve', kind: 'money' },
    { key: 'totalReserve', header: 'Total reserve', kind: 'money' },
  ]);
  postClose.rows = rows
    .filter((row) => row.postCloseReserveCapex + row.postCloseReserveOpex > 0)
    .map((row) => ({
      id: row.programId,
      fiscalYear: row.fiscalYear,
      si: `${row.siCode} · ${row.siName}`,
      program: row.programCode,
      programName: row.programName,
      capexReserve: row.postCloseReserveCapex,
      opexReserve: row.postCloseReserveOpex,
      totalReserve: row.postCloseReserveCapex + row.postCloseReserveOpex,
    }));
  return postClose;
}

/**
 * The SI five-year view and its totals, as one table with the capex and opex
 * figures side by side (ADR-0006 §5). Envelope, prior consumption, effective
 * program budget, consumption and headroom are all per component, so a capex
 * overrun can never be netted against opex headroom. Shared by the screen and
 * the CSV/XLSX export.
 */
export function siFiveYearExportTables(data: SiFiveYearReport): ExportTable[] {
  const main = table('SI five-year view', [
    { key: 'code', header: 'SI code' },
    { key: 'name', header: 'Strategic initiative' },
    { key: 'owner', header: 'Owner' },
    ...siComponentColumns('Capex'),
    ...siComponentColumns('Opex'),
  ]);
  main.rows = data.rows.map((row) => ({
    id: row.initiative.id,
    code: row.initiative.code,
    name: row.initiative.name,
    owner: row.initiative.owner,
    ...siComponentCells('capex', row.capex),
    ...siComponentCells('opex', row.opex),
  }));
  // A corrected initiative row is marked; the portfolio total below is not and
  // never gains the column, because a marker may not move a total.
  const marked = applyCorrectionMarkers(
    main,
    correctedRowIds(data.rows, (row) => row.initiative.id),
  );

  const total = table('Totals', [
    { key: 'label', header: 'Total' },
    ...siComponentColumns('Capex'),
    ...siComponentColumns('Opex'),
  ]);
  total.rows = [
    {
      label: 'Portfolio',
      ...siComponentCells('capex', data.totals.capex),
      ...siComponentCells('opex', data.totals.opex),
    },
  ];

  return [marked, total];
}

function siComponentColumns(component: 'Capex' | 'Opex'): ExportColumn[] {
  const key = component.toLowerCase();
  return [
    { key: `${key}Envelope`, header: `${component} envelope`, kind: 'money' },
    { key: `${key}Prior`, header: `${component} prior consumed`, kind: 'money' },
    { key: `${key}ProgramBudget`, header: `${component} program budgets`, kind: 'money' },
    { key: `${key}Allocated`, header: `${component} allocated`, kind: 'money' },
    { key: `${key}Committed`, header: `${component} committed`, kind: 'money' },
    { key: `${key}Spent`, header: `${component} spent`, kind: 'money' },
    { key: `${key}Consumed`, header: `${component} consumed`, kind: 'money' },
    { key: `${key}Headroom`, header: `${component} headroom`, kind: 'money' },
    { key: `${key}Status`, header: `${component} status` },
  ];
}

function siComponentCells(
  component: 'capex' | 'opex',
  row: SiFiveYearComponent,
): Record<string, string | number> {
  const label = component === 'capex' ? 'capex' : 'opex';
  return {
    [`${component}Envelope`]: row.envelope,
    [`${component}Prior`]: row.priorConsumed,
    [`${component}ProgramBudget`]: row.programBudget,
    [`${component}Allocated`]: row.allocation,
    [`${component}Committed`]: row.commitment,
    [`${component}Spent`]: row.spend,
    [`${component}Consumed`]: row.consumed,
    [`${component}Headroom`]: row.headroom,
    [`${component}Status`]: row.over ? `over ${label} envelope` : `within ${label} envelope`,
  };
}

export async function buildReportDocument(
  report: ReportKey,
  planId: string,
  planName: string,
  groups: readonly ReportCustomFieldGroup[] = [],
): Promise<ExportDocument> {
  const generatedAt = new Date();

  if (report === 'si-five-year') {
    const data = await getSiFiveYearReport(planId);
    const tables = applyCustomFieldGroups(siFiveYearExportTables(data), groups);
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note: documentNote(tables),
      tables,
    };
  }

  if (report === 'annual-plan') {
    const data = await getAnnualPlanReport(planId);
    const programs = table('Annual programs', [
      { key: 'fiscalYear', header: 'Fiscal year', kind: 'number' },
      { key: 'planStatus', header: 'Plan status' },
      { key: 'siCode', header: 'SI' },
      { key: 'programCode', header: 'Program' },
      { key: 'programName', header: 'Program name' },
      { key: 'capexBudget', header: 'Capex initial budget', kind: 'money' },
      { key: 'revisionCapex', header: 'Capex revisions', kind: 'money' },
      { key: 'effectiveCapexBudget', header: 'Capex effective budget', kind: 'money' },
      { key: 'carryInCapex', header: 'Capex carry-in', kind: 'money' },
      { key: 'availableCapex', header: 'Capex available', kind: 'money' },
      { key: 'allocatedCapex', header: 'Capex allocated', kind: 'money' },
      { key: 'unallocatedCapex', header: 'Capex unallocated', kind: 'money' },
      { key: 'opexBudget', header: 'Opex initial budget', kind: 'money' },
      { key: 'revisionOpex', header: 'Opex revisions', kind: 'money' },
      { key: 'effectiveOpexBudget', header: 'Opex effective budget', kind: 'money' },
      { key: 'carryInOpex', header: 'Opex carry-in', kind: 'money' },
      { key: 'availableOpex', header: 'Opex available', kind: 'money' },
      { key: 'allocatedOpex', header: 'Opex allocated', kind: 'money' },
      { key: 'unallocatedOpex', header: 'Opex unallocated', kind: 'money' },
      { key: 'commitmentCapex', header: 'Capex committed', kind: 'money' },
      { key: 'commitmentOpex', header: 'Opex committed', kind: 'money' },
      { key: 'spendCapex', header: 'Capex spent', kind: 'money' },
      { key: 'spendOpex', header: 'Opex spent', kind: 'money' },
      { key: 'status', header: 'Status' },
    ]);
    programs.rows = data.programs.map((row) => ({
      id: row.programId,
      fiscalYear: row.fiscalYear,
      planStatus: row.planStatus,
      siCode: row.siCode,
      programCode: row.programCode,
      programName: row.programName,
      capexBudget: row.capexBudget,
      revisionCapex: row.revisionCapex,
      effectiveCapexBudget: row.effectiveCapexBudget,
      carryInCapex: row.carryInCapex,
      availableCapex: row.availableCapex,
      allocatedCapex: row.allocatedCapex,
      unallocatedCapex: row.unallocatedCapex,
      opexBudget: row.opexBudget,
      revisionOpex: row.revisionOpex,
      effectiveOpexBudget: row.effectiveOpexBudget,
      carryInOpex: row.carryInOpex,
      availableOpex: row.availableOpex,
      allocatedOpex: row.allocatedOpex,
      unallocatedOpex: row.unallocatedOpex,
      commitmentCapex: row.commitmentCapex,
      commitmentOpex: row.commitmentOpex,
      spendCapex: row.spendCapex,
      spendOpex: row.spendOpex,
      status: row.overCapex || row.overOpex ? 'over-allocated' : 'within budget',
    }));
    const recurring = table('Recurring operations', [
      { key: 'fiscalYear', header: 'Fiscal year', kind: 'number' },
      { key: 'name', header: 'Item' },
      { key: 'category', header: 'Category' },
      { key: 'opexBudget', header: 'Opex budget', kind: 'money' },
      { key: 'carryInOpex', header: 'Opex carry-in', kind: 'money' },
      { key: 'available', header: 'Available', kind: 'money' },
      { key: 'commitmentOpex', header: 'Committed', kind: 'money' },
      { key: 'spendOpex', header: 'Spent', kind: 'money' },
      { key: 'priorOpeningOpex', header: 'Prior-year openings', kind: 'money' },
      { key: 'remainingOpex', header: 'Remaining', kind: 'money' },
    ]);
    recurring.rows = data.recurringOps.map((row) => ({
      id: row.itemId,
      fiscalYear: row.fiscalYear,
      name: row.name,
      category: row.categoryName,
      opexBudget: row.opexBudget,
      carryInOpex: row.carryInOpex,
      available: row.available,
      commitmentOpex: row.commitmentOpex,
      spendOpex: row.spendOpex,
      priorOpeningOpex: row.priorOpeningOpex,
      remainingOpex: row.remainingOpex,
    }));
    // Each row table is marked only when one of its own rows is corrected; the
    // export keeps a single footnote for the document as a whole.
    const tables = applyCustomFieldGroups(
      [
        applyCorrectionMarkers(
          programs,
          correctedRowIds(data.programs, (row) => row.programId),
        ),
        applyCorrectionMarkers(
          recurring,
          correctedRowIds(data.recurringOps, (row) => row.itemId),
        ),
      ],
      groups,
    );
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note: documentNote(tables),
      tables,
    };
  }

  if (report === 'project-register') {
    const data = await getProjectRegisterReport(planId);
    const register = table('Project register', [
      { key: 'code', header: 'Project code' },
      { key: 'name', header: 'Project name' },
      { key: 'status', header: 'Status' },
      { key: 'si', header: 'SI' },
      { key: 'program', header: 'Program' },
      { key: 'startFy', header: 'Start FY', kind: 'number' },
      { key: 'endFy', header: 'End FY', kind: 'number' },
      { key: 'fullLifeAllocated', header: 'Full-life allocated', kind: 'money' },
      { key: 'approved', header: 'Approved (ijin prinsip)', kind: 'money' },
      { key: 'submitted', header: 'Submitted price', kind: 'money' },
      { key: 'finalDeal', header: 'Final deal price', kind: 'money' },
      { key: 'allocatedCapex', header: 'Allocated capex', kind: 'money' },
      { key: 'allocatedOpex', header: 'Allocated opex', kind: 'money' },
      { key: 'carryInCapex', header: 'Capex carry-in', kind: 'money' },
      { key: 'carryInOpex', header: 'Opex carry-in', kind: 'money' },
      { key: 'totalAllocated', header: 'Total allocated', kind: 'money' },
      { key: 'lifetimeCommitted', header: 'Lifetime commitments', kind: 'money' },
      { key: 'spentToDate', header: 'Spent to date', kind: 'money' },
      { key: 'openCommitments', header: 'Open commitments', kind: 'money' },
      { key: 'priorOpening', header: 'Prior-year opening settlements', kind: 'money' },
      { key: 'flags', header: 'Flags' },
    ]);
    register.rows = data.rows.map((row) => ({
      id: row.project.id,
      code: row.project.code,
      name: row.project.name,
      status: row.project.status,
      si: `${row.siCode} · ${row.siName}`,
      program: row.programCode,
      startFy: row.project.startFiscalYear,
      endFy: row.project.endFiscalYear,
      fullLifeAllocated: row.project.allocatedBudgetFullLife,
      approved: row.approvedAmount,
      submitted: row.submittedPrice,
      finalDeal: row.finalDealPrice,
      allocatedCapex: row.allocationCapex,
      allocatedOpex: row.allocationOpex,
      carryInCapex: row.carryInCapex,
      carryInOpex: row.carryInOpex,
      totalAllocated: row.totalAllocated,
      lifetimeCommitted: row.lifetimeCommitments,
      spentToDate: row.spentToDate,
      openCommitments: row.openCommitments,
      priorOpening: row.priorOpeningSettlements,
      flags: row.flags.map((flag) => flag.message).join(' | '),
    }));
    const total = table('Totals', [
      { key: 'label', header: 'Total' },
      { key: 'fullLifeAllocated', header: 'Full-life allocated', kind: 'money' },
      { key: 'approved', header: 'Approved', kind: 'money' },
      { key: 'finalDeal', header: 'Final deal price', kind: 'money' },
      { key: 'allocated', header: 'Total allocated', kind: 'money' },
      { key: 'lifetimeCommitted', header: 'Lifetime commitments', kind: 'money' },
      { key: 'spentToDate', header: 'Spent to date', kind: 'money' },
      { key: 'openCommitments', header: 'Open commitments', kind: 'money' },
      { key: 'priorOpening', header: 'Prior-year opening settlements', kind: 'money' },
    ]);
    total.rows = [
      {
        label: 'All projects',
        fullLifeAllocated: data.totals.fullLifeAllocated,
        approved: data.totals.approved,
        finalDeal: data.totals.finalDeal,
        allocated: data.totals.allocated,
        lifetimeCommitted: data.totals.lifetimeCommitments,
        spentToDate: data.totals.spentToDate,
        openCommitments: data.totals.openCommitments,
        priorOpening: data.totals.priorOpeningSettlements,
      },
    ];
    // The register is marked; the totals table below is not, so a marker can
    // never move the portfolio's figures.
    const tables = applyCustomFieldGroups(
      [
        applyCorrectionMarkers(register, correctedRowIds(data.rows, (row) => row.project.id)),
        total,
      ],
      groups,
    );
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note: documentNote(tables),
      tables,
    };
  }

  const data = await getBudgetVsActualReport(planId);
  const main = table('Budget versus actual', [
    { key: 'fiscalYear', header: 'Fiscal year', kind: 'number' },
    { key: 'siCode', header: 'SI' },
    { key: 'program', header: 'Program' },
    { key: 'capexAvailable', header: 'Capex budget available', kind: 'money' },
    { key: 'carryInCapex', header: 'Capex carry-in (included above)', kind: 'money' },
    { key: 'opexAvailable', header: 'Opex budget available', kind: 'money' },
    { key: 'carryInOpex', header: 'Opex carry-in (included above)', kind: 'money' },
    { key: 'allocatedCapex', header: 'Capex allocated', kind: 'money' },
    { key: 'allocatedOpex', header: 'Opex allocated', kind: 'money' },
    { key: 'commitmentCapex', header: 'Capex committed', kind: 'money' },
    { key: 'commitmentOpex', header: 'Opex committed', kind: 'money' },
    { key: 'spendCapex', header: 'Capex spent', kind: 'money' },
    { key: 'spendOpex', header: 'Opex spent', kind: 'money' },
    { key: 'settlementCapex', header: 'Capex prior-year settlements', kind: 'money' },
    { key: 'settlementOpex', header: 'Opex prior-year settlements', kind: 'money' },
    { key: 'priorOpeningCapex', header: 'Capex prior-year openings', kind: 'money' },
    { key: 'priorOpeningOpex', header: 'Opex prior-year openings', kind: 'money' },
    { key: 'unallocatedCapex', header: 'Capex unallocated', kind: 'money' },
    { key: 'unallocatedOpex', header: 'Opex unallocated', kind: 'money' },
    { key: 'status', header: 'Status' },
  ]);
  main.rows = data.rows.map((row) => ({
    id: row.programId,
    fiscalYear: row.fiscalYear,
    siCode: row.siCode,
    program: `${row.programCode} · ${row.programName}`,
    capexAvailable: row.capexAvailable,
    carryInCapex: row.carryInCapex,
    opexAvailable: row.opexAvailable,
    carryInOpex: row.carryInOpex,
    allocatedCapex: row.allocatedCapex,
    allocatedOpex: row.allocatedOpex,
    commitmentCapex: row.commitmentCapex,
    commitmentOpex: row.commitmentOpex,
    spendCapex: row.spendCapex,
    spendOpex: row.spendOpex,
    settlementCapex: row.settlementCapex,
    settlementOpex: row.settlementOpex,
    priorOpeningCapex: row.priorOpeningCapex,
    priorOpeningOpex: row.priorOpeningOpex,
    unallocatedCapex: row.unallocatedCapex,
    unallocatedOpex: row.unallocatedOpex,
    status: row.overCapex || row.overOpex ? 'over-allocated' : 'within budget',
  }));
  // The closed year's adjustment is a separate labelled table so no existing
  // column or export changes shape (#98); it is derived from the same rows, so
  // a corrected program's marker stays on the main table only.
  const tables = [
    ...applyCustomFieldGroups(
      [applyCorrectionMarkers(main, correctedRowIds(data.rows, (row) => row.programId))],
      groups,
    ),
    postCloseAdjustmentTable(data.rows),
  ];
  return {
    title: REPORT_TITLES[report],
    subtitle: planName,
    generatedAt,
    note: documentNote(tables),
    tables,
  };
}
