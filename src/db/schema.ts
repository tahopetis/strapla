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
    envelopeCapex: money('envelope_capex').notNull().default(0),
    envelopeOpex: money('envelope_opex').notNull().default(0),
    /** Opening balance: program budget already consumed before the first in-app fiscal year. */
    priorProgramBudgetUsedCapex: money('prior_program_budget_used_capex').notNull().default(0),
    priorProgramBudgetUsedOpex: money('prior_program_budget_used_opex').notNull().default(0),
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
    check(
      'strategic_initiatives_envelope_components_non_negative',
      sql`${table.envelopeCapex} >= 0 AND ${table.envelopeOpex} >= 0`,
    ),
    check(
      'strategic_initiatives_prior_components_non_negative',
      sql`${table.priorProgramBudgetUsedCapex} >= 0 AND ${table.priorProgramBudgetUsedOpex} >= 0`,
    ),
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
    closeReference: text('close_reference'),
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
export type ProjectYearAllocation = typeof projectYearAllocations.$inferSelect;
export type CommitmentEntry = typeof commitmentEntries.$inferSelect;
export type SpendEntry = typeof spendEntries.$inferSelect;
export type CommitmentSettlement = typeof commitmentSettlements.$inferSelect;
export type SettlementKind = (typeof settlementKind.enumValues)[number];
export type PostCloseTreatment = (typeof postCloseTreatment.enumValues)[number];
export type CarryOverEntry = typeof carryOverEntries.$inferSelect;
export type CarryOverEntityType = (typeof carryOverEntityType.enumValues)[number];
export type PlanComponent = (typeof component.enumValues)[number];

// ---------------------------------------------------------------- funding (M2)

export const projectYearAllocations = pgTable(
  'project_year_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    annualPlanId: uuid('annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    annualProgramId: uuid('annual_program_id')
      .notNull()
      .references(() => annualPrograms.id),
    allocationCapex: money('allocation_capex').notNull().default(0),
    allocationOpex: money('allocation_opex').notNull().default(0),
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
    uniqueIndex('project_year_allocations_project_plan_idx').on(table.projectId, table.annualPlanId),
    index('project_year_allocations_project_idx').on(table.projectId),
    index('project_year_allocations_program_idx').on(table.annualProgramId),
    index('project_year_allocations_plan_idx').on(table.annualPlanId),
    check(
      'project_year_allocations_non_negative',
      sql`${table.allocationCapex} >= 0 AND ${table.allocationOpex} >= 0 AND ${table.carryInCapex} >= 0 AND ${table.carryInOpex} >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------- execution (M3)

export const settlementKind = pgEnum('settlement_kind', ['current', 'prior_year_opening']);

/**
 * The per-transaction treatment of a split that settles a commitment from a
 * closed annual plan (issue #98, ADR-0003 §4a). Null when no closed-year split
 * is in play. `charge_current_year` counts the closed-year portion as
 * current-year spend; `charge_closed_year_reserve` leaves it in the closed year
 * and reports it as a prior-year settlement / post-close reserve.
 */
export const postCloseTreatment = pgEnum('post_close_treatment', [
  'charge_current_year',
  'charge_closed_year_reserve',
]);

export const commitmentEntries = pgTable(
  'commitment_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectYearAllocationId: uuid('project_year_allocation_id').references(
      () => projectYearAllocations.id,
    ),
    recurringOpsItemId: uuid('recurring_ops_item_id').references(() => recurringOpsItems.id),
    component: component('component').notNull(),
    amount: money('amount').notNull(),
    commitmentDate: date('commitment_date', { mode: 'string' }).notNull(),
    reference: text('reference'),
    description: text('description'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index('commitment_entries_allocation_idx').on(table.projectYearAllocationId),
    index('commitment_entries_recurring_idx').on(table.recurringOpsItemId),
    check('commitment_entries_amount_positive', sql`${table.amount} > 0`),
    check(
      'commitment_entries_one_parent',
      sql`(
        (${table.projectYearAllocationId} IS NOT NULL AND ${table.recurringOpsItemId} IS NULL)
        OR (${table.projectYearAllocationId} IS NULL AND ${table.recurringOpsItemId} IS NOT NULL)
      )`,
    ),
    check(
      'commitment_entries_recurring_opex_only',
      sql`${table.recurringOpsItemId} IS NULL OR ${table.component} = 'opex'`,
    ),
  ],
);

export const spendEntries = pgTable(
  'spend_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectYearAllocationId: uuid('project_year_allocation_id').references(
      () => projectYearAllocations.id,
    ),
    recurringOpsItemId: uuid('recurring_ops_item_id').references(() => recurringOpsItems.id),
    component: component('component').notNull(),
    amount: money('amount').notNull(),
    spentOn: date('spent_on', { mode: 'string' }).notNull(),
    categoryId: uuid('category_id').references(() => spendCategories.id),
    vendor: text('vendor'),
    reference: text('reference'),
    description: text('description'),
    settlementKind: settlementKind('settlement_kind').notNull().default('current'),
    postCloseTreatment: postCloseTreatment('post_close_treatment'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index('spend_entries_allocation_idx').on(table.projectYearAllocationId),
    index('spend_entries_recurring_idx').on(table.recurringOpsItemId),
    check('spend_entries_amount_positive', sql`${table.amount} > 0`),
    check(
      'spend_entries_one_parent',
      sql`(
        (${table.projectYearAllocationId} IS NOT NULL AND ${table.recurringOpsItemId} IS NULL)
        OR (${table.projectYearAllocationId} IS NULL AND ${table.recurringOpsItemId} IS NOT NULL)
      )`,
    ),
    check(
      'spend_entries_recurring_opex_only',
      sql`${table.recurringOpsItemId} IS NULL OR ${table.component} = 'opex'`,
    ),
  ],
);

export const commitmentSettlements = pgTable(
  'commitment_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spendEntryId: uuid('spend_entry_id')
      .notNull()
      .references(() => spendEntries.id),
    commitmentEntryId: uuid('commitment_entry_id')
      .notNull()
      .references(() => commitmentEntries.id),
    amount: money('amount').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('commitment_settlements_pair_idx').on(table.spendEntryId, table.commitmentEntryId),
    index('commitment_settlements_commitment_idx').on(table.commitmentEntryId),
    check('commitment_settlements_amount_positive', sql`${table.amount} > 0`),
  ],
);

// ---------------------------------------------------------------- year close (M4)

export const carryOverEntityType = pgEnum('carry_over_entity_type', ['program', 'allocation']);

export const carryOverEntries = pgTable(
  'carry_over_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceAnnualPlanId: uuid('source_annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    targetAnnualPlanId: uuid('target_annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    entityType: carryOverEntityType('entity_type').notNull(),
    sourceEntityId: uuid('source_entity_id').notNull(),
    targetEntityId: uuid('target_entity_id').notNull(),
    component: component('component').notNull(),
    amount: money('amount').notNull(),
    approvalReference: text('approval_reference').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('carry_over_entries_source_idx').on(table.sourceAnnualPlanId),
    uniqueIndex('carry_over_entries_unique_idx').on(
      table.sourceAnnualPlanId,
      table.entityType,
      table.sourceEntityId,
      table.component,
    ),
    check('carry_over_entries_amount_non_negative', sql`${table.amount} >= 0`),
  ],
);

// ---------------------------------------------------------------- budget revisions (ADR-0006 §4)

/**
 * An immutable, numbered in-year budget revision (#112, ADR-0006 §4). Once an
 * annual plan is active its program budgets are frozen; changes are posted as a
 * revision header plus signed lines, applied atomically, and corrected only by
 * a new revision. The number is per annual plan (one plan per fiscal year), so
 * it renders as `REV-2027-001`.
 *
 * `decision_reference` is nullable because a revision may be posted before the
 * steering committee decides ("awaiting decision reference"); attaching it
 * later is metadata only and never touches the lines.
 */
export const budgetRevisionEntityType = pgEnum('budget_revision_entity_type', [
  'program',
  'allocation',
]);

export const budgetRevisions = pgTable(
  'budget_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    annualPlanId: uuid('annual_plan_id')
      .notNull()
      .references(() => annualPlans.id),
    /** Per annual plan (fiscal year) sequence. */
    number: integer('number').notNull(),
    revisionDate: date('revision_date', { mode: 'string' }).notNull(),
    decisionReference: text('decision_reference'),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('budget_revisions_plan_number_idx').on(table.annualPlanId, table.number),
    index('budget_revisions_plan_idx').on(table.annualPlanId),
  ],
);

/**
 * One signed delta on an annual program's budget or a project year
 * allocation's amount, per component (#112, ADR-0006 §4). Negative cuts,
 * positive additions; never zero. A capex/opex switch is two lines in the same
 * component — capex and opex never offset each other. Lines are immutable; a
 * correction is a new revision.
 */
export const budgetRevisionLines = pgTable(
  'budget_revision_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => budgetRevisions.id, { onDelete: 'restrict' }),
    entityType: budgetRevisionEntityType('entity_type').notNull(),
    /** Annual program id or project year allocation id, matching entity_type. */
    entityId: uuid('entity_id').notNull(),
    component: component('component').notNull(),
    delta: money('delta').notNull(),
  },
  (table) => [
    uniqueIndex('budget_revision_lines_unique_idx').on(
      table.revisionId,
      table.entityType,
      table.entityId,
      table.component,
    ),
    index('budget_revision_lines_entity_idx').on(table.entityType, table.entityId),
    check('budget_revision_lines_delta_non_zero', sql`${table.delta} <> 0`),
  ],
);

export type BudgetRevision = typeof budgetRevisions.$inferSelect;
export type NewBudgetRevision = typeof budgetRevisions.$inferInsert;
export type BudgetRevisionLine = typeof budgetRevisionLines.$inferSelect;
export type NewBudgetRevisionLine = typeof budgetRevisionLines.$inferInsert;
export type BudgetRevisionEntityType = (typeof budgetRevisionEntityType.enumValues)[number];

// ---------------------------------------------------------------- opening balances (W3b)

/**
 * The owner's control totals for the one-time opening load, per strategic plan,
 * plus the one-time sign-off. The in-app totals are derived from the records; the
 * difference is computed in the UI. A signed-off reconciliation is read-only.
 */
export const openingBalanceReconciliations = pgTable(
  'opening_balance_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => strategicPlans.id)
      .unique(),
    controlEnvelopeCapex: money('control_envelope_capex').notNull().default(0),
    controlEnvelopeOpex: money('control_envelope_opex').notNull().default(0),
    controlPriorProgramBudgetUsedCapex: money('control_prior_program_budget_used_capex')
      .notNull()
      .default(0),
    controlPriorProgramBudgetUsedOpex: money('control_prior_program_budget_used_opex')
      .notNull()
      .default(0),
    controlProgramBudgets: money('control_program_budgets').notNull().default(0),
    controlProgramCarryIn: money('control_program_carry_in').notNull().default(0),
    controlProjectOpeningAllocated: money('control_project_opening_allocated')
      .notNull()
      .default(0),
    controlProjectOpeningCommitted: money('control_project_opening_committed')
      .notNull()
      .default(0),
    controlProjectOpeningSpent: money('control_project_opening_spent').notNull().default(0),
    controlProjectFullLifeAllocated: money('control_project_full_life_allocated')
      .notNull()
      .default(0),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
    signedOffBy: uuid('signed_off_by').references(() => users.id),
    signOffReason: text('sign_off_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    check(
      'opening_balance_reconciliations_controls_non_negative',
      sql`${table.controlEnvelopeCapex} >= 0
        AND ${table.controlEnvelopeOpex} >= 0
        AND ${table.controlPriorProgramBudgetUsedCapex} >= 0
        AND ${table.controlPriorProgramBudgetUsedOpex} >= 0
        AND ${table.controlProgramBudgets} >= 0
        AND ${table.controlProgramCarryIn} >= 0
        AND ${table.controlProjectOpeningAllocated} >= 0
        AND ${table.controlProjectOpeningCommitted} >= 0
        AND ${table.controlProjectOpeningSpent} >= 0
        AND ${table.controlProjectFullLifeAllocated} >= 0`,
    ),
  ],
);

export type OpeningBalanceReconciliation = typeof openingBalanceReconciliations.$inferSelect;
export type NewOpeningBalanceReconciliation =
  typeof openingBalanceReconciliations.$inferInsert;
export type NewStrategicInitiative = typeof strategicInitiatives.$inferInsert;
export type NewAnnualProgram = typeof annualPrograms.$inferInsert;
export type NewProject = typeof projects.$inferInsert;
export type NewIjinPrinsipRecord = typeof ijinPrinsipRecords.$inferInsert;

// ---------------------------------------------------------------- custom fields (#46)

/**
 * The admin-defined field registry: typed extra fields per entity, one
 * deployment per organisation (G5). Values live in `custom_field_values`,
 * keyed by field id so renaming a field never rewrites recorded data. A custom
 * field never touches `remaining`, flags, allocations or an existing report
 * total (G1); the plan-record entities listed in the check are the supported
 * surface (#71 added ijin prinsip, project year allocation, commitment entry and
 * spend entry to the original four).
 *
 * Removal follows the app's no-delete convention: the definition is archived
 * (`archived_at` + reason) and its recorded values are kept. The unique index
 * is partial, so archiving a field frees its name for a new definition.
 *
 * `position` is the administrator-controlled order (#73). New fields append at
 * the end of their entity's sequence; archived fields drop out of the sequence
 * because every registry read filters them out first. Ordering is applied in the
 * one registry read, so forms, panels, reports and exports all agree.
 */
export const customFields = pgTable(
  'custom_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    name: text('name').notNull(),
    /** Stable machine key, derived once from the name; the W9 field list keys on it. */
    key: text('key').notNull(),
    type: text('type').notNull(),
    required: boolean('required').notNull().default(false),
    description: text('description').notNull(),
    /** Optional sample value shown in the administration row and the import template. */
    example: text('example').notNull().default(''),
    /** Administrator-controlled sort order within one entity type; ties fall back to creation order. */
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedReason: text('archived_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('custom_fields_entity_name_idx')
      .on(table.entityType, table.name)
      .where(sql`${table.archivedAt} IS NULL`),
    uniqueIndex('custom_fields_entity_key_idx')
      .on(table.entityType, table.key)
      .where(sql`${table.archivedAt} IS NULL`),
    index('custom_fields_entity_idx').on(table.entityType),
    index('custom_fields_entity_position_idx').on(table.entityType, table.position),
    check('custom_fields_entity_type_check', sql`${table.entityType} IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item', 'ijin_prinsip', 'project_year_allocation', 'commitment_entry', 'spend_entry')`),
    check('custom_fields_type_check', sql`${table.type} IN ('text', 'number', 'date')`),
  ],
);

/** One row per record that has extra values; the JSON object is keyed by field id. */
export const customFieldValues = pgTable(
  'custom_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    values: jsonb('values').$type<Record<string, string | number>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('custom_field_values_entity_idx').on(table.entityType, table.entityId),
    check(
      'custom_field_values_entity_type_check',
      sql`${table.entityType} IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item', 'ijin_prinsip', 'project_year_allocation', 'commitment_entry', 'spend_entry')`,
    ),
  ],
);

/**
 * A report's remembered custom-column selection, one row per user and report
 * (issue #75). The selection is a list of field ids, resolved against the live
 * registry on read: a field archived since the choice was saved simply drops
 * out, and `[]` (a saved row with no ids) means "no extra columns", distinct
 * from "never chosen", which shows every active field.
 *
 * Reading a report never writes here; an explicit `?columns=` value wins for
 * that view and is not persisted. Only the report's "save selection" action
 * (and the export's own explicit value) change the preference.
 */
export const reportPreferences = pgTable(
  'report_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    reportKey: text('report_key').notNull(),
    /** Selected custom-field ids, in registry order at read time; never trusted as-is. */
    columnIds: jsonb('column_ids').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('report_preferences_user_report_idx').on(table.userId, table.reportKey),
    check(
      'report_preferences_report_key_check',
      sql`${table.reportKey} IN ('si-five-year', 'annual-plan', 'project-register', 'budget-vs-actual')`,
    ),
  ],
);

export type CustomField = typeof customFields.$inferSelect;
export type ReportPreference = typeof reportPreferences.$inferSelect;
