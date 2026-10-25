CREATE TYPE "public"."carry_over_entity_type" AS ENUM('program', 'allocation');--> statement-breakpoint
CREATE TABLE "carry_over_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_annual_plan_id" uuid NOT NULL,
	"target_annual_plan_id" uuid NOT NULL,
	"entity_type" "carry_over_entity_type" NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"component" "component" NOT NULL,
	"amount" bigint NOT NULL,
	"approval_reference" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carry_over_entries_amount_non_negative" CHECK ("carry_over_entries"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "annual_plans" ADD COLUMN "close_reference" text;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD CONSTRAINT "carry_over_entries_source_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("source_annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD CONSTRAINT "carry_over_entries_target_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("target_annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD CONSTRAINT "carry_over_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carry_over_entries_source_idx" ON "carry_over_entries" USING btree ("source_annual_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carry_over_entries_unique_idx" ON "carry_over_entries" USING btree ("source_annual_plan_id","entity_type","source_entity_id","component");