import type { ExportColumn, ExportDocument, ExportTable } from '@/lib/report-export';
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

const M3_NOTE =
  'Commitments and actual spend arrive with the execution milestone (M3). Figures here are budget, allocations and opening balances.';

function table(name: string, columns: ExportColumn[]): ExportTable {
  return { name, columns, rows: [] };
}

export async function buildReportDocument(
  report: ReportKey,
  planId: string,
  planName: string,
): Promise<ExportDocument> {
  const generatedAt = new Date();
  const note = M3_NOTE;

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
    return { title: REPORT_TITLES[report], subtitle: planName, generatedAt, note, tables: [main, total] };
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
    ]);
    recurring.rows = data.recurringOps.map((row) => ({
      fiscalYear: row.fiscalYear,
      name: row.name,
      category: row.categoryName,
      opexBudget: row.opexBudget,
      carryInOpex: row.carryInOpex,
      available: row.available,
    }));
    return {
      title: REPORT_TITLES[report],
      subtitle: planName,
      generatedAt,
      note,
      tables: [programs, recurring],
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
      { key: 'openingSpent', header: 'Spent to date (opening)', kind: 'money' },
      { key: 'flags', header: 'Flags' },
    ]);
    register.rows = data.rows.map((row) => ({
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
      lifetimeCommitted: row.project.openingCommitted,
      openingSpent: row.project.openingSpent,
      flags: row.flags.map((flag) => flag.message).join(' | '),
    }));
    const total = table('Totals', [
      { key: 'label', header: 'Total' },
      { key: 'fullLifeAllocated', header: 'Full-life allocated', kind: 'money' },
      { key: 'approved', header: 'Approved', kind: 'money' },
      { key: 'finalDeal', header: 'Final deal price', kind: 'money' },
      { key: 'allocated', header: 'Total allocated', kind: 'money' },
      { key: 'lifetimeCommitted', header: 'Lifetime commitments', kind: 'money' },
      { key: 'openingSpent', header: 'Spent to date (opening)', kind: 'money' },
    ]);
    total.rows = [
      {
        label: 'All projects',
        fullLifeAllocated: data.totals.fullLifeAllocated,
        approved: data.totals.approved,
        finalDeal: data.totals.finalDeal,
        allocated: data.totals.allocated,
        lifetimeCommitted: data.totals.lifetimeCommitments,
        openingSpent: data.totals.openingSpent,
      },
    ];
    return { title: REPORT_TITLES[report], subtitle: planName, generatedAt, note, tables: [register, total] };
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
    { key: 'unallocatedCapex', header: 'Capex unallocated', kind: 'money' },
    { key: 'unallocatedOpex', header: 'Opex unallocated', kind: 'money' },
    { key: 'status', header: 'Status' },
  ]);
  main.rows = data.rows.map((row) => ({
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
    unallocatedCapex: row.unallocatedCapex,
    unallocatedOpex: row.unallocatedOpex,
    status: row.overCapex || row.overOpex ? 'over-allocated' : 'within budget',
  }));
  return { title: REPORT_TITLES[report], subtitle: planName, generatedAt, note, tables: [main] };
}
