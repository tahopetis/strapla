CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_values_entity_type_check" CHECK ("custom_field_values"."entity_type" IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item'))
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_fields_entity_type_check" CHECK ("custom_fields"."entity_type" IN ('strategic_initiative', 'annual_program', 'project', 'recurring_ops_item')),
	CONSTRAINT "custom_fields_type_check" CHECK ("custom_fields"."type" IN ('text', 'number', 'date'))
);
--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_entity_idx" ON "custom_field_values" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_entity_name_idx" ON "custom_fields" USING btree ("entity_type","name") WHERE "custom_fields"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_entity_key_idx" ON "custom_fields" USING btree ("entity_type","key") WHERE "custom_fields"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "custom_fields_entity_idx" ON "custom_fields" USING btree ("entity_type");--> statement-breakpoint
-- W9 field list -> registry, forward only (issue #46). The one committed owner
-- column on the opening-balance import becomes the first registry entry, keyed
-- by the W9 field name so the import and the registry share one identifier.
-- Later registry changes happen through the administration screen, never here.
INSERT INTO "custom_fields" ("entity_type", "name", "key", "type", "required", "description")
VALUES ('project', 'Procurement method', 'procurementMethod', 'text', false, 'Owner-added column: how the project is procured (metadata, never money).');
