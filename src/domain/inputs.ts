import { z } from 'zod';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  parseCustomFieldValue,
} from './custom-fields';
import { parseRupiah, type Rupiah } from './money';

/**
 * Zod schemas for form input (ADR-0001: Zod is shared by forms and the domain
 * boundary). Values arrive as strings from FormData and are validated and
 * transformed into typed input objects before reaching the server actions.
 */

const MAX_TEXT = 2000;

const requiredText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

const optionalText = (max = MAX_TEXT) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null));

const year = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}$/, `${label} must be a four-digit year.`)
    .transform((value) => Number(value))
    .refine(
      (value) => value >= 2000 && value <= 2100,
      `${label} must be between 2000 and 2100.`,
    );

const requiredRupiah = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required (use 0 for none).`)
    .transform((value, ctx) => {
      try {
        return parseRupiah(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a whole Rupiah amount (digits only).`,
        });
        return z.NEVER;
      }
    });

const optionalRupiah = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value, ctx) => {
      if (!value) return null;
      try {
        return parseRupiah(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a whole Rupiah amount (digits only).`,
        });
        return z.NEVER;
      }
    });

/** A whole Rupiah amount that must be greater than zero (a ledger receipt). */
const positiveRupiah = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, ctx) => {
      try {
        return parseRupiah(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a whole Rupiah amount (digits only).`,
        });
        return z.NEVER;
      }
    })
    .refine((value) => value > 0, `${label} must be greater than zero.`);

/**
 * Parse a signed whole-Rupiah amount as typed into a budget revision line: an
 * optional leading minus marks a cut, and the magnitude follows the same
 * grouping rules as every other money input ("1.234.567").
 */
export function parseSignedRupiah(input: string): Rupiah {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-');
  const magnitude = negative ? trimmed.slice(1) : trimmed;
  const value = parseRupiah(magnitude);
  return negative ? -value : value;
}

/**
 * A revision delta is signed (negative = cut, positive = addition) and must
 * never be zero: a zero line has no meaning and usually hides a mistake.
 */
const requiredSignedRupiah = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, ctx) => {
      try {
        const amount = parseSignedRupiah(value);
        if (amount === 0) {
          ctx.addIssue({ code: 'custom', message: `${label} must not be zero.` });
          return z.NEVER;
        }
        return amount;
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must be a whole Rupiah amount; prefix a cut with a minus sign (for example -1.234.567).`,
        });
        return z.NEVER;
      }
    });

export const idSchema = z.uuid('The record id is invalid.');
export const reasonSchema = requiredText('Reason for change', 1000);

const siCodeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required.')
  .max(20, 'Code must be at most 20 characters.')
  .regex(/^[A-Za-z0-9-]+$/, 'Code may only contain letters, digits and hyphens.');

// ---------------------------------------------------------------- strategic plan

export const planCreateSchema = z.object({
  name: requiredText('Plan name', 160),
  startFiscalYear: year('Start fiscal year'),
  endFiscalYear: year('End fiscal year'),
});

export const planUpdateSchema = planCreateSchema.extend({ id: idSchema, reason: reasonSchema });

export const planStatusSchema = z.object({ id: idSchema, reason: reasonSchema });

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
export type PlanStatusInput = z.infer<typeof planStatusSchema>;

// ---------------------------------------------------------------- strategic initiative

const initiativeFields = z.object({
  code: siCodeSchema,
  name: requiredText('Initiative name', 160),
  owner: optionalText(160),
  objective: optionalText(),
  /**
   * The SI envelope and the prior-consumed opening figure are held per
   * component (ADR-0006 §5). Both figures of each pair are required: the
   * migration from the old single numbers is explicit, never a proportional
   * split.
   */
  envelopeCapex: requiredRupiah('Capex envelope'),
  envelopeOpex: requiredRupiah('Opex envelope'),
  priorCapex: requiredRupiah('Prior program budget consumed (capex)'),
  priorOpex: requiredRupiah('Prior program budget consumed (opex)'),
  notes: optionalText(),
});

export const initiativeCreateSchema = initiativeFields.extend({ planId: idSchema });
export const initiativeUpdateSchema = initiativeFields.extend({ id: idSchema, reason: reasonSchema });
export const initiativeVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type InitiativeCreateInput = z.infer<typeof initiativeCreateSchema>;
export type InitiativeUpdateInput = z.infer<typeof initiativeUpdateSchema>;
export type InitiativeVoidInput = z.infer<typeof initiativeVoidSchema>;

// ---------------------------------------------------------------- annual plan

const fiscalYearSchema = year('Fiscal year');

export const annualPlanCreateSchema = z.object({
  planId: idSchema,
  fiscalYear: fiscalYearSchema,
  notes: optionalText(),
});

export const annualPlanStatusSchema = z.object({ id: idSchema, reason: reasonSchema });

export type AnnualPlanCreateInput = z.infer<typeof annualPlanCreateSchema>;
export type AnnualPlanStatusInput = z.infer<typeof annualPlanStatusSchema>;

// ---------------------------------------------------------------- annual program

const programCodeSchema = z
  .string()
  .trim()
  .min(1, 'Program code is required.')
  .max(40, 'Program code must be at most 40 characters.')
  .regex(/^[A-Za-z0-9-]+$/, 'Program code may only contain letters, digits and hyphens.');

const optionalUuid = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'The selected program is invalid.' });
      return z.NEVER;
    }
    return parsed.data;
  });

const programFields = z.object({
  code: programCodeSchema,
  name: requiredText('Program name', 160),
  siId: idSchema,
  prevProgramId: optionalUuid,
  capexBudget: requiredRupiah('Capex budget'),
  opexBudget: requiredRupiah('Opex budget'),
  notes: optionalText(),
});

export const programCreateSchema = programFields.extend({ annualPlanId: idSchema });
export const programUpdateSchema = programFields.extend({ id: idSchema, reason: reasonSchema });
export const programVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type ProgramCreateInput = z.infer<typeof programCreateSchema>;
export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>;
export type ProgramVoidInput = z.infer<typeof programVoidSchema>;

// ---------------------------------------------------------------- projects

const projectCodeSchema = z
  .string()
  .trim()
  .min(1, 'Project code is required.')
  .max(40, 'Project code must be at most 40 characters.')
  .regex(/^[A-Za-z0-9-]+$/, 'Project code may only contain letters, digits and hyphens.');

const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Document date must use the YYYY-MM-DD format.' });
      return z.NEVER;
    }
    return value;
  });

const optionalProjectCode = z
  .string()
  .trim()
  .max(40, 'Project code must be at most 40 characters.')
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^[A-Za-z0-9-]+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Project code may only contain letters, digits and hyphens.' });
      return z.NEVER;
    }
    return value;
  });

const projectFields = z.object({
  name: requiredText('Project name', 160),
  externalReference: optionalText(120),
  owner: optionalText(160),
  description: optionalText(),
  startFiscalYear: year('Start fiscal year'),
  endFiscalYear: year('End fiscal year'),
  allocatedBudgetFullLife: requiredRupiah('Full-life allocated budget'),
  submittedPrice: optionalRupiah('Submitted price'),
  finalDealPrice: optionalRupiah('Final deal price'),
  openingAllocated: optionalRupiah('Opening allocated budget').transform((value) => value ?? 0),
  openingCommitted: optionalRupiah('Opening open commitments').transform((value) => value ?? 0),
  openingSpent: optionalRupiah('Opening actual spend').transform((value) => value ?? 0),
});

export const projectCreateSchema = projectFields.extend({ originatingProgramId: idSchema, code: optionalProjectCode });
export const projectUpdateSchema = projectFields.extend({ id: idSchema, code: projectCodeSchema, reason: reasonSchema });
export const projectCancelSchema = z.object({ id: idSchema, reason: reasonSchema });

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ---------------------------------------------------------------- ijin prinsip

export const ijinPrinsipSaveSchema = z.object({
  projectId: idSchema,
  documentNumber: optionalText(120),
  documentDate: optionalDate,
  approvedAmount: requiredRupiah('Approved amount'),
  approver: optionalText(160),
  documentUrl: optionalText(1000),
  notes: optionalText(),
  reason: optionalText(1000),
});

export type IjinPrinsipSaveInput = z.infer<typeof ijinPrinsipSaveSchema>;

// ---------------------------------------------------------------- recurring ops

const recurringOpsFields = z.object({
  name: requiredText('Name', 160),
  categoryId: optionalUuid,
  owner: optionalText(160),
  opexBudget: requiredRupiah('Opex budget'),
  carryInOpex: optionalRupiah('Opex carry-in').transform((value) => value ?? 0),
  notes: optionalText(),
});

export const recurringOpsCreateSchema = recurringOpsFields.extend({ annualPlanId: idSchema });
export const recurringOpsUpdateSchema = recurringOpsFields.extend({ id: idSchema, reason: reasonSchema });
export const recurringOpsVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type RecurringOpsCreateInput = z.infer<typeof recurringOpsCreateSchema>;
export type RecurringOpsUpdateInput = z.infer<typeof recurringOpsUpdateSchema>;

// ---------------------------------------------------------------- project year allocations (M2)

const allocationFields = z.object({
  allocationCapex: requiredRupiah('Capex allocation'),
  allocationOpex: requiredRupiah('Opex allocation'),
  notes: optionalText(),
});

export const allocationCreateSchema = allocationFields.extend({
  projectId: idSchema,
  annualProgramId: idSchema,
});
export const allocationUpdateSchema = allocationFields.extend({ id: idSchema, reason: reasonSchema });
export const allocationVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type AllocationCreateInput = z.infer<typeof allocationCreateSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;

// ---------------------------------------------------------------- administration (M2.5)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const memberCreateSchema = z.object({
  name: requiredText('Name', 120),
  email: z
    .string()
    .trim()
    .max(254, 'Email must be at most 254 characters.')
    .regex(EMAIL_PATTERN, 'Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(200, 'Password must be at most 200 characters.'),
});

export const memberReasonSchema = z.object({ userId: idSchema, reason: reasonSchema });

export const memberPasswordResetSchema = z.object({
  userId: idSchema,
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(200, 'Password must be at most 200 characters.'),
  reason: reasonSchema,
});

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberReasonInput = z.infer<typeof memberReasonSchema>;
export type MemberPasswordResetInput = z.infer<typeof memberPasswordResetSchema>;

// ---------------------------------------------------------------- execution (M3)

const componentSchema = z.enum(['capex', 'opex']);
const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD date format.');

const commitmentFields = z.object({
  component: componentSchema,
  amount: requiredRupiah('Commitment amount'),
  commitmentDate: isoDateSchema,
  reference: optionalText(120),
  description: optionalText(),
  allocationId: optionalUuid,
  recurringOpsItemId: optionalUuid,
});

export const commitmentCreateSchema = commitmentFields;
export const commitmentUpdateSchema = commitmentFields.extend({ id: idSchema, reason: reasonSchema });
export const commitmentVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

const spendFields = z.object({
  component: componentSchema,
  amount: requiredRupiah('Spend amount'),
  spentOn: isoDateSchema,
  categoryId: optionalUuid,
  vendor: optionalText(160),
  reference: optionalText(120),
  description: optionalText(),
  settlementKind: z.enum(['current', 'prior_year_opening']),
  /**
   * The per-transaction treatment of a split that settles a commitment from a
   * closed annual plan (#98). Absent unless such a split exists; the form only
   * submits it when a closed-year commitment is in play, and the server
   * resolves the default (charge the current year).
   */
  postCloseTreatment: z.enum(['charge_current_year', 'charge_closed_year_reserve']).optional(),
  allocationId: optionalUuid,
  recurringOpsItemId: optionalUuid,
});

export const spendCreateSchema = spendFields;
export const spendUpdateSchema = spendFields.extend({ id: idSchema, reason: reasonSchema });
export const spendVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type CommitmentCreateInput = z.infer<typeof commitmentCreateSchema>;
export type CommitmentUpdateInput = z.infer<typeof commitmentUpdateSchema>;
export type SpendCreateInput = z.infer<typeof spendCreateSchema>;
export type SpendUpdateInput = z.infer<typeof spendUpdateSchema>;

// ---------------------------------------------------------------- year close (M4)

/**
 * A carry-over field on the close form. It must be filled in — a zero carry-over
 * is typed as `0`, not left blank — and it follows the same whole-Rupiah parsing
 * as every other money input (dots group thousands).
 */
export const carryOverAmountSchema = (label: string) => requiredRupiah(`${label} carry-over`);

/** Closing is irreversible: the owner must type `CLOSE FY<year>` (W4a). */
const closeConfirmationSchema = z
  .string()
  .min(1, 'Type the close confirmation phrase to confirm (for example CLOSE FY2027).')
  .max(40, 'The confirmation phrase must be at most 40 characters.');

export const closeFiscalYearSchema = z.object({
  annualPlanId: idSchema,
  reference: requiredText('Approval reference', 160),
  confirmation: closeConfirmationSchema,
});

export type CloseFiscalYearInput = z.infer<typeof closeFiscalYearSchema>;

// ---------------------------------------------------------------- carry-over ledger (ADR-0006 §2–3)

const carryOverEntityTypeSchema = z.enum(['program', 'allocation']);

/**
 * A manual management grant of carry-in (origin `manual`). It is a reasoned
 * receipt written to the ledger: no form writes the carry-in cache columns
 * anymore. The target annual plan is the plan the entity belongs to.
 */
export const manualCarryReceiptSchema = z.object({
  annualPlanId: idSchema,
  entityType: carryOverEntityTypeSchema,
  entityId: idSchema,
  component: componentSchema,
  amount: positiveRupiah('Carry-in amount'),
  reason: reasonSchema,
});

export type ManualCarryReceiptInput = z.infer<typeof manualCarryReceiptSchema>;

// ---------------------------------------------------------------- opening balances (W3b)

const openingControlFields = {
  controlEnvelopeCapex: requiredRupiah('Total envelope (capex)'),
  controlEnvelopeOpex: requiredRupiah('Total envelope (opex)'),
  controlPriorProgramBudgetUsedCapex: requiredRupiah(
    'Prior program budget consumed (capex)',
  ),
  controlPriorProgramBudgetUsedOpex: requiredRupiah(
    'Prior program budget consumed (opex)',
  ),
  controlProgramBudgets: requiredRupiah('In-app program budgets'),
  controlProgramCarryIn: requiredRupiah('Program carry-in'),
  controlProjectOpeningAllocated: requiredRupiah('Project opening allocated'),
  controlProjectOpeningCommitted: requiredRupiah('Project opening open commitments'),
  controlProjectOpeningSpent: requiredRupiah('Project opening spent'),
  controlProjectFullLifeAllocated: requiredRupiah('Project full-life allocated budget'),
};

export const openingReconciliationSaveSchema = z.object({
  planId: idSchema,
  reason: reasonSchema,
  ...openingControlFields,
});

export const openingReconciliationSignOffSchema = z.object({
  planId: idSchema,
  reason: reasonSchema,
});

export type OpeningReconciliationSaveInput = z.infer<typeof openingReconciliationSaveSchema>;
export type OpeningReconciliationSignOffInput = z.infer<
  typeof openingReconciliationSignOffSchema
>;

// ---------------------------------------------------------------- budget revisions (ADR-0006 §4 / #112)

/**
 * A revision line names its entity kind rather than a foreign key, because it
 * points at either an annual program or a project year allocation. The action
 * resolves the entity and validates the switch floor.
 */
const revisionEntityTypeSchema = z.enum(['program', 'allocation']);

export const budgetRevisionLineSchema = z.object({
  entityType: revisionEntityTypeSchema,
  entityId: idSchema,
  component: componentSchema,
  delta: requiredSignedRupiah('Line delta'),
});

/**
 * Posting a revision: the header (the per-plan number is assigned by the
 * action) plus at least one line. `decisionReference` may be omitted when the
 * formal decision does not exist yet — such a revision shows as awaiting the
 * decision — and is attached later as metadata.
 */
export const budgetRevisionCreateSchema = z.object({
  annualPlanId: idSchema,
  revisionDate: isoDateSchema,
  decisionReference: optionalText(160),
  reason: reasonSchema,
  lines: z.array(budgetRevisionLineSchema).min(1, 'Add at least one revision line.'),
});

/** Attach the formal decision to a posted revision: metadata only, lines stay frozen. */
export const budgetRevisionDecisionSchema = z.object({
  id: idSchema,
  decisionReference: requiredText('Decision reference', 160),
  reason: reasonSchema,
});

export type BudgetRevisionLineInput = z.infer<typeof budgetRevisionLineSchema>;
export type BudgetRevisionCreateInput = z.infer<typeof budgetRevisionCreateSchema>;
export type BudgetRevisionDecisionInput = z.infer<typeof budgetRevisionDecisionSchema>;

// ---------------------------------------------------------------- custom fields (#46)

export const customFieldEntityTypeSchema = z.enum(CUSTOM_FIELD_ENTITY_TYPES);

export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);

/** Hidden input + checkbox pair: 'off' when unchecked, 'on' when checked. */
const customFieldRequiredSchema = z.enum(['on', 'off']).transform((value) => value === 'on');

export const customFieldCreateSchema = z
  .object({
    entityType: customFieldEntityTypeSchema,
    name: requiredText('Field name', 80),
    type: customFieldTypeSchema,
    required: customFieldRequiredSchema,
    description: requiredText('Description', 500),
    /** Optional sample value: shown in the administration row and the import template. */
    example: optionalText(200),
  })
  .superRefine((field, ctx) => {
    // The template renders the example as a row the owner may copy, so it must be
    // a value this field's own parser accepts; otherwise it teaches a bad value.
    if (field.example === null) return;
    const parsed = parseCustomFieldValue(
      { name: 'Example value', type: field.type, required: false },
      field.example,
    );
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', path: ['example'], message: parsed.message });
    }
  });

export const customFieldUpdateSchema = customFieldCreateSchema.extend({
  id: idSchema,
  reason: reasonSchema,
});

export const customFieldRemoveSchema = z.object({ id: idSchema, reason: reasonSchema });

export const customFieldRestoreSchema = z.object({ id: idSchema, reason: reasonSchema });

/**
 * Move one field up or down in its entity's sequence (#73). The order is a
 * display preference, not a record edit: the action swaps two positions and
 * records the actor plus both positions in the audit trail, without asking for
 * a reason on every click.
 */
export const customFieldMoveSchema = z.object({
  id: idSchema,
  direction: z.enum(['up', 'down']),
});

export type CustomFieldCreateInput = z.infer<typeof customFieldCreateSchema>;
export type CustomFieldUpdateInput = z.infer<typeof customFieldUpdateSchema>;
export type CustomFieldRemoveInput = z.infer<typeof customFieldRemoveSchema>;
export type CustomFieldRestoreInput = z.infer<typeof customFieldRestoreSchema>;
export type CustomFieldMoveInput = z.infer<typeof customFieldMoveSchema>;
