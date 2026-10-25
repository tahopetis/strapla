CREATE TYPE "public"."annual_plan_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."component" AS ENUM('capex', 'opex');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."strategic_plan_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "annual_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"status" "annual_plan_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annual_plans_fiscal_year_unique" UNIQUE("fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "annual_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annual_plan_id" uuid NOT NULL,
	"si_id" uuid NOT NULL,
	"prev_program_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capex_budget" bigint DEFAULT 0 NOT NULL,
	"opex_budget" bigint DEFAULT 0 NOT NULL,
	"carry_in_capex" bigint DEFAULT 0 NOT NULL,
	"carry_in_opex" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annual_programs_capex_non_negative" CHECK ("annual_programs"."capex_budget" >= 0),
	CONSTRAINT "annual_programs_opex_non_negative" CHECK ("annual_programs"."opex_budget" >= 0),
	CONSTRAINT "annual_programs_carry_non_negative" CHECK ("annual_programs"."carry_in_capex" >= 0 AND "annual_programs"."carry_in_opex" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ijin_prinsip_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_number" text,
	"document_date" date,
	"approved_amount" bigint DEFAULT 0 NOT NULL,
	"approver" text,
	"document_url" text,
	"notes" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ijin_prinsip_records_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "ijin_prinsip_amount_non_negative" CHECK ("ijin_prinsip_records"."approved_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"originating_program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"external_reference" text,
	"name" text NOT NULL,
	"description" text,
	"owner" text,
	"start_fiscal_year" integer NOT NULL,
	"end_fiscal_year" integer NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"cancelled_reason" text,
	"cancelled_at" timestamp with time zone,
	"allocated_budget_full_life" bigint DEFAULT 0 NOT NULL,
	"submitted_price" bigint,
	"final_deal_price" bigint,
	"opening_allocated" bigint DEFAULT 0 NOT NULL,
	"opening_committed" bigint DEFAULT 0 NOT NULL,
	"opening_spent" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code"),
	CONSTRAINT "projects_years_check" CHECK ("projects"."start_fiscal_year" <= "projects"."end_fiscal_year"),
	CONSTRAINT "projects_opening_non_negative" CHECK ("projects"."opening_allocated" >= 0 AND "projects"."opening_committed" >= 0 AND "projects"."opening_spent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_ops_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annual_plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"owner" text,
	"opex_budget" bigint DEFAULT 0 NOT NULL,
	"carry_in_opex" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_ops_opex_non_negative" CHECK ("recurring_ops_items"."opex_budget" >= 0),
	CONSTRAINT "recurring_ops_carry_non_negative" CHECK ("recurring_ops_items"."carry_in_opex" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spend_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "strategic_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"owner" text,
	"objective" text,
	"envelope_amount" bigint DEFAULT 0 NOT NULL,
	"prior_program_budget_used" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_initiatives_envelope_non_negative" CHECK ("strategic_initiatives"."envelope_amount" >= 0),
	CONSTRAINT "strategic_initiatives_prior_non_negative" CHECK ("strategic_initiatives"."prior_program_budget_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "strategic_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_fiscal_year" integer NOT NULL,
	"end_fiscal_year" integer NOT NULL,
	"status" "strategic_plan_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_plans_years_check" CHECK ("strategic_plans"."start_fiscal_year" <= "strategic_plans"."end_fiscal_year")
);
--> statement-breakpoint
ALTER TABLE "annual_plans" ADD CONSTRAINT "annual_plans_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_plans" ADD CONSTRAINT "annual_plans_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_plans" ADD CONSTRAINT "annual_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_plans" ADD CONSTRAINT "annual_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_programs" ADD CONSTRAINT "annual_programs_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_programs" ADD CONSTRAINT "annual_programs_si_id_strategic_initiatives_id_fk" FOREIGN KEY ("si_id") REFERENCES "public"."strategic_initiatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_programs" ADD CONSTRAINT "annual_programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annual_programs" ADD CONSTRAINT "annual_programs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ijin_prinsip_records" ADD CONSTRAINT "ijin_prinsip_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ijin_prinsip_records" ADD CONSTRAINT "ijin_prinsip_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ijin_prinsip_records" ADD CONSTRAINT "ijin_prinsip_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_originating_program_id_annual_programs_id_fk" FOREIGN KEY ("originating_program_id") REFERENCES "public"."annual_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_ops_items" ADD CONSTRAINT "recurring_ops_items_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_ops_items" ADD CONSTRAINT "recurring_ops_items_category_id_spend_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."spend_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_ops_items" ADD CONSTRAINT "recurring_ops_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_ops_items" ADD CONSTRAINT "recurring_ops_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annual_plans_plan_idx" ON "annual_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annual_programs_plan_code_idx" ON "annual_programs" USING btree ("annual_plan_id","code");--> statement-breakpoint
CREATE INDEX "annual_programs_plan_idx" ON "annual_programs" USING btree ("annual_plan_id");--> statement-breakpoint
CREATE INDEX "annual_programs_si_idx" ON "annual_programs" USING btree ("si_id");--> statement-breakpoint
CREATE INDEX "projects_program_idx" ON "projects" USING btree ("originating_program_id");--> statement-breakpoint
CREATE INDEX "recurring_ops_plan_idx" ON "recurring_ops_items" USING btree ("annual_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategic_initiatives_plan_code_idx" ON "strategic_initiatives" USING btree ("plan_id","code");--> statement-breakpoint
CREATE INDEX "strategic_initiatives_plan_idx" ON "strategic_initiatives" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategic_plans_one_active_idx" ON "strategic_plans" USING btree ("status") WHERE "strategic_plans"."status" = 'active';