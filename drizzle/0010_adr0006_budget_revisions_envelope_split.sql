CREATE TYPE "public"."budget_revision_entity_type" AS ENUM('program', 'allocation');--> statement-breakpoint
CREATE TABLE "budget_revision_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"entity_type" "budget_revision_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"component" "component" NOT NULL,
	"delta" bigint NOT NULL,
	CONSTRAINT "budget_revision_lines_delta_non_zero" CHECK ("budget_revision_lines"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "budget_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annual_plan_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"revision_date" date NOT NULL,
	"decision_reference" text,
	"reason" text NOT NULL,
	"created_by" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" DROP CONSTRAINT "opening_balance_reconciliations_non_negative";--> statement-breakpoint
ALTER TABLE "strategic_initiatives" DROP CONSTRAINT "strategic_initiatives_envelope_non_negative";--> statement-breakpoint
ALTER TABLE "strategic_initiatives" DROP CONSTRAINT "strategic_initiatives_prior_non_negative";--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD COLUMN "control_envelope_capex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD COLUMN "control_envelope_opex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD COLUMN "control_prior_program_budget_used_capex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD COLUMN "control_prior_program_budget_used_opex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD COLUMN "envelope_capex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD COLUMN "envelope_opex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD COLUMN "prior_program_budget_used_capex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD COLUMN "prior_program_budget_used_opex" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_revision_lines" ADD CONSTRAINT "budget_revision_lines_revision_id_budget_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."budget_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_revision_lines_unique_idx" ON "budget_revision_lines" USING btree ("revision_id","entity_type","entity_id","component");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_revisions_plan_number_idx" ON "budget_revisions" USING btree ("annual_plan_id","number");--> statement-breakpoint
CREATE INDEX "budget_revisions_plan_idx" ON "budget_revisions" USING btree ("annual_plan_id");--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" DROP COLUMN "control_envelope";--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" DROP COLUMN "control_prior_program_budget_used";--> statement-breakpoint
ALTER TABLE "strategic_initiatives" DROP COLUMN "envelope_amount";--> statement-breakpoint
ALTER TABLE "strategic_initiatives" DROP COLUMN "prior_program_budget_used";--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD CONSTRAINT "opening_balance_reconciliations_controls_non_negative" CHECK ("opening_balance_reconciliations"."control_envelope_capex" >= 0
        AND "opening_balance_reconciliations"."control_envelope_opex" >= 0
        AND "opening_balance_reconciliations"."control_prior_program_budget_used_capex" >= 0
        AND "opening_balance_reconciliations"."control_prior_program_budget_used_opex" >= 0
        AND "opening_balance_reconciliations"."control_program_budgets" >= 0
        AND "opening_balance_reconciliations"."control_program_carry_in" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_allocated" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_committed" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_spent" >= 0
        AND "opening_balance_reconciliations"."control_project_full_life_allocated" >= 0);--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_envelope_components_non_negative" CHECK ("strategic_initiatives"."envelope_capex" >= 0 AND "strategic_initiatives"."envelope_opex" >= 0);--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_prior_components_non_negative" CHECK ("strategic_initiatives"."prior_program_budget_used_capex" >= 0 AND "strategic_initiatives"."prior_program_budget_used_opex" >= 0);