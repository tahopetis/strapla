import type {
  NewAnnualProgram,
  NewIjinPrinsipRecord,
  NewProject,
  NewStrategicInitiative,
} from '@/db/schema';
import { formatEntityCode } from '@/domain/plan';
import type { ParseError, ParsedRow } from '@/lib/opening-import/parse';

/**
 * Pure planning for the opening-balance load (W3b). It turns validated parser
 * rows into insert values, resolving codes against the existing plan and
 * rejecting duplicates/unknown references with row-level errors. The caller
 * writes only when `errors` is empty, so a failed validation can never write.
 */

export interface OpeningLoadContext {
  planId: string;
  annualPlanId: string;
  annualPlanFiscalYear: number;
  planStartFiscalYear: number;
  planEndFiscalYear: number;
  initiativeIdByCode: ReadonlyMap<string, string>;
  programIdByCode: ReadonlyMap<string, string>;
  existingInitiativeCodes: ReadonlySet<string>;
  existingProgramCodes: ReadonlySet<string>;
  existingProjectCodes: ReadonlySet<string>;
}

export interface StrategicInitiativesLoad {
  dataSet: 'strategic-initiatives';
  initiatives: NewStrategicInitiative[];
}

export interface AnnualProgramsLoad {
  dataSet: 'annual-programs';
  programs: NewAnnualProgram[];
}

export interface PlannedIjin {
  line: number;
  projectCode: string;
  ijin: Omit<NewIjinPrinsipRecord, 'projectId'>;
}

export interface ProjectsLoad {
  dataSet: 'projects';
  projects: NewProject[];
  ijins: PlannedIjin[];
}

export type OpeningLoadPlan = StrategicInitiativesLoad | AnnualProgramsLoad | ProjectsLoad;

export interface OpeningLoadPlanResult {
  plan?: OpeningLoadPlan;
  errors: ParseError[];
}

const CODE_PATTERN = /^[A-Za-z0-9-]+$/;

function text(row: ParsedRow, name: string): string | null {
  const value = row.values[name];
  return typeof value === 'string' ? value : null;
}

function number(row: ParsedRow, name: string): number | null {
  const value = row.values[name];
  return typeof value === 'number' ? value : null;
}

function pushError(
  errors: ParseError[],
  row: ParsedRow,
  column: string,
  message: string,
): void {
  errors.push({ line: row.line, column, message });
}

function validCode(
  code: string | null,
  maxLength: number,
  row: ParsedRow,
  column: string,
  errors: ParseError[],
): code is string {
  if (!code) {
    pushError(errors, row, column, `${column} is required.`);
    return false;
  }
  if (code.length > maxLength || !CODE_PATTERN.test(code)) {
    pushError(
      errors,
      row,
      column,
      `${column} may only contain letters, digits and hyphens (at most ${maxLength}).`,
    );
    return false;
  }
  return true;
}

function validName(name: string | null, row: ParsedRow, errors: ParseError[]): name is string {
  if (!name) {
    pushError(errors, row, 'Name', 'Name is required.');
    return false;
  }
  if (name.length > 160) {
    pushError(errors, row, 'Name', 'Name must be at most 160 characters.');
    return false;
  }
  return true;
}

export function planInitiativesLoad(
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
): { plan: StrategicInitiativesLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const seen = new Set(context.existingInitiativeCodes);
  const initiatives: NewStrategicInitiative[] = [];

  for (const row of rows) {
    const code = text(row, 'code');
    const name = text(row, 'name');
    let valid = validCode(code, 20, row, 'Code', errors);
    if (code !== null && valid && seen.has(code)) {
      pushError(errors, row, 'Code', `Initiative code ${code} already exists in this plan.`);
      valid = false;
    }
    if (!validName(name, row, errors)) valid = false;
    if (!valid || !code || !name) continue;

    seen.add(code);
    initiatives.push({
      planId: context.planId,
      code,
      name,
      owner: text(row, 'owner'),
      objective: text(row, 'objective'),
      envelopeAmount: number(row, 'envelopeAmount') ?? 0,
      priorProgramBudgetUsed: number(row, 'priorProgramBudgetUsed') ?? 0,
      notes: text(row, 'notes'),
    });
  }

  return { plan: { dataSet: 'strategic-initiatives', initiatives }, errors };
}

export function planProgramsLoad(
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
): { plan: AnnualProgramsLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const seen = new Set(context.existingProgramCodes);
  const programs: NewAnnualProgram[] = [];

  for (const row of rows) {
    const code = text(row, 'code');
    const name = text(row, 'name');
    const siCode = text(row, 'siCode');
    let valid = validCode(code, 40, row, 'Code', errors);
    if (code !== null && valid && seen.has(code)) {
      pushError(errors, row, 'Code', `Program code ${code} already exists in this plan.`);
      valid = false;
    }
    if (!validName(name, row, errors)) valid = false;

    const siId = siCode ? context.initiativeIdByCode.get(siCode) : undefined;
    if (!siCode) {
      pushError(errors, row, 'Strategic initiative code', 'Strategic initiative code is required.');
      valid = false;
    } else if (!siId) {
      pushError(
        errors,
        row,
        'Strategic initiative code',
        `Strategic initiative ${siCode} does not exist in this plan.`,
      );
      valid = false;
    }
    if (!valid || !code || !name || !siId) continue;

    seen.add(code);
    const prevCode = text(row, 'prevProgramCode');
    programs.push({
      annualPlanId: context.annualPlanId,
      siId,
      prevProgramId: prevCode ? (context.programIdByCode.get(prevCode) ?? null) : null,
      code,
      name,
      capexBudget: number(row, 'capexBudget') ?? 0,
      opexBudget: number(row, 'opexBudget') ?? 0,
      carryInCapex: number(row, 'carryInCapex') ?? 0,
      carryInOpex: number(row, 'carryInOpex') ?? 0,
      notes: text(row, 'notes'),
    });
  }

  return { plan: { dataSet: 'annual-programs', programs }, errors };
}

export function planProjectsLoad(
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
): { plan: ProjectsLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const usedCodes = new Set(context.existingProjectCodes);
  const nextSequence = new Map<number, number>();
  const projects: NewProject[] = [];
  const ijins: PlannedIjin[] = [];

  const nextCodeFor = (fiscalYear: number): string => {
    let sequence = nextSequence.get(fiscalYear) ?? 1;
    let code = formatEntityCode('project', fiscalYear, sequence);
    while (usedCodes.has(code)) {
      sequence += 1;
      code = formatEntityCode('project', fiscalYear, sequence);
    }
    nextSequence.set(fiscalYear, sequence + 1);
    usedCodes.add(code);
    return code;
  };

  for (const row of rows) {
    const name = text(row, 'name');
    const programCode = text(row, 'originatingProgramCode');
    const startYear = number(row, 'startFiscalYear');
    const endYear = number(row, 'endFiscalYear');
    let valid = validName(name, row, errors);

    const programId = programCode ? context.programIdByCode.get(programCode) : undefined;
    if (!programCode) {
      pushError(
        errors,
        row,
        'Originating program code',
        'Originating program code is required.',
      );
      valid = false;
    } else if (!programId) {
      pushError(
        errors,
        row,
        'Originating program code',
        `Annual program ${programCode} does not exist in this annual plan.`,
      );
      valid = false;
    }

    const yearsValid =
      startYear !== null &&
      endYear !== null &&
      startYear >= 2000 &&
      startYear <= 2100 &&
      endYear >= 2000 &&
      endYear <= 2100 &&
      startYear <= endYear &&
      endYear - startYear + 1 <= 10 &&
      startYear >= context.planStartFiscalYear &&
      endYear <= context.planEndFiscalYear &&
      startYear >= context.annualPlanFiscalYear &&
      context.annualPlanFiscalYear <= endYear;
    if (!yearsValid) {
      pushError(
        errors,
        row,
        'Start fiscal year',
        `Project years must start at FY${context.annualPlanFiscalYear} or later, end on or after FY${context.annualPlanFiscalYear}, stay inside FY${context.planStartFiscalYear}–FY${context.planEndFiscalYear}, and span at most 10 years.`,
      );
      valid = false;
    }

    const suppliedCode = text(row, 'code');
    let code: string | null = null;
    if (suppliedCode) {
      if (!validCode(suppliedCode, 40, row, 'Code', errors)) {
        valid = false;
      } else if (usedCodes.has(suppliedCode)) {
        pushError(errors, row, 'Code', `Project code ${suppliedCode} is already used.`);
        valid = false;
      } else {
        code = suppliedCode;
        usedCodes.add(code);
      }
    } else if (valid && startYear !== null) {
      code = nextCodeFor(startYear);
    }

    if (!valid || !code || startYear === null || endYear === null || !programId || !name) {
      continue;
    }

    projects.push({
      originatingProgramId: programId,
      code,
      externalReference: text(row, 'externalReference'),
      name,
      description: text(row, 'description'),
      owner: text(row, 'owner'),
      startFiscalYear: startYear,
      endFiscalYear: endYear,
      allocatedBudgetFullLife: number(row, 'allocatedBudgetFullLife') ?? 0,
      submittedPrice: number(row, 'submittedPrice'),
      finalDealPrice: number(row, 'finalDealPrice'),
      openingAllocated: number(row, 'openingAllocated') ?? 0,
      openingCommitted: number(row, 'openingCommitted') ?? 0,
      openingSpent: number(row, 'openingSpent') ?? 0,
    });

    const ijinFields = [
      'ijinPrinsipDocumentNumber',
      'ijinPrinsipDocumentDate',
      'ijinPrinsipApprovedAmount',
      'ijinPrinsipApprover',
      'ijinPrinsipDocumentUrl',
      'ijinPrinsipNotes',
    ] as const;
    const hasIjin = ijinFields.some((field) => row.values[field] !== null);
    if (hasIjin) {
      const approvedAmount = number(row, 'ijinPrinsipApprovedAmount');
      if (approvedAmount === null) {
        pushError(
          errors,
          row,
          'Ijin prinsip approved amount (Rp)',
          'Ijin prinsip approved amount is required when any ijin prinsip field is filled.',
        );
        projects.pop();
        continue;
      }
      ijins.push({
        line: row.line,
        projectCode: code,
        ijin: {
          documentNumber: text(row, 'ijinPrinsipDocumentNumber'),
          documentDate: text(row, 'ijinPrinsipDocumentDate'),
          approvedAmount,
          approver: text(row, 'ijinPrinsipApprover'),
          documentUrl: text(row, 'ijinPrinsipDocumentUrl'),
          notes: text(row, 'ijinPrinsipNotes'),
        },
      });
    }
  }

  return { plan: { dataSet: 'projects', projects, ijins }, errors };
}

export function planOpeningLoad(
  dataSet: 'strategic-initiatives' | 'annual-programs' | 'projects',
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
): OpeningLoadPlanResult {
  if (dataSet === 'strategic-initiatives') {
    return planInitiativesLoad(rows, context);
  }
  if (dataSet === 'annual-programs') {
    return planProgramsLoad(rows, context);
  }
  return planProjectsLoad(rows, context);
}
