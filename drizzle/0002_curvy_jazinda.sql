CREATE TABLE "project_year_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"annual_plan_id" uuid NOT NULL,
	"annual_program_id" uuid NOT NULL,
	"allocation_capex" bigint DEFAULT 0 NOT NULL,
	"allocation_opex" bigint DEFAULT 0 NOT NULL,
	"carry_in_capex" bigint DEFAULT 0 NOT NULL,
	"carry_in_opex" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_year_allocations_non_negative" CHECK ("project_year_allocations"."allocation_capex" >= 0 AND "project_year_allocations"."allocation_opex" >= 0 AND "project_year_allocations"."carry_in_capex" >= 0 AND "project_year_allocations"."carry_in_opex" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_year_allocations" ADD CONSTRAINT "project_year_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_year_allocations" ADD CONSTRAINT "project_year_allocations_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_year_allocations" ADD CONSTRAINT "project_year_allocations_annual_program_id_annual_programs_id_fk" FOREIGN KEY ("annual_program_id") REFERENCES "public"."annual_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_year_allocations" ADD CONSTRAINT "project_year_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_year_allocations" ADD CONSTRAINT "project_year_allocations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_year_allocations_project_plan_idx" ON "project_year_allocations" USING btree ("project_id","annual_plan_id");--> statement-breakpoint
CREATE INDEX "project_year_allocations_project_idx" ON "project_year_allocations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_year_allocations_program_idx" ON "project_year_allocations" USING btree ("annual_program_id");--> statement-breakpoint
CREATE INDEX "project_year_allocations_plan_idx" ON "project_year_allocations" USING btree ("annual_plan_id");