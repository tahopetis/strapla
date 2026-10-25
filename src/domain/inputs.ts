import { z } from 'zod';
import { parseRupiah } from './money';

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
  envelopeAmount: requiredRupiah('Envelope'),
  priorProgramBudgetUsed: optionalRupiah('Prior program budget consumed').transform(
    (value) => value ?? 0,
  ),
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
  carryInCapex: optionalRupiah('Capex carry-in').transform((value) => value ?? 0),
  carryInOpex: optionalRupiah('Opex carry-in').transform((value) => value ?? 0),
  notes: optionalText(),
});

export const programCreateSchema = programFields.extend({ annualPlanId: idSchema });
export const programUpdateSchema = programFields.extend({ id: idSchema, reason: reasonSchema });
export const programVoidSchema = z.object({ id: idSchema, reason: reasonSchema });

export type ProgramCreateInput = z.infer<typeof programCreateSchema>;
export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>;
export type ProgramVoidInput = z.infer<typeof programVoidSchema>;
