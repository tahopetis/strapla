import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Identity and audit tables are from M0. Planning tables are added by M1;
 * funding tables (project year allocations, commitments, spend) follow in M2/M3.
 * The target schema and invariants are documented in docs/data-model.md.
 */

export const strategicPlanStatus = pgEnum('strategic_plan_status', ['draft', 'active', 'archived']);
export const annualPlanStatus = pgEnum('annual_plan_status', ['draft', 'active', 'closed']);
export const projectStatus = pgEnum('project_status', ['active', 'cancelled']);
export const component = pgEnum('component', ['capex', 'opex']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

const money = (name: string) => bigint(name, { mode: 'number' });

// ---------------------------------------------------------------- identity

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_created_at_idx').on(table.createdAt),
  ],
);

// ---------------------------------------------------------------- reference data

export const spendCategories = pgTable('spend_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------- plan

export const strategicPlans = pgTable(
  'strategic_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    startFiscalYear: integer('start_fiscal_year').notNull(),
    endFiscalYear: integer('end_fiscal_year').notNull(),
    status: strategicPlanStatus('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    check('strategic_plans_years_check', sql`${table.startFiscalYear} <= ${table.endFiscalYear}`),
    uniqueIndex('strategic_plans_one_active_idx')
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const strategicInitiatives = pgTable(
  'strategic_initiatives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => strategicPlans.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    owner: text('owner'),
    objective: text('objective'),
    envelopeAmount: money('envelope_amount').notNull().default(0),
    /** Opening balance: program budget already consumed before the first in-app fiscal year. */
    priorProgramBudgetUsed: money('prior_program_budget_used').notNull().default(0),
    notes: text('notes'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('strategic_initiatives_plan_code_idx').on(table.planId, table.code),
    index('strategic_initiatives_plan_idx').on(table.planId),
    check('strategic_initiatives_envelope_non_negative', sql`${table.envelopeAmount} >= 0`),
    check('strategic_initiatives_prior_non_negative', sql`${table.priorProgramBudgetUsed} >= 0`),
  ],
);

export const annualPlans = pgTable(
  'annual_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => strategicPlans.id),
    fiscalYear: integer('fiscal_year').notNull().unique(),
    status: annualPlanStatus('status').notNull().default('draft'),
    notes: text('notes'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [index('annual_plans_plan_idx').on(table.planId)],
);

export const annualPrograms = pgTable(
  'annual_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    annualPlanId: uuid('annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    siId: uuid('si_id')
      .notNull()
      .references(() => strategicInitiatives.id),
    /** Continuation link: the previous year's program of the same thread. */
    prevProgramId: uuid('prev_program_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    capexBudget: money('capex_budget').notNull().default(0),
    opexBudget: money('opex_budget').notNull().default(0),
    carryInCapex: money('carry_in_capex').notNull().default(0),
    carryInOpex: money('carry_in_opex').notNull().default(0),
    notes: text('notes'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('annual_programs_plan_code_idx').on(table.annualPlanId, table.code),
    index('annual_programs_plan_idx').on(table.annualPlanId),
    index('annual_programs_si_idx').on(table.siId),
    check('annual_programs_capex_non_negative', sql`${table.capexBudget} >= 0`),
    check('annual_programs_opex_non_negative', sql`${table.opexBudget} >= 0`),
    check(
      'annual_programs_carry_non_negative',
      sql`${table.carryInCapex} >= 0 AND ${table.carryInOpex} >= 0`,
    ),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originatingProgramId: uuid('originating_program_id')
      .notNull()
      .references(() => annualPrograms.id),
    code: text('code').notNull().unique(),
    externalReference: text('external_reference'),
    name: text('name').notNull(),
    description: text('description'),
    owner: text('owner'),
    startFiscalYear: integer('start_fiscal_year').notNull(),
    endFiscalYear: integer('end_fiscal_year').notNull(),
    status: projectStatus('status').notNull().default('active'),
    cancelledReason: text('cancelled_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** Full-life figures (whole project, not per year). */
    allocatedBudgetFullLife: money('allocated_budget_full_life').notNull().default(0),
    submittedPrice: money('submitted_price'),
    finalDealPrice: money('final_deal_price'),
    /** Opening balances for data that predates the app (FY2027 is the first in-app year). */
    openingAllocated: money('opening_allocated').notNull().default(0),
    openingCommitted: money('opening_committed').notNull().default(0),
    openingSpent: money('opening_spent').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index('projects_program_idx').on(table.originatingProgramId),
    check('projects_years_check', sql`${table.startFiscalYear} <= ${table.endFiscalYear}`),
    check(
      'projects_opening_non_negative',
      sql`${table.openingAllocated} >= 0 AND ${table.openingCommitted} >= 0 AND ${table.openingSpent} >= 0`,
    ),
  ],
);

export const ijinPrinsipRecords = pgTable(
  'ijin_prinsip_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id)
      .unique(),
    documentNumber: text('document_number'),
    documentDate: date('document_date', { mode: 'string' }),
    approvedAmount: money('approved_amount').notNull().default(0),
    approver: text('approver'),
    /** Link to the document (no uploads in v1, charter §4 / A14). */
    documentUrl: text('document_url'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [check('ijin_prinsip_amount_non_negative', sql`${table.approvedAmount} >= 0`)],
);

export const recurringOpsItems = pgTable(
  'recurring_ops_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    annualPlanId: uuid('annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => spendCategories.id),
    owner: text('owner'),
    opexBudget: money('opex_budget').notNull().default(0),
    carryInOpex: money('carry_in_opex').notNull().default(0),
    notes: text('notes'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index('recurring_ops_plan_idx').on(table.annualPlanId),
    check('recurring_ops_opex_non_negative', sql`${table.opexBudget} >= 0`),
    check('recurring_ops_carry_non_negative', sql`${table.carryInOpex} >= 0`),
  ],
);

// ---------------------------------------------------------------- types

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditEntry = typeof auditEntries.$inferSelect;
export type StrategicPlan = typeof strategicPlans.$inferSelect;
export type StrategicInitiative = typeof strategicInitiatives.$inferSelect;
export type AnnualPlan = typeof annualPlans.$inferSelect;
export type AnnualProgram = typeof annualPrograms.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type IjinPrinsipRecord = typeof ijinPrinsipRecords.$inferSelect;
export type RecurringOpsItem = typeof recurringOpsItems.$inferSelect;
export type SpendCategory = typeof spendCategories.$inferSelect;
export type PlanComponent = (typeof component.enumValues)[number];
