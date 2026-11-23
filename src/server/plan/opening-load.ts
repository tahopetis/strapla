import type {
  NewAnnualProgram,
  NewIjinPrinsipRecord,
  NewProject,
  NewStrategicInitiative,
} from '@/db/schema';
import {
  parseCustomFieldValues,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from '@/domain/custom-fields';
import { formatEntityCode } from '@/domain/plan';
import type { ParseError, ParsedRow } from '@/lib/opening-import/parse';

/**
 * Pure planning for the opening-balance load (W3b/W9). It turns validated parser
 * rows into insert values, resolving codes against the existing plan and
 * rejecting duplicates/unknown references with row-level errors. When the load
 * runs from the server the caller also passes the active custom-field registry:
 * the owner-column values are validated against it (a required field missing
 * from a row is a line-level error) and attached to the planned record, keyed by
 * field id, so the transaction can store them beside the new record. The caller
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

/** One record the load will create, with its registry values keyed by field id. */
export interface PlannedOpeningRecord<T> {
  values: T;
  customFieldValues: CustomFieldValues;
}

/**
 * One registry-backed import column. `column` is the parser's row key (the
 * registry key, disambiguated only when it would collide with an app-owned
 * field); `definition` is the registry entry whose id keys the stored value.
 * The pair is built in one place, so the key used to read a row and the id used
 * to store it can never drift apart.
 */
export interface OpeningCustomField {
  /** Key of the column in the parsed row (the registry key, disambiguated only on collision). */
  column: string;
  /** Header the file actually shows, used when naming the failing column. */
  label: string;
  /** The registry definition; its id keys the stored value. */
  definition: CustomFieldDefinition;
}

export interface StrategicInitiativesLoad {
  dataSet: 'strategic-initiatives';
  initiatives: PlannedOpeningRecord<NewStrategicInitiative>[];
}

export interface AnnualProgramsLoad {
  dataSet: 'annual-programs';
  programs: PlannedOpeningRecord<NewAnnualProgram>[];
}

export interface PlannedIjin {
  line: number;
  projectCode: string;
  ijin: Omit<NewIjinPrinsipRecord, 'projectId'>;
}

export interface ProjectsLoad {
  dataSet: 'projects';
  projects: PlannedOpeningRecord<NewProject>[];
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

/**
 * Validates one row's custom-field values against the registry and returns them
 * keyed by field id. The parser keys a registry column by the same (stable)
 * registry key, so the lookup never depends on a display name an administrator
 * can change. The parser has already type-checked the declared columns against
 * the import's rules; this pass applies the registry's own rules (a required
 * value must be present, text must fit the form's limit) so an imported record
 * can always be saved from its form later. A failure is attributed to the row's
 * line, and the row must not load.
 */
function planCustomFields(
  fields: readonly OpeningCustomField[],
  row: ParsedRow,
  errors: ParseError[],
): CustomFieldValues | null {
  if (fields.length === 0) return {};

  const raw: Record<string, string> = {};
  for (const field of fields) {
    const value = row.values[field.column];
    raw[field.definition.id] = value === null || value === undefined ? '' : String(value);
  }

  const parsed = parseCustomFieldValues(
    fields.map((field) => field.definition),
    raw,
  );
  if (parsed.ok) return parsed.values;

  for (const error of parsed.errors) {
    const field = fields.find((candidate) => candidate.definition.id === error.fieldId);
    pushError(errors, row, field?.label ?? 'Custom field', error.message);
  }
  return null;
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
  customFields: readonly OpeningCustomField[] = [],
): { plan: StrategicInitiativesLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const seen = new Set(context.existingInitiativeCodes);
  const initiatives: PlannedOpeningRecord<NewStrategicInitiative>[] = [];

  for (const row of rows) {
    const code = text(row, 'code');
    const name = text(row, 'name');
    let valid = validCode(code, 20, row, 'Code', errors);
    if (code !== null && valid && seen.has(code)) {
      pushError(errors, row, 'Code', `Initiative code ${code} already exists in this plan.`);
      valid = false;
    }
    if (!validName(name, row, errors)) valid = false;
    const custom = planCustomFields(customFields, row, errors);
    if (!valid || !code || !name || custom === null) continue;

    seen.add(code);
    initiatives.push({
      values: {
        planId: context.planId,
        code,
        name,
        owner: text(row, 'owner'),
        objective: text(row, 'objective'),
        envelopeCapex: number(row, 'envelopeCapex') ?? 0,
        envelopeOpex: number(row, 'envelopeOpex') ?? 0,
        priorProgramBudgetUsedCapex: number(row, 'priorCapex') ?? 0,
        priorProgramBudgetUsedOpex: number(row, 'priorOpex') ?? 0,
        notes: text(row, 'notes'),
      },
      customFieldValues: custom,
    });
  }

  return { plan: { dataSet: 'strategic-initiatives', initiatives }, errors };
}

export function planProgramsLoad(
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
  customFields: readonly OpeningCustomField[] = [],
): { plan: AnnualProgramsLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const seen = new Set(context.existingProgramCodes);
  const programs: PlannedOpeningRecord<NewAnnualProgram>[] = [];

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
    const custom = planCustomFields(customFields, row, errors);
    if (!valid || !code || !name || !siId || custom === null) continue;

    seen.add(code);
    const prevCode = text(row, 'prevProgramCode');
    programs.push({
      values: {
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
      },
      customFieldValues: custom,
    });
  }

  return { plan: { dataSet: 'annual-programs', programs }, errors };
}

export function planProjectsLoad(
  rows: readonly ParsedRow[],
  context: OpeningLoadContext,
  customFields: readonly OpeningCustomField[] = [],
): { plan: ProjectsLoad; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const usedCodes = new Set(context.existingProjectCodes);
  const nextSequence = new Map<number, number>();
  const projects: PlannedOpeningRecord<NewProject>[] = [];
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
    const custom = planCustomFields(customFields, row, errors);
    if (custom === null) valid = false;

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

    if (
      !valid ||
      !code ||
      startYear === null ||
      endYear === null ||
      !programId ||
      !name ||
      custom === null
    ) {
      continue;
    }

    projects.push({
      values: {
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
      },
      customFieldValues: custom,
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
  customFields: readonly OpeningCustomField[] = [],
): OpeningLoadPlanResult {
  if (dataSet === 'strategic-initiatives') {
    return planInitiativesLoad(rows, context, customFields);
  }
  if (dataSet === 'annual-programs') {
    return planProgramsLoad(rows, context, customFields);
  }
  return planProjectsLoad(rows, context, customFields);
}
