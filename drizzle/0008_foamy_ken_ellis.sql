-- #71, #73, #75: extend the custom-field entity set, add the administrator
-- field order, and add the per-user report column preference.
CREATE TABLE "report_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"report_key" text NOT NULL,
	"column_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_preferences_report_key_check" CHECK ("report_preferences"."report_key" IN ('si-five-year', 'annual-plan', 'project-register', 'budget-vs-actual'))
);
--> statement-breakpoint
ALTER TABLE "custom_field_values" DROP CONSTRAINT "custom_field_values_entity_type_check";--> statement-breakpoint
ALTER TABLE "custom_fields" DROP CONSTRAINT "custom_fields_entity_type_check";--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- #73: existing fields keep their creation order as their explicit position, one
-- sequence per entity type, so the first move-up/move-down swaps distinct values
-- instead of two zeros. New fields append at max(position) + 1 (see the action).
UPDATE "custom_fields" SET "position" = ranked."position"
FROM (
	SELECT "id", (row_number() OVER (PARTITION BY "entity_type" ORDER BY "created_at", "name")) - 1 AS "position"
	FROM "custom_fields"
) AS ranked
WHERE "custom_fields"."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "report_preferences" ADD CONSTRAINT "report_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_preferences_user_report_idx" ON "report_preferences" USING btree ("user_id","report_key");--> statement-breakpoint
CREATE INDEX "custom_fields_entity_position_idx" ON "custom_fields" USING btree ("entity_type","position");--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_entity_type_check" CHECK ("custom_field_values"."entity_type" IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item', 'ijin_prinsip', 'project_year_allocation', 'commitment_entry', 'spend_entry'));--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_entity_type_check" CHECK ("custom_fields"."entity_type" IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item', 'ijin_prinsip', 'project_year_allocation', 'commitment_entry', 'spend_entry'));