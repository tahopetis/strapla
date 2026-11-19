CREATE TABLE "opening_balance_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"control_envelope" bigint DEFAULT 0 NOT NULL,
	"control_prior_program_budget_used" bigint DEFAULT 0 NOT NULL,
	"control_program_budgets" bigint DEFAULT 0 NOT NULL,
	"control_program_carry_in" bigint DEFAULT 0 NOT NULL,
	"control_project_opening_allocated" bigint DEFAULT 0 NOT NULL,
	"control_project_opening_committed" bigint DEFAULT 0 NOT NULL,
	"control_project_opening_spent" bigint DEFAULT 0 NOT NULL,
	"control_project_full_life_allocated" bigint DEFAULT 0 NOT NULL,
	"signed_off_at" timestamp with time zone,
	"signed_off_by" uuid,
	"sign_off_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balance_reconciliations_plan_id_unique" UNIQUE("plan_id"),
	CONSTRAINT "opening_balance_reconciliations_non_negative" CHECK ("opening_balance_reconciliations"."control_envelope" >= 0
        AND "opening_balance_reconciliations"."control_prior_program_budget_used" >= 0
        AND "opening_balance_reconciliations"."control_program_budgets" >= 0
        AND "opening_balance_reconciliations"."control_program_carry_in" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_allocated" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_committed" >= 0
        AND "opening_balance_reconciliations"."control_project_opening_spent" >= 0
        AND "opening_balance_reconciliations"."control_project_full_life_allocated" >= 0)
);
--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD CONSTRAINT "opening_balance_reconciliations_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD CONSTRAINT "opening_balance_reconciliations_signed_off_by_users_id_fk" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD CONSTRAINT "opening_balance_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_reconciliations" ADD CONSTRAINT "opening_balance_reconciliations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;