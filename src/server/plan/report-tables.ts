import type { ExportColumn, ExportDocument, ExportTable } from '@/lib/report-export';
import type { ReportCustomFieldGroup } from './report-custom-fields';
import {
  getAnnualPlanReport,
  getBudgetVsActualReport,
  getProjectRegisterReport,
  getSiFiveYearReport,
} from './report-queries';

/** Builds the export document for a report key; shared by CSV and XLSX downloads. */

export type ReportKey = 'si-five-year' | 'annual-plan' | 'project-register' | 'budget-vs-actual';

export const REPORT_TITLES: Record<ReportKey, string> = {
  'si-five-year': 'SI five-year view',
  'annual-plan': 'Annual plan by SI and program',
  'project-register': 'Project register',
  'budget-vs-actual': 'Budget versus actual',
};

const EXECUTION_NOTE =
  'Commitments and actual spend come from the execution module. Prior-year settlements are spend paying earlier-year commitments (excluded from the current year); prior-year opening payments settle pre-app commitments.';

function table(name: string, columns: ExportColumn[]): ExportTable {
  return { name, columns, rows: [] };
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

export async function buildReportDocument(
  report: ReportKey,
  planId: string,
  planName: string,
  groups: readonly ReportCustomFieldGroup[] = [],
): Promise<ExportDocument> {
  const generatedAt = new Date();
  const note = EXECUTION_NOTE;

  if (report === 'si-five-year') {
    const data = await getSiFiveYearReport(planId);
    const main = table('SI five-year view', [
      { key: 'code', header: 'SI code' },
      { key: 'name', header: 'Strategic initiative' },
      { key: 'owner', header: 'Owner' },
      { key: 'envelope', header: 'Envelope', kind: 'money' },
      { key: 'prior', header: 'Prior consumed', kind: 'money' },
      { key: 'programCapex', header: 'Program capex', kind: 'money' },
      { key: 'programOpex', header: 'Program opex', kind: 'money' },
      { key: 'allocationCapex', header: 'Allocated capex', kind: 'money' },
      { key: 'allocationOpex', header: 'Allocated opex', kind: 'money' },
      { key: 'commitmentCapex', header: 'Committed capex', kind: 'money' },
      { key: 'commitmentOpex', header: 'Committed opex', kind: 'money' },
      { key: 'spendCapex', header: 'Spent capex', kind: 'money' },
      { key: 'spendOpex', header: 'Spent opex', kind: 'money' },
      { key: 'consumed', header: 'Consumed (prior + programs)', kind: 'money' },
      { key: 'headroom', header: 'Headroom', kind: 'money' },
      { key: 'status', header: 'Status' },
    ]);
    main.rows = data.rows.map((row) => ({
      id: row.initiative.id,
      code: row.initiative.code,
      name: row.initiative.name,
      owner: row.initiative.owner,
      envelope: row.initiative.envelopeAmount,
      prior: row.initiative.priorProgramBudgetUsed,
      programCapex: row.programCapex,
      programOpex: row.programOpex,
      allocationCapex: row.allocationCapex,
      allocationOpex: row.allocationOpex,
      commitmentCapex: row.commitmentCapex,
      commitmentOpex: row.commitmentOpex,
      spendCapex: row.spendCapex,
      spendOpex: row.spendOpex,
      consumed: row.consumed,
      headroom: row.headroom,
      status: row.over ? 'over envelope' : 'within envelope',
    }));
    const total = table('Totals', [
      { key: 'label', header: 'Total' },
      { key: 'envelope', header: 'Envelope', kind: 'money' },
      { key: 'prior', header: 'Prior consumed', kind: 'money' },
      { key: 'programs', header: 'Program budgets', kind: 'money' },
      { key: 'allocated', header: 'Allocated', kind: 'money' },
      { key: 'consumed', header: 'Consumed', kind: 'money' },
      { key: 'headroom', header: 'Headroom', kind: 'money' },
      { key: 'status', header: 'Status' },
    ]);
    total.rows = [
      {
        label: 'Portfolio',
        envelope: data.totals.envelope,
        prior: data.totals.priorConsumed,
        programs: data.totals.programCapex + data.totals.programOpex,
        allocated: data.totals.allocationCapex + data.totals.allocationOpex,
        consumed: data.totals.consumed,
        headroom: data.totals.headroom,
        status: data.totals.over ? 'over envelope' : 'within envelope',
      },
    ];
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note,
      tables: applyCustomFieldGroups([main, total], groups),
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
      { key: 'capexBudget', header: 'Capex budget', kind: 'money' },
      { key: 'opexBudget', header: 'Opex budget', kind: 'money' },
      { key: 'carryInCapex', header: 'Capex carry-in', kind: 'money' },
      { key: 'carryInOpex', header: 'Opex carry-in', kind: 'money' },
      { key: 'availableCapex', header: 'Capex available', kind: 'money' },
      { key: 'availableOpex', header: 'Opex available', kind: 'money' },
      { key: 'allocatedCapex', header: 'Capex allocated', kind: 'money' },
      { key: 'allocatedOpex', header: 'Opex allocated', kind: 'money' },
      { key: 'unallocatedCapex', header: 'Capex unallocated', kind: 'money' },
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
      opexBudget: row.opexBudget,
      carryInCapex: row.carryInCapex,
      carryInOpex: row.carryInOpex,
      availableCapex: row.availableCapex,
      availableOpex: row.availableOpex,
      allocatedCapex: row.allocatedCapex,
      allocatedOpex: row.allocatedOpex,
      unallocatedCapex: row.unallocatedCapex,
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
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note,
      tables: applyCustomFieldGroups([programs, recurring], groups),
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
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note,
      tables: applyCustomFieldGroups([register, total], groups),
    };
  }

  const data = await getBudgetVsActualReport(planId);
  const main = table('Budget versus actual', [
    { key: 'fiscalYear', header: 'Fiscal year', kind: 'number' },
    { key: 'siCode', header: 'SI' },
    { key: 'program', header: 'Program' },
    { key: 'capexAvailable', header: 'Capex budget available', kind: 'money' },
    { key: 'opexAvailable', header: 'Opex budget available', kind: 'money' },
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
    opexAvailable: row.opexAvailable,
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
  return {
    title: REPORT_TITLES[report],
    subtitle: planName,
    generatedAt,
    note,
    tables: applyCustomFieldGroups([main], groups),
  };
}
